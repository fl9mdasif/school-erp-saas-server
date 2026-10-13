import { Types } from 'mongoose';
import { AppError } from '../../errors/AppError';
import { localDateEnd, localDateStart, todayLocal } from '../../lib/localDate';
import { toSkip, type PageParams } from '../../lib/pagination';
import { withTransaction } from '../../lib/transaction';
import { writeAudit } from '../auditLog/auditLog.model';
import { nextSeq } from '../counter/counter.model';
import { Invoice } from '../invoice/invoice.model';
import { assertInvoiceAccess } from '../invoice/invoice.service';
import { LedgerEntry } from '../ledger/ledgerEntry.model';
import { Student } from '../student/student.model';
import { Payment } from './payment.model';

interface Auth {
  userId: Types.ObjectId;
  role: string;
}

export interface CreatePaymentInput {
  studentId: string;
  amount: number;
  method: string;
  allocations?: { invoiceId: string; amount: number }[];
  providerRef?: string;
  note?: string;
  receivedAt?: Date;
}

/** Atomically applies a payment amount to an invoice. Fails if the invoice cannot take it (no overpay, even under races). */
const applyToInvoice = async (invoiceId: Types.ObjectId | string, amount: number, session: any) => {
  const updated = await Invoice.findOneAndUpdate(
    { _id: invoiceId, status: { $in: ['unpaid', 'partial'] }, dueAmount: { $gte: amount } },
    [
      {
        $set: {
          paidTotal: { $add: ['$paidTotal', amount] },
          dueAmount: { $subtract: ['$dueAmount', amount] },
        },
      },
      { $set: { status: { $cond: [{ $eq: ['$dueAmount', 0] }, 'paid', 'partial'] } } },
    ],
    { session, returnDocument: 'after' },
  );
  if (!updated)
    throw AppError.conflict('An invoice no longer has enough due amount for this payment', 'OVERPAYMENT');
  return updated;
};

const resolveAllocations = async (input: CreatePaymentInput, session: any) => {
  if (input.allocations?.length) {
    const sum = input.allocations.reduce((s, a) => s + a.amount, 0);
    if (sum !== input.amount)
      throw AppError.badRequest(
        'Allocations must add up to the payment amount',
        undefined,
        'ALLOCATION_MISMATCH',
      );
    const ids = input.allocations.map((a) => a.invoiceId);
    if (new Set(ids).size !== ids.length) throw AppError.badRequest('An invoice can appear only once');
    const invoices = await Invoice.find({ _id: { $in: ids }, studentId: input.studentId })
      .session(session)
      .lean();
    if (invoices.length !== ids.length)
      throw AppError.badRequest('An invoice does not belong to this student', undefined, 'INVOICE_MISMATCH');
    for (const a of input.allocations) {
      const inv: any = invoices.find((i: any) => String(i._id) === a.invoiceId);
      if (inv.status === 'voided')
        throw AppError.badRequest('A voided invoice cannot be paid', undefined, 'INVOICE_VOIDED');
      if (a.amount > inv.dueAmount)
        throw AppError.badRequest(
          'An allocation is larger than the invoice due amount',
          undefined,
          'OVERPAYMENT',
        );
    }
    return input.allocations.map((a) => ({ invoiceId: new Types.ObjectId(a.invoiceId), amount: a.amount }));
  }
  // No allocations: pay the oldest dues first.
  const open = await Invoice.find({ studentId: input.studentId, status: { $in: ['unpaid', 'partial'] } })
    .sort({ dueDate: 1, issuedAt: 1 })
    .session(session)
    .lean();
  const total = open.reduce((s: number, i: any) => s + i.dueAmount, 0);
  if (input.amount > total)
    throw AppError.badRequest(
      `Amount is more than the total due (${total} poisha)`,
      { totalDue: total },
      'OVERPAYMENT',
    );
  let left = input.amount;
  const out: { invoiceId: Types.ObjectId; amount: number }[] = [];
  for (const inv of open as any[]) {
    if (left === 0) break;
    const take = Math.min(left, inv.dueAmount);
    out.push({ invoiceId: inv._id, amount: take });
    left -= take;
  }
  return out;
};

export const createPayment = async (auth: Auth, input: CreatePaymentInput, idempotencyKey: string) => {
  const prior = await Payment.findOne({ idempotencyKey }).lean();
  if (prior) return { payment: prior, replayed: true };
  if (!(await Student.exists({ _id: input.studentId }))) throw AppError.badRequest('Student not found');

  try {
    const payment = await withTransaction(async (session) => {
      const allocations = await resolveAllocations(input, session);
      const _id = new Types.ObjectId();
      for (const a of allocations) await applyToInvoice(a.invoiceId, a.amount, session);
      const year = todayLocal().slice(0, 4);
      const seq = await nextSeq(`receipt-${year}`, session);
      const receivedAt = input.receivedAt ?? new Date();
      const [doc] = await Payment.create(
        [
          {
            _id,
            receiptNo: `RCPT-${year}-${String(seq).padStart(6, '0')}`,
            studentId: input.studentId,
            allocations,
            amount: input.amount,
            method: input.method,
            status: 'succeeded',
            provider: 'manual',
            providerRef: input.providerRef,
            idempotencyKey,
            receivedBy: auth.userId,
            receivedAt,
            note: input.note,
          },
        ],
        { session },
      );
      await LedgerEntry.create(
        allocations.map((a) => ({
          studentId: input.studentId,
          invoiceId: a.invoiceId,
          paymentId: _id,
          type: 'payment',
          direction: 'credit',
          amount: a.amount,
          note: doc.receiptNo,
          occurredAt: receivedAt,
        })),
        { session, ordered: true },
      );
      return doc;
    });
    await writeAudit({
      action: 'payment.create',
      entityType: 'Payment',
      entityId: payment._id,
      after: { receiptNo: payment.receiptNo, amount: payment.amount, method: payment.method },
    });
    return { payment, replayed: false };
  } catch (err: any) {
    // Two identical requests raced past the first check: return the winner.
    if (err?.code === 11000 && JSON.stringify(err.keyPattern ?? {}).includes('idempotencyKey')) {
      return { payment: await Payment.findOne({ idempotencyKey }).lean(), replayed: true };
    }
    throw err;
  }
};

export const reversePayment = async (auth: Auth, id: string, reason: string) => {
  const result = await withTransaction(async (session) => {
    const payment = await Payment.findById(id).session(session);
    if (!payment) throw AppError.notFound('Payment not found');
    if (payment.status !== 'succeeded')
      throw AppError.conflict('Only a succeeded payment can be reversed', 'PAYMENT_STATE');

    const originals = await LedgerEntry.find({ paymentId: payment._id, type: 'payment' })
      .session(session)
      .lean();
    for (const a of payment.allocations) {
      const original = originals.find((e: any) => String(e.invoiceId) === String(a.invoiceId));
      // Pipeline update recomputes status from the numbers: nothing paid = unpaid, fully paid = paid, otherwise partial.
      await Invoice.updateOne(
        { _id: a.invoiceId },
        [
          {
            $set: {
              paidTotal: { $subtract: ['$paidTotal', a.amount] },
              dueAmount: { $add: ['$dueAmount', a.amount] },
            },
          },
          {
            $set: {
              status: {
                $cond: [
                  { $eq: ['$status', 'voided'] },
                  'voided',
                  {
                    $cond: [
                      { $eq: ['$paidTotal', 0] },
                      'unpaid',
                      { $cond: [{ $eq: ['$dueAmount', 0] }, 'paid', 'partial'] },
                    ],
                  },
                ],
              },
            },
          },
        ],
        { session },
      );
      await LedgerEntry.create(
        [
          {
            studentId: payment.studentId,
            invoiceId: a.invoiceId,
            paymentId: payment._id,
            type: 'reversal',
            direction: 'debit',
            amount: a.amount,
            reversesEntryId: original?._id,
            note: `Reversal of ${payment.receiptNo}`,
          },
        ],
        { session },
      );
    }
    payment.status = 'reversed';
    payment.reversedAt = new Date();
    payment.reversalReason = reason;
    await payment.save({ session });
    return payment;
  });
  await writeAudit({
    action: 'payment.reverse',
    entityType: 'Payment',
    entityId: result._id,
    reason,
    after: { receiptNo: result.receiptNo, amount: result.amount },
  });
  return result;
};

export const listPayments = async (
  page: PageParams,
  f: { studentId?: string; method?: string; status?: string; receiptNo?: string; from?: string; to?: string },
) => {
  const filter: Record<string, any> = {};
  if (f.studentId) filter.studentId = f.studentId;
  if (f.method) filter.method = f.method;
  if (f.status) filter.status = f.status;
  if (f.receiptNo) filter.receiptNo = f.receiptNo;
  if (f.from || f.to)
    filter.receivedAt = {
      ...(f.from ? { $gte: localDateStart(f.from) } : {}),
      ...(f.to ? { $lte: localDateEnd(f.to) } : {}),
    };
  const [rows, total] = await Promise.all([
    Payment.find(filter)
      .sort({ receivedAt: -1 })
      .skip(toSkip(page))
      .limit(page.limit)
      .populate('studentId', 'name studentId')
      .lean(),
    Payment.countDocuments(filter),
  ]);
  return { rows, total };
};

export const getPayment = async (auth: Auth, id: string) => {
  const p = await Payment.findById(id).lean();
  if (!p) throw AppError.notFound('Payment not found');
  await assertInvoiceAccess(auth, p.studentId);
  return p;
};

export const voidInvoice = async (id: string, reason: string) => {
  const result = await withTransaction(async (session) => {
    const inv = await Invoice.findById(id).session(session);
    if (!inv) throw AppError.notFound('Invoice not found');
    if (inv.status === 'voided') throw AppError.conflict('Invoice is already voided', 'INVOICE_VOIDED');
    if (inv.paidTotal > 0)
      throw AppError.conflict('Reverse the payments on this invoice before voiding it', 'HAS_PAYMENTS');
    const original = await LedgerEntry.findOne({ invoiceId: inv._id, type: 'invoice' })
      .session(session)
      .lean();
    await LedgerEntry.create(
      [
        {
          studentId: inv.studentId,
          invoiceId: inv._id,
          type: 'reversal',
          direction: 'credit',
          amount: inv.total,
          reversesEntryId: original?._id,
          note: `Void ${inv.invoiceNo}`,
        },
      ],
      { session },
    );
    inv.status = 'voided';
    inv.dueAmount = 0;
    inv.voidedAt = new Date();
    inv.voidReason = reason;
    await inv.save({ session });
    return inv;
  });
  await writeAudit({
    action: 'invoice.void',
    entityType: 'Invoice',
    entityId: result._id,
    reason,
    after: { invoiceNo: result.invoiceNo, total: result.total },
  });
  return result;
};

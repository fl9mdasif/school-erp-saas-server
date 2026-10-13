import { Types } from 'mongoose';
import cron from 'node-cron';
import { logger } from '../lib/logger';
import { runAsTenant, runUnscoped } from '../lib/tenantContext';
import { Invoice } from '../modules/invoice/invoice.model';
import { LedgerEntry } from '../modules/ledger/ledgerEntry.model';
import { Tenant } from '../modules/tenant/tenant.model';

export interface LedgerMismatch {
  invoiceNo: string;
  invoiceId: string;
  expectedDue: number;
  actualDue: number;
  expectedPaid: number;
  actualPaid: number;
}

/**
 * The ledger is the truth. For every invoice: paid = payment credits - payment reversals,
 * and due = total - paid (0 once voided). Anything else is reported.
 */
export const checkTenantLedger = (tenantId: Types.ObjectId): Promise<LedgerMismatch[]> =>
  runAsTenant(tenantId, async () => {
    const sums = await LedgerEntry.aggregate([
      { $match: { invoiceId: { $exists: true }, type: { $in: ['payment', 'reversal'] } } },
      { $group: { _id: { invoiceId: '$invoiceId', type: '$type' }, amount: { $sum: '$amount' } } },
    ]);
    const paidBy = new Map<string, number>();
    const voidedBy = new Map<string, number>();
    for (const s of sums) {
      const k = String(s._id.invoiceId);
      if (s._id.type === 'payment') paidBy.set(k, (paidBy.get(k) ?? 0) + s.amount);
    }
    // Reversal entries that undo a payment are tagged with a paymentId; invoice voids have none.
    const reversals = await LedgerEntry.aggregate([
      { $match: { type: 'reversal', invoiceId: { $exists: true } } },
      {
        $group: {
          _id: {
            invoiceId: '$invoiceId',
            hasPayment: { $cond: [{ $ifNull: ['$paymentId', false] }, true, false] },
          },
          amount: { $sum: '$amount' },
        },
      },
    ]);
    for (const r of reversals) {
      const k = String(r._id.invoiceId);
      if (r._id.hasPayment) paidBy.set(k, (paidBy.get(k) ?? 0) - r.amount);
      else voidedBy.set(k, (voidedBy.get(k) ?? 0) + r.amount);
    }

    const out: LedgerMismatch[] = [];
    for await (const inv of Invoice.find({}).cursor() as any) {
      const k = String(inv._id);
      const paid = paidBy.get(k) ?? 0;
      const expectedDue = inv.status === 'voided' || voidedBy.has(k) ? 0 : inv.total - paid;
      if (inv.dueAmount !== expectedDue || inv.paidTotal !== paid) {
        out.push({
          invoiceNo: inv.invoiceNo,
          invoiceId: k,
          expectedDue,
          actualDue: inv.dueAmount,
          expectedPaid: paid,
          actualPaid: inv.paidTotal,
        });
      }
    }
    return out;
  });

export const checkAllTenants = async () => {
  const tenants = await runUnscoped(() =>
    Tenant.find({ status: { $in: ['trial', 'active', 'suspended'] } })
      .select('_id slug')
      .lean(),
  );
  const report: { tenantId: string; slug: string; mismatches: LedgerMismatch[] }[] = [];
  for (const t of tenants) {
    const mismatches = await checkTenantLedger(t._id);
    if (mismatches.length) {
      logger.error({ tenantId: String(t._id), count: mismatches.length }, 'ledger consistency mismatch');
      report.push({ tenantId: String(t._id), slug: t.slug, mismatches });
    }
  }
  return report;
};

/** Nightly at 02:00 Dhaka time. */
export const scheduleLedgerConsistency = () =>
  cron.schedule(
    '0 2 * * *',
    () => void checkAllTenants().catch((err) => logger.error({ err }, 'ledger check failed')),
    { timezone: 'Asia/Dhaka' },
  );

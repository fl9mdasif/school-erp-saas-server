import { Router } from 'express';
import { AppError } from '../../errors/AppError';
import { catchAsync } from '../../lib/catchAsync';
import { idParams } from '../../lib/objectId';
import { requireAuth } from '../../lib/requireAuth';
import { ok } from '../../lib/sendResponse';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { assertInvoiceAccess } from '../invoice/invoice.service';
import { Invoice } from '../invoice/invoice.model';
import { linkedStudentIds } from '../student/student.access';
import { Payment } from '../payment/payment.model';
import { Student } from '../student/student.model';
import { LedgerEntry } from './ledgerEntry.model';

/** Chronological ledger with a running balance: debit raises what is owed, credit lowers it. */
export const studentLedger = async (studentId: string) => {
  const entries = await LedgerEntry.find({ studentId }).sort({ occurredAt: 1, _id: 1 }).lean();
  let balance = 0;
  const rows = entries.map((e: any) => {
    balance += e.direction === 'debit' ? e.amount : -e.amount;
    return {
      id: e._id,
      date: e.occurredAt,
      type: e.type,
      direction: e.direction,
      amount: e.amount,
      invoiceId: e.invoiceId,
      paymentId: e.paymentId,
      note: e.note,
      balance,
    };
  });
  return { studentId, balance, entries: rows };
};

const router = Router();
router.use(authenticate());

router.get(
  '/:id/ledger',
  roleGuard('admin', 'accountant', 'student', 'guardian'),
  validateRequest({ params: idParams }),
  catchAsync(async (req, res) => {
    const student = await Student.findById(req.params.id).select('_id').lean();
    if (!student) throw AppError.notFound('Student not found');
    await assertInvoiceAccess(requireAuth(req), student._id);
    ok(res, await studentLedger(student._id.toString()));
  }),
);

export const ledgerRoutes = router;

/** GET /me/fees: dues and recent receipts for the linked students. */
const me = Router();
me.use(authenticate(), roleGuard('student', 'guardian'));
me.get(
  '/fees',
  catchAsync(async (req, res) => {
    const ids = await linkedStudentIds(requireAuth(req));
    const [invoices, payments] = await Promise.all([
      Invoice.find({ studentId: { $in: ids }, status: { $in: ['unpaid', 'partial'] } })
        .sort({ dueDate: 1 })
        .lean(),
      Payment.find({ studentId: { $in: ids }, status: 'succeeded' })
        .sort({ receivedAt: -1 })
        .limit(20)
        .lean(),
    ]);
    ok(res, {
      totalDue: invoices.reduce((s: number, i: any) => s + i.dueAmount, 0),
      invoices,
      receipts: payments,
    });
  }),
);
export const meFeeRoutes = me;

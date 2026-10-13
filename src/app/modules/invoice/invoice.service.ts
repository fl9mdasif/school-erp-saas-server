import { Types } from 'mongoose';
import { AppError } from '../../errors/AppError';
import { toSkip, type PageParams } from '../../lib/pagination';
import { Enrolment } from '../enrolment/enrolment.model';
import { LedgerEntry } from '../ledger/ledgerEntry.model';
import { linkedStudentIds } from '../student/student.access';
import { Invoice } from './invoice.model';

interface Auth {
  userId: Types.ObjectId;
  role: string;
}

/** Students and guardians only ever see invoices of their linked students. */
export const assertInvoiceAccess = async (auth: Auth, studentId: Types.ObjectId) => {
  if (auth.role === 'admin' || auth.role === 'accountant') return;
  const ids = await linkedStudentIds(auth);
  if (!ids.some((id) => id.equals(studentId))) throw AppError.notFound('Invoice not found');
};

export const listInvoices = async (
  auth: Auth,
  page: PageParams,
  f: { studentId?: string; classId?: string; status?: string; periodLabel?: string },
) => {
  const filter: Record<string, any> = {};
  if (auth.role === 'student' || auth.role === 'guardian')
    filter.studentId = { $in: await linkedStudentIds(auth) };
  if (f.studentId)
    filter.studentId = auth.role === 'student' || auth.role === 'guardian' ? filter.studentId : f.studentId;
  if (f.status) filter.status = f.status;
  if (f.periodLabel) filter.periodLabel = f.periodLabel;
  if (f.classId) {
    const sids = await Enrolment.find({ classId: f.classId, status: 'active' }).distinct('studentId');
    filter.studentId = filter.studentId?.$in
      ? {
          $in: filter.studentId.$in.filter((x: Types.ObjectId) =>
            sids.some((s: Types.ObjectId) => s.equals(x)),
          ),
        }
      : { $in: sids };
  }
  const [rows, total] = await Promise.all([
    Invoice.find(filter)
      .sort({ issuedAt: -1 })
      .skip(toSkip(page))
      .limit(page.limit)
      .populate('studentId', 'name studentId')
      .lean(),
    Invoice.countDocuments(filter),
  ]);
  return { rows, total };
};

export const getInvoice = async (auth: Auth, id: string) => {
  const invoice = await Invoice.findById(id).lean();
  if (!invoice) throw AppError.notFound('Invoice not found');
  await assertInvoiceAccess(auth, invoice.studentId);
  const ledger = await LedgerEntry.find({ invoiceId: invoice._id }).sort({ occurredAt: 1 }).lean();
  return { ...invoice, ledger };
};

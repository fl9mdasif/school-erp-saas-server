import { Types } from 'mongoose';
import { AppError } from '../../errors/AppError';
import { localDateEnd, localDateStart, todayLocal } from '../../lib/localDate';
import { toSkip, type PageParams } from '../../lib/pagination';
import { requireTenantId } from '../../lib/tenantContext';
import { ClassModel } from '../class/class.model';
import { Enrolment } from '../enrolment/enrolment.model';
import { FeeHead } from '../feeHead/feeHead.model';
import { Invoice } from '../invoice/invoice.model';
import { LedgerEntry } from '../ledger/ledgerEntry.model';
import { Section } from '../section/section.model';
import { Student } from '../student/student.model';

interface DuesFilter {
  classId?: string;
  sectionId?: string;
  periodLabel?: string;
  minAmount?: number;
  overdueOnly?: boolean;
}

/** Due list grouped by student, computed from open invoices. */
export const duesReport = async (f: DuesFilter, page?: PageParams) => {
  const match: Record<string, any> = { status: { $in: ['unpaid', 'partial'] } };
  if (f.periodLabel) match.periodLabel = f.periodLabel;
  if (f.overdueOnly) match.dueDate = { $lt: todayLocal() };
  if (f.classId || f.sectionId) {
    const e: Record<string, any> = { status: 'active' };
    if (f.classId) e.classId = new Types.ObjectId(f.classId);
    if (f.sectionId) e.sectionId = new Types.ObjectId(f.sectionId);
    match.studentId = { $in: await Enrolment.find(e).distinct('studentId') };
  }
  const grouped = await Invoice.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$studentId',
        due: { $sum: '$dueAmount' },
        invoices: { $sum: 1 },
        oldestDue: { $min: '$dueDate' },
      },
    },
    ...(f.minAmount ? [{ $match: { due: { $gte: f.minAmount } } }] : []),
    { $sort: { due: -1 } },
  ]);
  const total = grouped.length;
  const slice = page ? grouped.slice(toSkip(page), toSkip(page) + page.limit) : grouped;
  const students = await Student.find({ _id: { $in: slice.map((g) => g._id) } })
    .select('name studentId currentEnrolmentId')
    .lean();
  const enrols = await Enrolment.find({
    _id: { $in: students.map((s: any) => s.currentEnrolmentId).filter(Boolean) },
  })
    .select('classId sectionId roll')
    .lean();
  const classes = await ClassModel.find({ _id: { $in: enrols.map((e: any) => e.classId) } })
    .select('name')
    .lean();
  const sections = await Section.find({ _id: { $in: enrols.map((e: any) => e.sectionId).filter(Boolean) } })
    .select('name isDefault')
    .lean();
  const sById = new Map(students.map((s: any) => [String(s._id), s]));
  const eById = new Map(enrols.map((e: any) => [String(e._id), e]));
  const cById = new Map(classes.map((c: any) => [String(c._id), c.name]));
  const secById = new Map(sections.map((s: any) => [String(s._id), s]));

  const rows = slice.map((g) => {
    const s: any = sById.get(String(g._id));
    const e: any = s?.currentEnrolmentId ? eById.get(String(s.currentEnrolmentId)) : null;
    const sec: any = e?.sectionId ? secById.get(String(e.sectionId)) : null;
    return {
      studentId: g._id,
      studentCode: s?.studentId,
      name: s?.name,
      className: e ? cById.get(String(e.classId)) : undefined,
      section: sec && !sec.isDefault ? sec.name : undefined,
      roll: e?.roll,
      due: g.due,
      openInvoices: g.invoices,
      oldestDueDate: g.oldestDue,
    };
  });
  return { rows, total, totalDue: grouped.reduce((s, g) => s + g.due, 0) };
};

type GroupBy = 'day' | 'method' | 'class' | 'feeHead';

/**
 * Collection report. Totals come from the ledger, never from the cached invoice fields:
 * payments (credits) minus reversals (debits) in the period.
 */
export const collectionReport = async (from: string, to: string, groupBy: GroupBy) => {
  if (to < from) throw AppError.badRequest('to must not be before from');
  const range = { $gte: localDateStart(from), $lte: localDateEnd(to) };
  const base = [
    { $match: { tenantId: requireTenantId(), type: { $in: ['payment', 'reversal'] }, occurredAt: range } },
    {
      $addFields: {
        signed: { $cond: [{ $eq: ['$type', 'payment'] }, '$amount', { $multiply: ['$amount', -1] }] },
      },
    },
  ];

  let rows: { key: string; label?: string; collected: number; payments: number }[];

  if (groupBy === 'day') {
    const r = await LedgerEntry.aggregate([
      ...base,
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$occurredAt', timezone: 'Asia/Dhaka' } },
          collected: { $sum: '$signed' },
          payments: { $addToSet: '$paymentId' },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    rows = r.map((x) => ({ key: x._id, collected: x.collected, payments: x.payments.length }));
  } else if (groupBy === 'method') {
    const r = await LedgerEntry.aggregate([
      ...base,
      { $lookup: { from: 'payments', localField: 'paymentId', foreignField: '_id', as: 'p' } },
      { $unwind: '$p' },
      { $group: { _id: '$p.method', collected: { $sum: '$signed' }, payments: { $addToSet: '$paymentId' } } },
      { $sort: { collected: -1 } },
    ]);
    rows = r.map((x) => ({ key: x._id, collected: x.collected, payments: x.payments.length }));
  } else if (groupBy === 'class') {
    const r = await LedgerEntry.aggregate([
      ...base,
      { $lookup: { from: 'invoices', localField: 'invoiceId', foreignField: '_id', as: 'i' } },
      { $unwind: '$i' },
      { $lookup: { from: 'enrolments', localField: 'i.enrolmentId', foreignField: '_id', as: 'e' } },
      { $unwind: '$e' },
      {
        $group: { _id: '$e.classId', collected: { $sum: '$signed' }, payments: { $addToSet: '$paymentId' } },
      },
    ]);
    const names = new Map(
      (
        await ClassModel.find({ _id: { $in: r.map((x) => x._id) } })
          .select('name')
          .lean()
      ).map((c: any) => [String(c._id), c.name]),
    );
    rows = r.map((x) => ({
      key: String(x._id),
      label: names.get(String(x._id)),
      collected: x.collected,
      payments: x.payments.length,
    }));
  } else {
    // Per fee head: split each invoice-level entry by the invoice's line share (amount - discount).
    const entries = await LedgerEntry.aggregate([
      ...base,
      { $lookup: { from: 'invoices', localField: 'invoiceId', foreignField: '_id', as: 'i' } },
      { $unwind: '$i' },
    ]);
    const acc = new Map<string, { collected: number; pays: Set<string> }>();
    for (const e of entries) {
      const lines = e.i.lines as { feeHeadId: Types.ObjectId; amount: number; discount: number }[];
      const net = lines.reduce((s, l) => s + l.amount - l.discount, 0) || 1;
      let remaining = e.signed;
      lines.forEach((l, idx) => {
        const share =
          idx === lines.length - 1 ? remaining : Math.round((e.signed * (l.amount - l.discount)) / net);
        remaining -= share;
        const k = String(l.feeHeadId);
        const cur = acc.get(k) ?? { collected: 0, pays: new Set<string>() };
        cur.collected += share;
        cur.pays.add(String(e.paymentId));
        acc.set(k, cur);
      });
    }
    const names = new Map(
      (
        await FeeHead.find({ _id: { $in: [...acc.keys()] } })
          .select('name')
          .lean()
      ).map((h: any) => [String(h._id), h.name]),
    );
    rows = [...acc.entries()].map(([k, v]) => ({
      key: k,
      label: names.get(k),
      collected: v.collected,
      payments: v.pays.size,
    }));
  }
  return { from, to, groupBy, total: rows.reduce((s, r) => s + r.collected, 0), rows };
};

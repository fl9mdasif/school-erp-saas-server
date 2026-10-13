import { Types } from 'mongoose';
import { AppError } from '../../errors/AppError';
import { clampDiscount, percentOf } from '../../lib/money';
import { todayLocal } from '../../lib/localDate';
import { withTransaction } from '../../lib/transaction';
import { writeAudit } from '../auditLog/auditLog.model';
import { nextSeq } from '../counter/counter.model';
import { Enrolment } from '../enrolment/enrolment.model';
import { FeeAdjustment } from '../feeAdjustment/feeAdjustment.model';
import { FeeHead } from '../feeHead/feeHead.model';
import { FeeStructure } from '../feeStructure/feeStructure.model';
import { LedgerEntry } from '../ledger/ledgerEntry.model';
import { Student } from '../student/student.model';
import { Invoice, InvoiceBatch } from './invoice.model';

export interface GenerateInput {
  sessionId: string;
  classId?: string;
  sectionId?: string;
  studentIds?: string[];
  periodLabel: string;
  cycle: 'monthly' | 'term' | 'yearly' | 'one_time';
  feeHeadIds?: string[];
  dueDate: string;
}

interface Planned {
  student: any;
  enrolment: any;
  lines: { feeHeadId: Types.ObjectId; label: string; amount: number; discount: number }[];
  total: number;
  signature: string;
}

interface Plan {
  planned: Planned[];
  skipped: { studentId: string; name: string; reason: string }[];
}

/** Best applicable adjustment per fee head: the one that discounts the most, never below zero. */
const discountFor = (
  adjustments: any[],
  feeHeadId: Types.ObjectId,
  amount: number,
  today: string,
): number => {
  let best = 0;
  for (const a of adjustments) {
    if (a.feeHeadId && !a.feeHeadId.equals(feeHeadId)) continue;
    if (a.validFrom && a.validFrom > today) continue;
    if (a.validTo && a.validTo < today) continue;
    const d = a.type === 'percent' ? percentOf(amount, a.value) : a.value;
    best = Math.max(best, clampDiscount(amount, d));
  }
  return best;
};

const buildPlan = async (input: GenerateInput): Promise<Plan> => {
  const filter: Record<string, any> = { sessionId: input.sessionId, status: 'active' };
  if (input.classId) filter.classId = input.classId;
  if (input.sectionId) filter.sectionId = input.sectionId;
  if (input.studentIds?.length) filter.studentId = { $in: input.studentIds };
  if (!input.classId && !input.sectionId && !input.studentIds?.length) {
    throw AppError.badRequest('Choose a class, a section or specific students');
  }
  const enrolments = await Enrolment.find(filter).lean();
  const students = await Student.find({
    _id: { $in: enrolments.map((e: any) => e.studentId) },
    status: 'active',
  })
    .select('name studentId')
    .lean();
  const byId = new Map(students.map((s: any) => [String(s._id), s]));

  const structures = await FeeStructure.find({ sessionId: input.sessionId }).lean();
  const heads = await FeeHead.find({}).lean();
  const headName = new Map(heads.map((h: any) => [String(h._id), h.name]));
  const headActive = new Map(heads.map((h: any) => [String(h._id), h.isActive]));
  const adjustments = await FeeAdjustment.find({
    sessionId: input.sessionId,
    studentId: { $in: [...byId.keys()] },
  }).lean();
  const adjByStudent = new Map<string, any[]>();
  for (const a of adjustments)
    adjByStudent.set(String(a.studentId), [...(adjByStudent.get(String(a.studentId)) ?? []), a]);
  const only = input.feeHeadIds?.length ? new Set(input.feeHeadIds) : null;
  const today = todayLocal();

  const plan: Plan = { planned: [], skipped: [] };
  for (const e of enrolments as any[]) {
    const student: any = byId.get(String(e.studentId));
    if (!student) continue;
    const structure = structures.find(
      (s: any) => String(s.classId) === String(e.classId) && (s.group ?? null) === (e.group ?? null),
    );
    if (!structure) {
      plan.skipped.push({
        studentId: student.studentId,
        name: student.name,
        reason: 'No fee structure for this class',
      });
      continue;
    }
    const items = structure.items.filter(
      (i: any) =>
        i.cycle === input.cycle &&
        (!only || only.has(String(i.feeHeadId))) &&
        headActive.get(String(i.feeHeadId)),
    );
    if (!items.length) {
      plan.skipped.push({
        studentId: student.studentId,
        name: student.name,
        reason: 'No fee items for this cycle',
      });
      continue;
    }
    const adj = adjByStudent.get(String(student._id)) ?? [];
    const lines = items.map((i: any) => ({
      feeHeadId: i.feeHeadId as Types.ObjectId,
      label: headName.get(String(i.feeHeadId)) ?? 'Fee',
      amount: i.amount as number,
      discount: discountFor(adj, i.feeHeadId, i.amount, today),
    }));
    const total = lines.reduce((s, l) => s + l.amount - l.discount, 0);
    if (total <= 0) {
      plan.skipped.push({
        studentId: student.studentId,
        name: student.name,
        reason: 'Nothing to charge after waivers',
      });
      continue;
    }
    plan.planned.push({
      student,
      enrolment: e,
      lines,
      total,
      signature: lines
        .map((l) => String(l.feeHeadId))
        .sort()
        .join('+'),
    });
  }

  // Never duplicate: same student, session, period and fee heads already has a live invoice.
  const existing = await Invoice.find({
    sessionId: input.sessionId,
    periodLabel: input.periodLabel,
    studentId: { $in: plan.planned.map((p) => p.student._id) },
    status: { $in: ['unpaid', 'partial', 'paid'] },
  })
    .select('studentId feeHeadSignature')
    .lean();
  const have = new Set(existing.map((x: any) => `${x.studentId}|${x.feeHeadSignature}`));
  plan.planned = plan.planned.filter((p) => {
    if (have.has(`${p.student._id}|${p.signature}`)) {
      plan.skipped.push({
        studentId: p.student.studentId,
        name: p.student.name,
        reason: 'Invoice already exists for this period',
      });
      return false;
    }
    return true;
  });
  return plan;
};

const summarize = (plan: Plan) => ({
  toCreate: plan.planned.length,
  totalAmount: plan.planned.reduce((s, p) => s + p.total, 0),
  skipped: plan.skipped.length,
  skippedDetails: plan.skipped.slice(0, 200),
});

export const previewInvoices = async (input: GenerateInput) => ({
  dryRun: true,
  ...summarize(await buildPlan(input)),
});

const CHUNK = 50;

export const generateInvoices = async (input: GenerateInput, idempotencyKey: string) => {
  // Same key returns the original result. A concurrent duplicate request is told to wait.
  let batch: any;
  try {
    batch = await InvoiceBatch.create({ key: idempotencyKey });
  } catch (err: any) {
    if (err?.code !== 11000) throw err;
    const prior = await InvoiceBatch.findOne({ key: idempotencyKey });
    if (prior?.status === 'done') return { ...prior.summary, replayed: true };
    throw AppError.conflict('A request with this Idempotency-Key is still running', 'IN_PROGRESS');
  }

  try {
    const plan = await buildPlan(input);
    const year = todayLocal().slice(0, 4);
    const batchId = String(batch._id);
    let created = 0;
    for (let i = 0; i < plan.planned.length; i += CHUNK) {
      const chunk = plan.planned.slice(i, i + CHUNK);
      await withTransaction(async (session) => {
        for (const p of chunk) {
          const seq = await nextSeq(`invoice-${year}`, session);
          const invoiceNo = `INV-${year}-${String(seq).padStart(6, '0')}`;
          const [inv] = await Invoice.create(
            [
              {
                invoiceNo,
                studentId: p.student._id,
                enrolmentId: p.enrolment._id,
                sessionId: input.sessionId,
                periodLabel: input.periodLabel,
                feeHeadSignature: p.signature,
                lines: p.lines,
                total: p.total,
                dueDate: input.dueDate,
                issuedAt: new Date(),
                batchId,
                dueAmount: p.total,
                status: 'unpaid',
              },
            ],
            { session },
          );
          await LedgerEntry.create(
            [
              {
                studentId: p.student._id,
                invoiceId: inv._id,
                type: 'invoice',
                direction: 'debit',
                amount: p.total,
                note: `${invoiceNo} ${input.periodLabel}`,
              },
            ],
            { session },
          );
        }
      });
      created += chunk.length;
    }
    const summary = {
      dryRun: false,
      batchId,
      created,
      totalAmount: plan.planned.reduce((s, p) => s + p.total, 0),
      skipped: plan.skipped.length,
      skippedDetails: plan.skipped.slice(0, 200),
    };
    await InvoiceBatch.updateOne({ _id: batch._id }, { $set: { status: 'done', summary } });
    await writeAudit({
      action: 'invoice.generate',
      entityType: 'InvoiceBatch',
      entityId: batch._id,
      after: { periodLabel: input.periodLabel, created, skipped: plan.skipped.length },
    });
    return summary;
  } catch (err) {
    // Free the key so the caller can retry; already created invoices are skipped as duplicates next time.
    await InvoiceBatch.deleteOne({ _id: batch._id });
    throw err;
  }
};

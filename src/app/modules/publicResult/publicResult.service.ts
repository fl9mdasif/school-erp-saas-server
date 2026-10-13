import { AppError } from '../../errors/AppError';
import { isValidLocalDate } from '../../lib/localDate';
import { requireTenantId } from '../../lib/tenantContext';
import { ClassModel } from '../class/class.model';
import { Exam } from '../exam/exam.model';
import { buildMarksheet } from '../marksheet/marksheet.service';
import { Result } from '../result/result.model';
import { Student } from '../student/student.model';
import { Tenant } from '../tenant/tenant.model';
import { PublicSite } from '../publicSite/publicSite.model';

// One generic answer for every failure so a visitor cannot tell a wrong roll from a wrong birth date or an unpublished exam.
const NOT_FOUND = () => new AppError(404, 'RESULT_NOT_FOUND', 'No result found for the details provided');

export type LookupMode = 'roll_dob' | 'roll_only' | 'student_id_dob';
export interface LookupInput {
  examId: string;
  classId?: string;
  roll?: number;
  dob?: string;
  studentId?: string;
}

const examListCache = new Map<string, { at: number; data: unknown }>();
const CACHE_MS = 30_000;
export const clearExamListCache = () => examListCache.clear();

const resultsEnabled = async () => {
  const site = await PublicSite.findOne({}).select('sectionsVisible.results').lean();
  return (site as any)?.sectionsVisible?.results !== false;
};

/** Published exams and their class names, for the lookup form. Cached briefly because result day is read heavy. */
export const publishedExams = async () => {
  if (!(await resultsEnabled())) return [];
  const key = String(requireTenantId());
  const hit = examListCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const exams = await Exam.find({ status: 'published' })
    .select('name classIds publishedAt')
    .sort({ publishedAt: -1 })
    .limit(50)
    .lean();
  const classes = await ClassModel.find({ _id: { $in: exams.flatMap((e: any) => e.classIds) } })
    .select('name nameBn')
    .lean();
  const names = new Map(classes.map((c: any) => [String(c._id), c]));
  const data = exams.map((e: any) => ({
    id: e._id,
    name: e.name,
    classes: e.classIds.map((c: any) => ({ id: c, name: (names.get(String(c)) as any)?.name })),
  }));
  examListCache.set(key, { at: Date.now(), data });
  return data;
};

export const lookupMode = async (): Promise<LookupMode> => {
  const t = await Tenant.findById(requireTenantId()).select('settings.resultLookupMode').lean();
  return ((t as any)?.settings?.resultLookupMode ?? 'roll_dob') as LookupMode;
};

/** Finds one published result or throws the generic not-found. Never reveals which detail was wrong. */
export const findPublishedResult = async (mode: LookupMode, input: LookupInput) => {
  if (!(await resultsEnabled())) throw NOT_FOUND();
  const exam = await Exam.findOne({ _id: input.examId, status: 'published' }).select('_id').lean();
  if (!exam) throw NOT_FOUND();

  let candidates: any[] = [];
  if (mode === 'student_id_dob') {
    const s = await Student.findOne({ studentId: input.studentId }).select('_id dob').lean();
    if (!s || (s as any).dob !== input.dob) throw NOT_FOUND();
    candidates = await Result.find({
      examId: exam._id,
      studentId: (s as any)._id,
      status: 'published',
    }).lean();
  } else {
    candidates = await Result.find({
      examId: exam._id,
      classId: input.classId,
      roll: input.roll,
      status: 'published',
    }).lean();
    if (mode === 'roll_dob') {
      const students = await Student.find({ _id: { $in: candidates.map((c) => c.studentId) } })
        .select('dob')
        .lean();
      const ok = new Set(students.filter((s: any) => s.dob === input.dob).map((s: any) => String(s._id)));
      candidates = candidates.filter((c) => ok.has(String(c.studentId)));
    }
  }
  if (candidates.length !== 1) throw NOT_FOUND(); // none, or an ambiguous roll without a birth date to tell them apart
  return candidates[0];
};

/** Public payload: exactly what a marksheet needs. No phone, address, guardian data or birth registration number. */
export const publicResultPayload = async (result: any) => {
  const m = await buildMarksheet(result);
  return {
    school: m.locale === 'bn' && m.school.nameBn ? m.school.nameBn : m.school.name,
    exam: m.examName,
    student: {
      name: m.student.name,
      studentId: m.student.studentId,
      class: m.className,
      section: m.sectionName,
      roll: m.roll,
    },
    subjects: m.subjects.map((s) => ({
      name: s.name,
      fullMarks: s.fullMarks,
      obtained: s.total,
      grade: s.letter,
      point: s.point,
      passed: s.passed,
    })),
    totalMarks: m.totalMarks,
    fullMarks: m.fullMarks,
    percent: m.percent,
    gpa: m.gpa,
    grade: m.letter,
    passed: m.passed,
    position: m.positionInClass,
    remark: result.remark,
  };
};

export const isDob = (s: unknown): s is string => isValidLocalDate(s);

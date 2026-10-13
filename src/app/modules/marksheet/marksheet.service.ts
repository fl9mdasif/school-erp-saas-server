import { AppError } from '../../errors/AppError';
import { createPdf, formatTaka, pdfToBuffer } from '../../lib/pdf';
import { requireTenantId } from '../../lib/tenantContext';
import { ClassModel } from '../class/class.model';
import { Exam } from '../exam/exam.model';
import { Result } from '../result/result.model';
import { Section } from '../section/section.model';
import { Student } from '../student/student.model';
import { Tenant } from '../tenant/tenant.model';

void formatTaka;

const L = {
  en: {
    title: 'Marksheet',
    student: 'Student',
    id: 'ID',
    cls: 'Class',
    roll: 'Roll',
    section: 'Section',
    subject: 'Subject',
    full: 'Full',
    got: 'Obtained',
    grade: 'Grade',
    point: 'Point',
    total: 'Total',
    gpa: 'GPA',
    result: 'Result',
    passed: 'Passed',
    failed: 'Failed',
    position: 'Position (class)',
    percent: 'Percent',
    note: 'Computer generated marksheet',
    fail: 'Failed subjects',
  },
  bn: {
    title: 'নম্বরপত্র',
    student: 'শিক্ষার্থী',
    id: 'আইডি',
    cls: 'শ্রেণি',
    roll: 'রোল',
    section: 'শাখা',
    subject: 'বিষয়',
    full: 'পূর্ণমান',
    got: 'প্রাপ্ত নম্বর',
    grade: 'গ্রেড',
    point: 'পয়েন্ট',
    total: 'মোট',
    gpa: 'জিপিএ',
    result: 'ফলাফল',
    passed: 'উত্তীর্ণ',
    failed: 'অনুত্তীর্ণ',
    position: 'মেধাক্রম (শ্রেণি)',
    percent: 'শতকরা',
    note: 'কম্পিউটার জেনারেটেড নম্বরপত্র',
    fail: 'অনুত্তীর্ণ বিষয়',
  },
} as const;

export interface MarksheetData {
  locale: 'bn' | 'en';
  school: { name: string; nameBn?: string; address?: string; eiin?: string };
  examName: string;
  student: { name: string; studentId: string };
  className?: string;
  sectionName?: string;
  roll: number;
  subjects: {
    name: string;
    fullMarks: number;
    total: number;
    letter: string;
    point: number;
    passed: boolean;
    kind: string;
  }[];
  totalMarks: number;
  fullMarks: number;
  percent: number;
  gpa?: number;
  letter: string;
  passed: boolean;
  positionInClass?: number;
  version: number;
}

/** Marksheet data from a stored result. Callers check access first. */
export const buildMarksheet = async (result: any): Promise<MarksheetData> => {
  const [tenant, student, exam, cls, sec] = await Promise.all([
    Tenant.findById(requireTenantId()).lean(),
    Student.findById(result.studentId).select('name studentId').lean(),
    Exam.findById(result.examId).select('name').lean(),
    ClassModel.findById(result.classId).select('name nameBn').lean(),
    result.sectionId ? Section.findById(result.sectionId).select('name isDefault').lean() : null,
  ]);
  if (!tenant || !student || !exam) throw AppError.notFound('Result not found');
  const locale = (tenant as any).settings.locale;
  return {
    locale,
    school: {
      name: (tenant as any).name,
      nameBn: (tenant as any).nameBn,
      address: (tenant as any).contact?.address,
      eiin: (tenant as any).eiin,
    },
    examName: (exam as any).name,
    student: { name: (student as any).name, studentId: (student as any).studentId },
    className: locale === 'bn' ? ((cls as any)?.nameBn ?? (cls as any)?.name) : (cls as any)?.name,
    sectionName: sec && !(sec as any).isDefault ? (sec as any).name : undefined,
    roll: result.roll,
    subjects: result.subjects.map((s: any) => ({
      name: s.name,
      fullMarks: s.fullMarks,
      total: s.total,
      letter: s.letter,
      point: s.point,
      passed: s.passed,
      kind: s.kind,
    })),
    totalMarks: result.totalMarks,
    fullMarks: result.fullMarks,
    percent: result.percent,
    gpa: result.gpa,
    letter: result.letter,
    passed: result.passed,
    positionInClass: result.positionInClass,
    version: result.version,
  };
};

export const renderMarksheetPdf = async (m: MarksheetData): Promise<Buffer> => {
  const t = L[m.locale];
  const doc = createPdf();
  const W = doc.page.width - 80;
  const x = 40;
  doc
    .font('bold')
    .fontSize(18)
    .text(m.locale === 'bn' && m.school.nameBn ? m.school.nameBn : m.school.name, { align: 'center' });
  doc
    .font('regular')
    .fontSize(10)
    .text([m.school.address, m.school.eiin ? `EIIN ${m.school.eiin}` : ''].filter(Boolean).join('  |  '), {
      align: 'center',
    });
  doc.moveDown(0.6).font('bold').fontSize(14).text(`${m.examName} - ${t.title}`, { align: 'center' });
  doc.moveDown(0.6).font('regular').fontSize(11);
  doc.text(`${t.student}: ${m.student.name}    ${t.id}: ${m.student.studentId}`);
  doc.text(
    `${t.cls}: ${m.className ?? '-'}${m.sectionName ? `    ${t.section}: ${m.sectionName}` : ''}    ${t.roll}: ${m.roll}`,
  );
  doc.moveDown(0.6);

  const cols = [x, x + W * 0.46, x + W * 0.62, x + W * 0.78, x + W * 0.9];
  const widths = [W * 0.44, W * 0.14, W * 0.14, W * 0.1, W * 0.1];
  let y = doc.y;
  const head = [t.subject, t.full, t.got, t.grade, t.point];
  doc.font('bold');
  head.forEach((h, i) => doc.text(h, cols[i], y, { width: widths[i], align: i === 0 ? 'left' : 'right' }));
  y += 20;
  doc
    .moveTo(x, y - 4)
    .lineTo(x + W, y - 4)
    .stroke('#888');
  doc.font('regular');
  for (const s of m.subjects) {
    const row = [
      s.name + (s.kind === 'fourth' ? ' *' : ''),
      String(s.fullMarks),
      String(s.total),
      s.letter,
      s.point.toFixed(2),
    ];
    if (!s.passed) doc.fillColor('#b00020');
    row.forEach((c, i) => doc.text(c, cols[i], y, { width: widths[i], align: i === 0 ? 'left' : 'right' }));
    doc.fillColor('#000');
    y += 20;
  }
  doc
    .moveTo(x, y - 2)
    .lineTo(x + W, y - 2)
    .stroke('#111');
  doc
    .font('bold')
    .text(t.total, cols[0], y + 4, { width: widths[0] })
    .text(String(m.fullMarks), cols[1], y + 4, { width: widths[1], align: 'right' })
    .text(String(m.totalMarks), cols[2], y + 4, { width: widths[2], align: 'right' });
  y += 34;
  doc.font('regular').fontSize(12);
  const summary = [
    `${t.percent}: ${m.percent}%`,
    m.gpa !== undefined ? `${t.gpa}: ${m.gpa.toFixed(2)}` : '',
    `${t.grade}: ${m.letter}`,
    `${t.result}: ${m.passed ? t.passed : t.failed}`,
    m.positionInClass ? `${t.position}: ${m.positionInClass}` : '',
  ].filter(Boolean);
  doc.text(summary.join('     '), x, y, { width: W });
  doc
    .font('regular')
    .fontSize(9)
    .fillColor('#666')
    .text(`${t.note}  |  v${m.version}`, x, doc.page.height - 70, { width: W, align: 'center' });
  return pdfToBuffer(doc);
};

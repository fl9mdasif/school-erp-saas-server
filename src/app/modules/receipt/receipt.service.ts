import { Types } from 'mongoose';
import { AppError } from '../../errors/AppError';
import { createPdf, escapeHtml, formatTaka, pdfToBuffer } from '../../lib/pdf';
import { requireTenantId } from '../../lib/tenantContext';
import { ClassModel } from '../class/class.model';
import { Enrolment } from '../enrolment/enrolment.model';
import { Invoice } from '../invoice/invoice.model';
import { assertInvoiceAccess } from '../invoice/invoice.service';
import { Payment } from '../payment/payment.model';
import { Student } from '../student/student.model';
import { Tenant } from '../tenant/tenant.model';
import { User } from '../user/user.model';

interface Auth {
  userId: Types.ObjectId;
  role: string;
}

const L = {
  en: {
    receipt: 'Fee Receipt',
    no: 'Receipt No',
    date: 'Date',
    student: 'Student',
    id: 'ID',
    cls: 'Class',
    roll: 'Roll',
    invoice: 'Invoice',
    period: 'Period',
    paid: 'Paid',
    total: 'Total paid',
    method: 'Method',
    received: 'Received by',
    reversed: 'REVERSED',
    note: 'Computer generated receipt',
  },
  bn: {
    receipt: 'ফি রশিদ',
    no: 'রশিদ নং',
    date: 'তারিখ',
    student: 'শিক্ষার্থী',
    id: 'আইডি',
    cls: 'শ্রেণি',
    roll: 'রোল',
    invoice: 'ইনভয়েস',
    period: 'সময়কাল',
    paid: 'পরিশোধ',
    total: 'মোট পরিশোধ',
    method: 'মাধ্যম',
    received: 'গ্রহণকারী',
    reversed: 'বাতিল',
    note: 'কম্পিউটার জেনারেটেড রশিদ',
  },
} as const;

const METHOD: Record<string, string> = {
  cash: 'Cash',
  bank: 'Bank',
  cheque: 'Cheque',
  bkash_manual: 'bKash',
  nagad_manual: 'Nagad',
  rocket_manual: 'Rocket',
  online: 'Online',
};

export interface ReceiptData {
  locale: 'bn' | 'en';
  school: { name: string; nameBn?: string; address?: string; eiin?: string; phone?: string };
  receiptNo: string;
  date: string;
  status: string;
  student: { name: string; studentId: string; className?: string; roll?: number };
  lines: { invoiceNo: string; period: string; amount: number }[];
  total: number;
  method: string;
  receivedBy?: string;
}

export const buildReceipt = async (auth: Auth, paymentId: string): Promise<ReceiptData> => {
  const payment = await Payment.findById(paymentId).lean();
  if (!payment) throw AppError.notFound('Payment not found');
  await assertInvoiceAccess(auth, payment.studentId);

  const [tenant, student, invoices, receiver] = await Promise.all([
    Tenant.findById(requireTenantId()).lean(),
    Student.findById(payment.studentId).lean(),
    Invoice.find({ _id: { $in: payment.allocations.map((a: any) => a.invoiceId) } })
      .select('invoiceNo periodLabel')
      .lean(),
    User.findById(payment.receivedBy).select('name').lean(),
  ]);
  const enrol: any = student?.currentEnrolmentId
    ? await Enrolment.findById(student.currentEnrolmentId).select('classId roll').lean()
    : null;
  const cls: any = enrol ? await ClassModel.findById(enrol.classId).select('name nameBn').lean() : null;
  const locale = tenant?.settings.locale ?? 'bn';

  return {
    locale,
    school: {
      name: tenant!.name,
      nameBn: tenant!.nameBn,
      address: tenant!.contact?.address,
      eiin: tenant!.eiin,
      phone: tenant!.contact?.phone,
    },
    receiptNo: payment.receiptNo,
    date: new Date(payment.receivedAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Dhaka' }),
    status: payment.status,
    student: {
      name: student!.name,
      studentId: student!.studentId,
      className: locale === 'bn' ? (cls?.nameBn ?? cls?.name) : cls?.name,
      roll: enrol?.roll,
    },
    lines: payment.allocations.map((a: any) => {
      const inv: any = invoices.find((i: any) => String(i._id) === String(a.invoiceId));
      return { invoiceNo: inv?.invoiceNo ?? '', period: inv?.periodLabel ?? '', amount: a.amount };
    }),
    total: payment.amount,
    method: METHOD[payment.method] ?? payment.method,
    receivedBy: (receiver as any)?.name,
  };
};

export const renderReceiptHtml = (r: ReceiptData): string => {
  const t = L[r.locale];
  const e = escapeHtml;
  const rows = r.lines
    .map(
      (l) =>
        `<tr><td>${e(l.invoiceNo)}</td><td>${e(l.period)}</td><td class="num">${formatTaka(l.amount)}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html lang="${r.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(t.receipt)} ${e(r.receiptNo)}</title>
<style>
body{font-family:"Noto Sans Bengali","Kalpurush",system-ui,sans-serif;margin:0;padding:24px;color:#111}
.sheet{max-width:640px;margin:0 auto;border:1px solid #cfd4dc;padding:24px;position:relative}
h1{margin:0;font-size:20px;text-align:center}h2{margin:4px 0 16px;font-size:15px;text-align:center;font-weight:600}
.meta{display:flex;justify-content:space-between;font-size:14px;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{border-bottom:1px solid #e5e7eb;padding:6px 4px;text-align:left}
.num{text-align:right}.total td{font-weight:700;border-top:2px solid #111}
.small{font-size:12px;color:#555;text-align:center;margin-top:16px}
.stamp{position:absolute;top:40%;left:20%;font-size:56px;color:rgba(200,0,0,.25);transform:rotate(-20deg);font-weight:700}
@media print{body{padding:0}.sheet{border:none}}
</style></head><body><div class="sheet">
${r.status === 'reversed' ? `<div class="stamp">${e(t.reversed)}</div>` : ''}
<h1>${e(r.locale === 'bn' && r.school.nameBn ? r.school.nameBn : r.school.name)}</h1>
<h2>${e(r.school.address ?? '')}${r.school.eiin ? ` &middot; EIIN ${e(r.school.eiin)}` : ''}</h2>
<h2>${e(t.receipt)}</h2>
<div class="meta"><span>${e(t.no)}: <b>${e(r.receiptNo)}</b></span><span>${e(t.date)}: ${e(r.date)}</span></div>
<div class="meta"><span>${e(t.student)}: <b>${e(r.student.name)}</b> (${e(t.id)} ${e(r.student.studentId)})</span><span>${e(t.cls)}: ${e(r.student.className ?? '-')} &middot; ${e(t.roll)}: ${e(r.student.roll ?? '-')}</span></div>
<table><thead><tr><th>${e(t.invoice)}</th><th>${e(t.period)}</th><th class="num">${e(t.paid)} (Tk)</th></tr></thead><tbody>${rows}
<tr class="total"><td colspan="2">${e(t.total)}</td><td class="num">${formatTaka(r.total)}</td></tr></tbody></table>
<div class="meta" style="margin-top:12px"><span>${e(t.method)}: ${e(r.method)}</span><span>${e(t.received)}: ${e(r.receivedBy ?? '-')}</span></div>
<p class="small">${e(t.note)}</p></div></body></html>`;
};

export const renderReceiptPdf = async (r: ReceiptData): Promise<Buffer> => {
  const t = L[r.locale];
  const doc = createPdf();
  const W = doc.page.width - 80;
  doc
    .font('bold')
    .fontSize(18)
    .text(r.locale === 'bn' && r.school.nameBn ? r.school.nameBn : r.school.name, { align: 'center' });
  doc
    .font('regular')
    .fontSize(10)
    .text(
      [r.school.address, r.school.eiin ? `EIIN ${r.school.eiin}` : '', r.school.phone]
        .filter(Boolean)
        .join('  |  '),
      { align: 'center' },
    );
  doc.moveDown(0.8).font('bold').fontSize(14).text(t.receipt, { align: 'center' });
  doc.moveDown(0.6).font('regular').fontSize(11);
  doc.text(`${t.no}: ${r.receiptNo}`, { continued: true }).text(`${t.date}: ${r.date}`, { align: 'right' });
  doc.text(`${t.student}: ${r.student.name} (${t.id} ${r.student.studentId})`);
  doc.text(`${t.cls}: ${r.student.className ?? '-'}    ${t.roll}: ${r.student.roll ?? '-'}`);
  doc.moveDown(0.6);

  const x = 40;
  const col = [x, x + W * 0.45, x + W * 0.75];
  let y = doc.y;
  doc
    .font('bold')
    .text(t.invoice, col[0], y)
    .text(t.period, col[1], y)
    .text(`${t.paid} (Tk)`, col[2], y, { width: W * 0.25, align: 'right' });
  y += 18;
  doc
    .moveTo(x, y - 3)
    .lineTo(x + W, y - 3)
    .stroke('#999');
  doc.font('regular');
  for (const l of r.lines) {
    doc
      .text(l.invoiceNo, col[0], y)
      .text(l.period, col[1], y)
      .text(formatTaka(l.amount), col[2], y, { width: W * 0.25, align: 'right' });
    y += 18;
  }
  doc
    .moveTo(x, y)
    .lineTo(x + W, y)
    .stroke('#111');
  doc
    .font('bold')
    .text(t.total, col[0], y + 6)
    .text(formatTaka(r.total), col[2], y + 6, { width: W * 0.25, align: 'right' });
  doc
    .font('regular')
    .fontSize(10)
    .text(`${t.method}: ${r.method}    ${t.received}: ${r.receivedBy ?? '-'}`, x, y + 36);
  if (r.status === 'reversed')
    doc
      .font('bold')
      .fontSize(40)
      .fillColor('#cc0000')
      .opacity(0.3)
      .text(t.reversed, x, y + 80, { width: W, align: 'center' })
      .opacity(1)
      .fillColor('#000');
  doc
    .font('regular')
    .fontSize(9)
    .fillColor('#666')
    .text(t.note, x, doc.page.height - 70, { width: W, align: 'center' });
  return pdfToBuffer(doc);
};

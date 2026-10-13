import { randomUUID } from 'node:crypto';
import { agent, authed, type TestTenant } from './api';
import { newStudent, setupAcademic } from './academic';

/** Class 5 with N students and a structure: Tuition 1000 Tk monthly, Exam 500 Tk one-time. Amounts are poisha. */
export const setupFees = async (t: TestTenant, studentCount = 2) => {
  const h = authed(t.token);
  const a = await setupAcademic(t, { sections: ['A'] });
  const heads = (await agent().get('/api/v1/fee-heads').set(h)).body.data;
  const tuition = heads.find((x: any) => x.code === 'TUITION');
  const exam = heads.find((x: any) => x.code === 'EXAM');
  const structure = await agent()
    .post('/api/v1/fee-structures')
    .set(h)
    .send({
      sessionId: a.session._id,
      classId: a.cls._id,
      items: [
        { feeHeadId: tuition._id, amount: 100000, cycle: 'monthly', dueDay: 10 },
        { feeHeadId: exam._id, amount: 50000, cycle: 'one_time' },
      ],
    });
  if (structure.status !== 201) throw new Error(`structure failed ${JSON.stringify(structure.body)}`);
  const students: any[] = [];
  for (let i = 0; i < studentCount; i++) {
    students.push(
      (
        await agent()
          .post('/api/v1/students')
          .set(h)
          .send(newStudent(a.cls._id, a.sections[0]._id, { name: `Kid ${i + 1}`, guardians: [] }))
      ).body.data,
    );
  }
  return { ...a, heads, tuition, exam, students, h };
};

export const generate = (
  h: Record<string, string>,
  ctx: { session: any; cls: any },
  over: Record<string, unknown> = {},
  key = randomUUID(),
) =>
  agent()
    .post('/api/v1/invoices/generate')
    .set(h)
    .set('Idempotency-Key', key)
    .send({
      sessionId: ctx.session._id,
      classId: ctx.cls._id,
      periodLabel: '2026-03',
      cycle: 'monthly',
      dueDate: '2026-03-10',
      ...over,
    });

export const pay = (h: Record<string, string>, body: Record<string, unknown>, key = randomUUID()) =>
  agent()
    .post('/api/v1/payments')
    .set(h)
    .set('Idempotency-Key', key)
    .send({ method: 'cash', ...body });

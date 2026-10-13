import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { AttendanceSheet } from '../src/app/modules/attendance/attendance.model';
import { runUnscoped } from '../src/app/lib/tenantContext';
import { addDays, dayOfWeek, todayLocal } from '../src/app/lib/localDate';
import { agent, authed, login, registerTenant } from './helpers/api';
import { newStudent, setupAcademic } from './helpers/academic';
import { useTestDb } from './helpers/db';

useTestDb();

/** The most recent non-Friday date that is not in the future. */
const workday = (back = 1) => {
  let d = addDays(todayLocal(), -back);
  while (dayOfWeek(d) === 5) d = addDays(d, -1);
  return d;
};

const setup = async () => {
  const t = await registerTenant();
  const h = authed(t.token);
  const a = await setupAcademic(t);
  const kids: any[] = [];
  for (const n of ['Anik', 'Babu', 'Chandra']) {
    kids.push(
      (
        await agent()
          .post('/api/v1/students')
          .set(h)
          .send(newStudent(a.cls._id, a.sections[0]._id, { name: n, guardians: [] }))
      ).body.data,
    );
  }
  return { t, h, ...a, kids };
};

describe('attendance', () => {
  it('returns a blank roster pre-filled present, then stores exceptions only', async () => {
    const { h, sections, kids } = await setup();
    const date = workday();
    const blank = await agent()
      .get('/api/v1/attendance/sheet')
      .set(h)
      .query({ sectionId: sections[0]._id, date });
    expect(blank.body.data.exists).toBe(false);
    expect(blank.body.data.records.map((r: any) => r.status)).toEqual(['present', 'present', 'present']);

    const res = await agent()
      .post('/api/v1/attendance')
      .set(h)
      .send({ sectionId: sections[0]._id, date, records: [{ studentId: kids[1]._id, status: 'absent' }] });
    expect(res.status).toBe(201);
    const statuses = res.body.data.sheet.records.map((r: any) => r.status);
    expect(statuses).toEqual(['present', 'absent', 'present']);
  });

  it('a second submit for the same date returns the existing sheet instead of a duplicate', async () => {
    const { h, sections } = await setup();
    const date = workday(2);
    const first = await agent()
      .post('/api/v1/attendance')
      .set(h)
      .send({ sectionId: sections[0]._id, date, records: [] });
    const second = await agent()
      .post('/api/v1/attendance')
      .set(h)
      .send({ sectionId: sections[0]._id, date, records: [] });
    expect(second.status).toBe(200);
    expect(second.body.data.existing).toBe(true);
    expect(second.body.data.sheet._id).toBe(first.body.data.sheet._id);
    expect(
      await runUnscoped(() => AttendanceSheet.countDocuments({ sectionId: sections[0]._id, date })),
    ).toBe(1);
  });

  it('rejects future dates and weekend days unless flagged', async () => {
    const { h, sections } = await setup();
    const future = await agent()
      .post('/api/v1/attendance')
      .set(h)
      .send({ sectionId: sections[0]._id, date: addDays(todayLocal(), 2), records: [] });
    expect(future.body.code).toBe('FUTURE_DATE');
    let friday = addDays(todayLocal(), -1);
    while (dayOfWeek(friday) !== 5) friday = addDays(friday, -1);
    const blocked = await agent()
      .post('/api/v1/attendance')
      .set(h)
      .send({ sectionId: sections[0]._id, date: friday, records: [] });
    expect(blocked.body.code).toBe('WEEKEND_DATE');
    const allowed = await agent()
      .post('/api/v1/attendance')
      .set(h)
      .send({ sectionId: sections[0]._id, date: friday, records: [], allowWeekend: true });
    expect(allowed.status).toBe(201);
  });

  it('teacher edit window: editable inside it, blocked after it, admin edit after the window is audited', async () => {
    const { t, h, cls, sections, session, kids } = await setup();
    const teacher = (
      await agent()
        .post('/api/v1/users')
        .set(h)
        .send({ role: 'teacher', name: 'Att Sir', email: 'att@example.com', password: 'Teacher#12345' })
    ).body.data.user;
    const subj = (
      await agent()
        .post('/api/v1/subjects')
        .set(h)
        .send({ name: 'Math', components: [{ key: 'total', label: 'Total', fullMarks: 100, passMarks: 33 }] })
    ).body.data;
    await agent()
      .post('/api/v1/class-subjects')
      .set(h)
      .send({ sessionId: session._id, classId: cls._id, subjectId: subj._id, teacherId: teacher.id });
    const tTok = authed((await login(t.slug, 'att@example.com', 'Teacher#12345')).body.data.accessToken);

    const date = workday(3);
    const made = await agent()
      .post('/api/v1/attendance')
      .set(tTok)
      .send({ sectionId: sections[0]._id, date, records: [] });
    expect(made.status).toBe(201);
    const id = made.body.data.sheet._id;
    expect(
      (
        await agent()
          .patch(`/api/v1/attendance/${id}`)
          .set(tTok)
          .send({ records: [{ studentId: kids[0]._id, status: 'late' }] })
      ).status,
    ).toBe(200);

    await runUnscoped(() =>
      AttendanceSheet.updateOne({ _id: id }, { $set: { takenAt: new Date(Date.now() - 48 * 3_600_000) } }),
    );
    const late = await agent()
      .patch(`/api/v1/attendance/${id}`)
      .set(tTok)
      .send({ records: [{ studentId: kids[0]._id, status: 'absent' }] });
    expect(late.status).toBe(403);
    expect(late.body.code).toBe('EDIT_WINDOW_CLOSED');

    expect(
      (
        await agent()
          .patch(`/api/v1/attendance/${id}`)
          .set(h)
          .send({ records: [{ studentId: kids[0]._id, status: 'absent' }] })
      ).status,
    ).toBe(200);
    const audit = await agent()
      .get('/api/v1/audit-logs')
      .set(h)
      .query({ action: 'attendance.edit_after_window' });
    expect(audit.status).toBe(200);
    expect(audit.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('a teacher who is not assigned cannot take attendance', async () => {
    const { t, h, sections } = await setup();
    await agent()
      .post('/api/v1/users')
      .set(h)
      .send({ role: 'teacher', name: 'Stranger', email: 'str@example.com', password: 'Teacher#12345' });
    const tok = authed((await login(t.slug, 'str@example.com', 'Teacher#12345')).body.data.accessToken);
    const res = await agent()
      .post('/api/v1/attendance')
      .set(tok)
      .send({ sectionId: sections[0]._id, date: workday(), records: [] });
    expect(res.status).toBe(403);
  });

  it('computes percentages with leave excluded and late counted as present', async () => {
    const { h, sections, kids } = await setup();
    const d1 = workday(1),
      d2 = workday(2),
      d3 = workday(3),
      d4 = workday(4);
    const post = (date: string, records: any[]) =>
      agent().post('/api/v1/attendance').set(h).send({ sectionId: sections[0]._id, date, records });
    await post(d1, [{ studentId: kids[0]._id, status: 'absent' }]);
    await post(d2, [{ studentId: kids[0]._id, status: 'late' }]);
    await post(d3, [{ studentId: kids[0]._id, status: 'leave' }]);
    await post(d4, []);
    const from = [d1, d2, d3, d4].sort()[0];
    const to = [d1, d2, d3, d4].sort()[3];
    const rep = await agent()
      .get('/api/v1/attendance/report/section')
      .set(h)
      .query({ sectionId: sections[0]._id, from, to });
    const row = rep.body.data.rows.find((r: any) => r.name === 'Anik');
    expect(row).toMatchObject({ present: 1, late: 1, absent: 1, leave: 1 });
    expect(row.percent).toBe(66.67); // (1 present + 1 late) / (1 + 1 + 1 absent), leave excluded

    const stu = await agent()
      .get(`/api/v1/attendance/report/student/${kids[0]._id}`)
      .set(h)
      .query({ from, to });
    expect(stu.body.data.totals.percent).toBe(66.67);
    expect(stu.body.data.months.length).toBeGreaterThanOrEqual(1);
    void Types;
  });
});

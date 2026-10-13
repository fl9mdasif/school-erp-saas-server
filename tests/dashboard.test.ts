import { describe, expect, it } from 'vitest';
import { agent, authed, login, registerTenant } from './helpers/api';
import { newStudent, setupAcademic } from './helpers/academic';
import { useTestDb } from './helpers/db';

useTestDb();

describe('dashboard summary', () => {
  it('gives each role its own numbers', async () => {
    const t = await registerTenant();
    const h = authed(t.token);
    const { cls, sections, session } = await setupAcademic(t);
    const kid = (await agent().post('/api/v1/students').set(h).send(newStudent(cls._id, sections[0]._id)))
      .body.data;

    const admin = await agent().get('/api/v1/dashboard/summary').set(h);
    expect(admin.body.data).toMatchObject({ role: 'admin', students: 1, staff: 1 });

    const teacher = (
      await agent()
        .post('/api/v1/users')
        .set(h)
        .send({ role: 'teacher', name: 'Dash Sir', email: 'dash@example.com', password: 'Teacher#12345' })
    ).body.data.user;
    const subj = (
      await agent()
        .post('/api/v1/subjects')
        .set(h)
        .send({ name: 'Sci', components: [{ key: 'total', label: 'Total', fullMarks: 100, passMarks: 33 }] })
    ).body.data;
    await agent()
      .post('/api/v1/class-subjects')
      .set(h)
      .send({ sessionId: session._id, classId: cls._id, subjectId: subj._id, teacherId: teacher.id });
    const tTok = authed((await login(t.slug, 'dash@example.com', 'Teacher#12345')).body.data.accessToken);
    const tRes = await agent().get('/api/v1/dashboard/summary').set(tTok);
    expect(tRes.body.data.role).toBe('teacher');
    expect(tRes.body.data.myClasses.length).toBeGreaterThanOrEqual(1);
    expect(tRes.body.data.myClasses[0]).toMatchObject({ students: 1, attendanceTakenToday: false });

    const lg = await agent().post(`/api/v1/students/${kid._id}/create-login`).set(h).send({ student: true });
    const sTok = authed(
      (await login(t.slug, kid.studentId, lg.body.data.student.temporaryPassword)).body.data.accessToken,
    );
    const sRes = await agent().get('/api/v1/dashboard/summary').set(sTok);
    expect(sRes.body.data.children).toHaveLength(1);
    expect(sRes.body.data.students).toBeUndefined();
  });
});

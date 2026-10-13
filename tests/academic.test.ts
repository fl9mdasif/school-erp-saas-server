import { describe, expect, it } from 'vitest';
import { agent, authed, login, registerTenant } from './helpers/api';
import { newStudent, setupAcademic } from './helpers/academic';
import { useTestDb } from './helpers/db';

useTestDb();

describe('academic setup', () => {
  it('creates classes with a hidden default section and keeps exactly one current session', async () => {
    const t = await registerTenant();
    const { cls, sections } = await setupAcademic(t);
    expect(cls.name).toBe('Class 5');
    const list = await agent().get('/api/v1/sections').set(authed(t.token)).query({ classId: cls._id });
    expect(list.body.data.map((s: any) => s.name).sort()).toEqual(['A', 'B']); // default section hidden
    expect(sections).toHaveLength(2);

    const s2 = await agent()
      .post('/api/v1/sessions')
      .set(authed(t.token))
      .send({ name: '2027', startDate: '2027-01-01', endDate: '2027-12-31', isCurrent: true });
    expect(s2.status).toBe(201);
    const all = (await agent().get('/api/v1/sessions').set(authed(t.token))).body.data;
    expect(all.filter((s: any) => s.isCurrent)).toHaveLength(1);
    expect(all.find((s: any) => s.isCurrent).name).toBe('2027');
  });

  it('rejects duplicate class names, bad session dates and teacher-only writes', async () => {
    const t = await registerTenant();
    await setupAcademic(t);
    expect(
      (await agent().post('/api/v1/classes').set(authed(t.token)).send({ name: 'Class 5', order: 5 })).status,
    ).toBe(409);
    expect(
      (
        await agent()
          .post('/api/v1/sessions')
          .set(authed(t.token))
          .send({ name: 'Bad', startDate: '2027-12-31', endDate: '2027-01-01' })
      ).status,
    ).toBe(400);

    await agent()
      .post('/api/v1/users')
      .set(authed(t.token))
      .send({ role: 'teacher', name: 'Teach Er', email: 'te@example.com', password: 'Teacher#12345' });
    const tok = (await login(t.slug, 'te@example.com', 'Teacher#12345')).body.data.accessToken;
    expect((await agent().get('/api/v1/classes').set(authed(tok))).status).toBe(200);
    expect(
      (await agent().post('/api/v1/classes').set(authed(tok)).send({ name: 'Class 6', order: 6 })).status,
    ).toBe(403);
  });

  it('maps subjects to classes, sums component marks and assigns only real teachers', async () => {
    const t = await registerTenant();
    const h = authed(t.token);
    const { cls, session } = await setupAcademic(t);
    const subj = (
      await agent()
        .post('/api/v1/subjects')
        .set(h)
        .send({
          name: 'Bangla',
          components: [
            { key: 'written', label: 'Written', fullMarks: 70, passMarks: 23 },
            { key: 'mcq', label: 'MCQ', fullMarks: 30, passMarks: 10 },
          ],
        })
    ).body.data;
    const teacher = (
      await agent()
        .post('/api/v1/users')
        .set(h)
        .send({ role: 'teacher', name: 'Bangla Sir', email: 'bs@example.com' })
    ).body.data.user;

    const map = await agent()
      .post('/api/v1/class-subjects')
      .set(h)
      .send({ sessionId: session._id, classId: cls._id, subjectId: subj._id, teacherId: teacher.id });
    expect(map.status).toBe(201);
    expect(map.body.data.fullMarks).toBe(100);
    expect(map.body.data.passMarks).toBe(33);

    const dup = await agent()
      .post('/api/v1/class-subjects')
      .set(h)
      .send({ sessionId: session._id, classId: cls._id, subjectId: subj._id });
    expect(dup.status).toBe(409);
    const notTeacher = await agent().post('/api/v1/class-subjects').set(h).send({
      sessionId: session._id,
      classId: cls._id,
      subjectId: subj._id,
      teacherId: '64b000000000000000000001',
    });
    expect(notTeacher.status).toBe(400);

    // cannot delete a subject that is mapped
    expect((await agent().delete(`/api/v1/subjects/${subj._id}`).set(h)).status).toBe(409);
    void newStudent;
  });
});

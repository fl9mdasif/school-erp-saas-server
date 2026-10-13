import { describe, expect, it } from 'vitest';
import { agent, authed, login, registerTenant } from './helpers/api';
import { newStudent, setupAcademic } from './helpers/academic';
import { useTestDb } from './helpers/db';

useTestDb();

describe('notices', () => {
  it('delivers by audience: all, staff, class; hides drafts and expired notices', async () => {
    const t = await registerTenant();
    const h = authed(t.token);
    const { cls, sections } = await setupAcademic(t);
    const kid = (await agent().post('/api/v1/students').set(h).send(newStudent(cls._id, sections[0]._id)))
      .body.data;
    const lg = await agent().post(`/api/v1/students/${kid._id}/create-login`).set(h).send({ student: true });
    const sTok = authed(
      (await login(t.slug, kid.studentId, lg.body.data.student.temporaryPassword)).body.data.accessToken,
    );
    const other = (await agent().post('/api/v1/classes').set(h).send({ name: 'Class 9', order: 9 })).body
      .data;

    const post = (b: object) =>
      agent()
        .post('/api/v1/notices')
        .set(h)
        .send({ body: 'text', ...b });
    await post({ title: 'For everyone', audience: { type: 'all' } });
    await post({ title: 'Staff only', audience: { type: 'staff' } });
    await post({ title: 'Class 5 trip', audience: { type: 'class', classIds: [cls._id] } });
    await post({ title: 'Class 9 exam', audience: { type: 'class', classIds: [other._id] } });
    await post({ title: 'Secret draft', audience: { type: 'all' }, status: 'draft' });
    await post({
      title: 'Old news',
      audience: { type: 'all' },
      publishAt: '2020-01-01',
      expiresAt: '2020-02-01',
    });

    const titles = (await agent().get('/api/v1/notices').set(sTok)).body.data.map((n: any) => n.title).sort();
    expect(titles).toEqual(['Class 5 trip', 'For everyone']);
    const adminTitles = (await agent().get('/api/v1/notices').set(h)).body.data.map((n: any) => n.title);
    expect(adminTitles).toHaveLength(6);
  });

  it('teachers can post only to their own classes and never publicly', async () => {
    const t = await registerTenant();
    const h = authed(t.token);
    const { cls, session } = await setupAcademic(t);
    const other = (await agent().post('/api/v1/classes').set(h).send({ name: 'Class 9', order: 9 })).body
      .data;
    const teacher = (
      await agent()
        .post('/api/v1/users')
        .set(h)
        .send({ role: 'teacher', name: 'Note Sir', email: 'ns@example.com', password: 'Teacher#12345' })
    ).body.data.user;
    const subj = (
      await agent()
        .post('/api/v1/subjects')
        .set(h)
        .send({ name: 'Eng', components: [{ key: 'total', label: 'Total', fullMarks: 100, passMarks: 33 }] })
    ).body.data;
    await agent()
      .post('/api/v1/class-subjects')
      .set(h)
      .send({ sessionId: session._id, classId: cls._id, subjectId: subj._id, teacherId: teacher.id });
    const tTok = authed((await login(t.slug, 'ns@example.com', 'Teacher#12345')).body.data.accessToken);

    const mine = await agent()
      .post('/api/v1/notices')
      .set(tTok)
      .send({ title: 'Homework', body: 'Do page 5', audience: { type: 'class', classIds: [cls._id] } });
    expect(mine.status).toBe(201);
    expect(
      (
        await agent()
          .post('/api/v1/notices')
          .set(tTok)
          .send({ title: 'Nope', body: 'x', audience: { type: 'class', classIds: [other._id] } })
      ).status,
    ).toBe(403);
    expect(
      (
        await agent()
          .post('/api/v1/notices')
          .set(tTok)
          .send({ title: 'Nope', body: 'x', audience: { type: 'all' } })
      ).status,
    ).toBe(403);
    expect(
      (
        await agent()
          .post('/api/v1/notices')
          .set(tTok)
          .send({
            title: 'Nope',
            body: 'x',
            isPublic: true,
            audience: { type: 'class', classIds: [cls._id] },
          })
      ).status,
    ).toBe(403);

    // edit/delete only your own
    const adminNotice = (
      await agent()
        .post('/api/v1/notices')
        .set(h)
        .send({ title: 'Admin notice', body: 'x', audience: { type: 'all' } })
    ).body.data;
    expect(
      (await agent().patch(`/api/v1/notices/${adminNotice._id}`).set(tTok).send({ title: 'Hack' })).status,
    ).toBe(404);
    expect((await agent().delete(`/api/v1/notices/${mine.body.data._id}`).set(tTok)).status).toBe(200);
  });
});

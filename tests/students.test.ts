import { describe, expect, it } from 'vitest';
import { Tenant } from '../src/app/modules/tenant/tenant.model';
import { agent, authed, login, registerTenant } from './helpers/api';
import { newStudent, setupAcademic } from './helpers/academic';
import { useTestDb } from './helpers/db';

useTestDb();

describe('students', () => {
  it('creates student, enrolment and guardian together with a YY-NNNN id and auto roll', async () => {
    const t = await registerTenant();
    const { cls, sections } = await setupAcademic(t);
    const res = await agent()
      .post('/api/v1/students')
      .set(authed(t.token))
      .send(newStudent(cls._id, sections[0]._id, { birthRegistrationNo: '12345678901234567' }));
    expect(res.status).toBe(201);
    expect(res.body.data.studentId).toMatch(/^\d{2}-0001$/);
    expect(res.body.data.enrolment.roll).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain('12345678901234567');

    const second = await agent()
      .post('/api/v1/students')
      .set(authed(t.token))
      .send(newStudent(cls._id, sections[0]._id, { name: 'Student Two', guardians: [] }));
    expect(second.body.data.studentId).toMatch(/-0002$/);
    expect(second.body.data.enrolment.roll).toBe(2);
  });

  it('generates unique student ids under concurrent creates', async () => {
    const t = await registerTenant();
    const { cls, sections } = await setupAcademic(t);
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        agent()
          .post('/api/v1/students')
          .set(authed(t.token))
          .send(
            newStudent(cls._id, sections[0]._id, {
              name: `Concurrent ${i}`,
              guardians: [{ name: 'G', phone: `0171100010${i}`, relation: 'father' }],
            }),
          ),
      ),
    );
    const ok = results.filter((r) => r.status === 201);
    expect(new Set(ok.map((r) => r.body.data.studentId)).size).toBe(ok.length);
    expect(ok.length).toBeGreaterThanOrEqual(6); // roll collisions may reject a few, never duplicate ids
  });

  it('enforces roll uniqueness per section and reuses a guardian by phone', async () => {
    const t = await registerTenant();
    const { cls, sections } = await setupAcademic(t);
    const h = authed(t.token);
    const a = await agent()
      .post('/api/v1/students')
      .set(h)
      .send(
        newStudent(cls._id, sections[0]._id, {
          enrolment: { classId: cls._id, sectionId: sections[0]._id, roll: 7 },
        }),
      );
    expect(a.status).toBe(201);
    const clash = await agent()
      .post('/api/v1/students')
      .set(h)
      .send(
        newStudent(cls._id, sections[0]._id, {
          name: 'Clash',
          enrolment: { classId: cls._id, sectionId: sections[0]._id, roll: 7 },
        }),
      );
    expect(clash.status).toBe(409);
    const otherSection = await agent()
      .post('/api/v1/students')
      .set(h)
      .send(
        newStudent(cls._id, sections[1]._id, {
          name: 'Sibling',
          enrolment: { classId: cls._id, sectionId: sections[1]._id, roll: 7 },
        }),
      );
    expect(otherSection.status).toBe(201);

    const detail = await agent().get(`/api/v1/students/${otherSection.body.data._id}`).set(h);
    expect(detail.body.data.guardians).toHaveLength(1);
    expect(detail.body.data.guardianIds[0]).toBe(a.body.data.guardianIds[0]); // same phone, one guardian
  });

  it('refuses creation at the plan cap with PLAN_LIMIT_REACHED', async () => {
    const t = await registerTenant();
    const { cls, sections } = await setupAcademic(t);
    await Tenant.updateOne({ _id: t.tenantId }, { $set: { studentCap: 1 } });
    expect(
      (
        await agent()
          .post('/api/v1/students')
          .set(authed(t.token))
          .send(newStudent(cls._id, sections[0]._id, { guardians: [] }))
      ).status,
    ).toBe(201);
    const over = await agent()
      .post('/api/v1/students')
      .set(authed(t.token))
      .send(newStudent(cls._id, sections[0]._id, { name: 'Over Cap', guardians: [] }));
    expect(over.status).toBe(403);
    expect(over.body.code).toBe('PLAN_LIMIT_REACHED');
  });

  it('student sees only self, guardian only own children, teacher only assigned classes', async () => {
    const t = await registerTenant();
    const h = authed(t.token);
    const { cls, sections, session } = await setupAcademic(t);
    const s1 = (
      await agent()
        .post('/api/v1/students')
        .set(h)
        .send(newStudent(cls._id, sections[0]._id, { name: 'Alpha Kid' }))
    ).body.data;
    const s2 = (
      await agent()
        .post('/api/v1/students')
        .set(h)
        .send(
          newStudent(cls._id, sections[0]._id, {
            name: 'Beta Kid',
            guardians: [{ name: 'Other Parent', phone: '01711000002', relation: 'mother' }],
          }),
        )
    ).body.data;

    const logins = await agent()
      .post(`/api/v1/students/${s1._id}/create-login`)
      .set(h)
      .send({ student: true, guardianIds: s1.guardianIds });
    expect(logins.status).toBe(201);
    const studentTok = (await login(t.slug, s1.studentId, logins.body.data.student.temporaryPassword)).body
      .data.accessToken;
    const guardianTok = (await login(t.slug, '01711000001', logins.body.data.guardians[0].temporaryPassword))
      .body.data.accessToken;

    expect((await agent().get(`/api/v1/students/${s1._id}`).set(authed(studentTok))).status).toBe(200);
    expect((await agent().get(`/api/v1/students/${s2._id}`).set(authed(studentTok))).status).toBe(404);
    expect((await agent().get('/api/v1/students').set(authed(studentTok))).status).toBe(403);
    expect((await agent().get('/api/v1/me/students').set(authed(studentTok))).body.data).toHaveLength(1);
    expect((await agent().get(`/api/v1/students/${s2._id}`).set(authed(guardianTok))).status).toBe(404);
    expect(
      (await agent().get('/api/v1/me/students').set(authed(guardianTok))).body.data.map((s: any) => s.name),
    ).toEqual(['Alpha Kid']);

    // teacher without assignments sees nothing; after being mapped to the class sees the class
    const teacher = (
      await agent()
        .post('/api/v1/users')
        .set(h)
        .send({ role: 'teacher', name: 'Class Sir', email: 'cs@example.com', password: 'Teacher#12345' })
    ).body.data.user;
    const teacherTok = (await login(t.slug, 'cs@example.com', 'Teacher#12345')).body.data.accessToken;
    expect((await agent().get('/api/v1/students').set(authed(teacherTok))).body.data).toHaveLength(0);
    expect((await agent().get(`/api/v1/students/${s1._id}`).set(authed(teacherTok))).status).toBe(404);

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
    expect((await agent().get('/api/v1/students').set(authed(teacherTok))).body.data).toHaveLength(2);
    expect((await agent().get(`/api/v1/students/${s1._id}`).set(authed(teacherTok))).status).toBe(200);
    expect(
      (await agent().post('/api/v1/students').set(authed(teacherTok)).send(newStudent(cls._id, undefined)))
        .status,
    ).toBe(403);
  });

  it('soft deletes, hides from lists and deactivates linked logins', async () => {
    const t = await registerTenant();
    const h = authed(t.token);
    const { cls, sections } = await setupAcademic(t);
    const s = (
      await agent()
        .post('/api/v1/students')
        .set(h)
        .send(newStudent(cls._id, sections[0]._id, { guardians: [] }))
    ).body.data;
    const lg = await agent().post(`/api/v1/students/${s._id}/create-login`).set(h).send({ student: true });
    expect((await agent().delete(`/api/v1/students/${s._id}`).set(h)).status).toBe(200);
    expect((await agent().get(`/api/v1/students/${s._id}`).set(h)).status).toBe(404);
    expect((await login(t.slug, s.studentId, lg.body.data.student.temporaryPassword)).status).toBe(401);
  });
});

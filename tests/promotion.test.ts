import { describe, expect, it } from 'vitest';
import { agent, authed, registerTenant } from './helpers/api';
import { newStudent, setupAcademic } from './helpers/academic';
import { useTestDb } from './helpers/db';

useTestDb();

describe('promotion', () => {
  it('preview matches the committed result, nothing is deleted, repeaters stay and rolls are sequential', async () => {
    const t = await registerTenant();
    const h = authed(t.token);
    const { cls, sections, session } = await setupAcademic(t);
    const cls6 = (await agent().post('/api/v1/classes').set(h).send({ name: 'Class 6', order: 6 })).body.data;
    const next = (
      await agent()
        .post('/api/v1/sessions')
        .set(h)
        .send({ name: '2027', startDate: '2027-01-01', endDate: '2027-12-31' })
    ).body.data;

    const kids: any[] = [];
    for (const n of ['Charlie', 'Alice', 'Bob']) {
      kids.push(
        (
          await agent()
            .post('/api/v1/students')
            .set(h)
            .send(newStudent(cls._id, sections[0]._id, { name: n, guardians: [] }))
        ).body.data,
      );
    }
    const body = {
      fromSessionId: session._id,
      toSessionId: next._id,
      fromClassId: cls._id,
      toClassId: cls6._id,
      repeatStudentIds: [kids[2]._id],
      rollMode: 'name',
    };

    const preview = await agent()
      .post('/api/v1/students/promote')
      .query({ dryRun: 'true' })
      .set(h)
      .send(body);
    expect(preview.status).toBe(200);
    expect(preview.body.data).toMatchObject({ dryRun: true, promote: 2, repeat: 1, passOut: 0 });
    // preview wrote nothing
    expect((await agent().get(`/api/v1/students/${kids[0]._id}`).set(h)).body.data.enrolments).toHaveLength(
      1,
    );

    const done = await agent().post('/api/v1/students/promote').set(h).send(body);
    expect(done.body.data).toMatchObject({ dryRun: false, promote: 2, repeat: 1 });
    expect(done.body.data.preview.map((p: any) => `${p.name}:${p.roll}`)).toEqual(
      preview.body.data.preview.map((p: any) => `${p.name}:${p.roll}`),
    );

    const alice = (await agent().get(`/api/v1/students/${kids[1]._id}`).set(h)).body.data;
    expect(alice.enrolments).toHaveLength(2);
    expect(alice.enrolments.map((e: any) => e.status).sort()).toEqual(['active', 'promoted']);
    const bob = (await agent().get(`/api/v1/students/${kids[2]._id}`).set(h)).body.data;
    expect(bob.enrolments.map((e: any) => e.status).sort()).toEqual(['active', 'repeated']);

    // re-running skips students that are already in the target session
    const again = await agent().post('/api/v1/students/promote').query({ dryRun: 'true' }).set(h).send(body);
    expect(again.body.data.conflicts).toHaveLength(3);
    expect(again.body.data.promote + again.body.data.repeat).toBe(0);
  });

  it('can graduate a whole class', async () => {
    const t = await registerTenant();
    const h = authed(t.token);
    const { cls, sections, session } = await setupAcademic(t);
    const next = (
      await agent()
        .post('/api/v1/sessions')
        .set(h)
        .send({ name: '2027', startDate: '2027-01-01', endDate: '2027-12-31' })
    ).body.data;
    const k = (
      await agent()
        .post('/api/v1/students')
        .set(h)
        .send(newStudent(cls._id, sections[0]._id, { guardians: [] }))
    ).body.data;
    const res = await agent()
      .post('/api/v1/students/promote')
      .set(h)
      .send({ fromSessionId: session._id, toSessionId: next._id, fromClassId: cls._id, passOut: true });
    expect(res.body.data.passOut).toBe(1);
    expect((await agent().get(`/api/v1/students/${k._id}`).set(h)).body.data.status).toBe('passed_out');
  });
});

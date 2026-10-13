// Performance gates from PRD section 12. Heavy, so it only runs on request:
//   RUN_PERF=1 npx vitest run tests/perf.test.ts
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { Enrolment } from '../src/app/modules/enrolment/enrolment.model';
import { Mark } from '../src/app/modules/marks/mark.model';
import { Student } from '../src/app/modules/student/student.model';
import { runAsTenant } from '../src/app/lib/tenantContext';
import request from 'supertest';
import { env } from '../src/app/config/env';
import { app, agent, authed, registerTenant } from './helpers/api';
import { setupAcademic } from './helpers/academic';
import { useTestDb } from './helpers/db';

useTestDb();

const STUDENTS = 2000;
const SUBJECTS = 12;

describe.skipIf(!process.env.RUN_PERF)('performance', () => {
  it('publishes 2,000 students x 12 subjects in under 30 seconds and keeps public lookup fast', async () => {
    const t = await registerTenant();
    const h = authed(t.token);
    const { cls, sections, session } = await setupAcademic(t, { sections: ['A'] });
    const tenantId = new Types.ObjectId(t.tenantId);

    const subjectIds: string[] = [];
    for (let i = 0; i < SUBJECTS; i++) {
      const s = (
        await agent()
          .post('/api/v1/subjects')
          .set(h)
          .send({
            name: `Subject ${i + 1}`,
            components: [{ key: 'total', label: 'Total', fullMarks: 100, passMarks: 0 }],
          })
      ).body.data;
      subjectIds.push(s._id);
      await agent()
        .post('/api/v1/class-subjects')
        .set(h)
        .send({ sessionId: session._id, classId: cls._id, subjectId: s._id, order: i });
    }

    const studentDocs = Array.from({ length: STUDENTS }, (_, i) => ({
      _id: new Types.ObjectId(),
      studentId: `P-${String(i + 1).padStart(5, '0')}`,
      name: `Student ${i + 1}`,
      gender: 'male',
      dob: `2014-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
      admittedOn: '2026-01-01',
      status: 'active',
      guardianIds: [],
    }));
    const enrolDocs = studentDocs.map((s, i) => ({
      _id: new Types.ObjectId(),
      studentId: s._id,
      sessionId: session._id,
      classId: cls._id,
      sectionId: sections[0]._id,
      roll: i + 1,
      status: 'active',
    }));
    await runAsTenant(tenantId, async () => {
      await Student.insertMany(studentDocs.map((s, i) => ({ ...s, currentEnrolmentId: enrolDocs[i]._id })));
      await Enrolment.insertMany(enrolDocs);
    });

    const exam = (
      await agent()
        .post('/api/v1/exams')
        .set(h)
        .send({ name: 'Load Exam', sessionId: session._id, classIds: [cls._id] })
    ).body.data;
    await agent().patch(`/api/v1/exams/${exam._id}/status`).set(h).send({ status: 'marks_open' });
    const admin = new Types.ObjectId();
    await runAsTenant(tenantId, async () => {
      const marks: any[] = [];
      for (const e of enrolDocs) {
        for (const sid of subjectIds) {
          const total = 35 + Math.floor(Math.random() * 65);
          marks.push({
            examId: exam._id,
            studentId: e.studentId,
            enrolmentId: e._id,
            classId: cls._id,
            sectionId: sections[0]._id,
            subjectId: sid,
            components: [{ key: 'total', obtained: total, absent: false }],
            total,
            percent: total,
            status: 'submitted',
            enteredBy: admin,
          });
        }
      }
      await Mark.insertMany(marks, { ordered: false });
    });
    await agent().patch(`/api/v1/exams/${exam._id}/status`).set(h).send({ status: 'marks_closed' });

    const started = Date.now();
    const pub = await agent().post(`/api/v1/exams/${exam._id}/publish`).set(h).send({});
    const publishMs = Date.now() - started;
    expect(pub.status).toBe(200);
    expect(pub.body.data.results).toBe(STUDENTS);
    console.log(`publish ${STUDENTS} students x ${SUBJECTS} subjects: ${publishMs} ms`);
    expect(publishMs).toBeLessThan(30_000);

    // public lookup: p95 under 500 ms under a burst
    // Measure like production: one listening server and the public cache on.
    (env as unknown as Record<string, unknown>).PUBLIC_CACHE_TTL_MS = 15_000;
    const server = app.listen(0);
    const url = `/api/v1/public/schools/${t.slug}/results/lookup`;
    const samples: number[] = [];
    for (let batch = 0; batch < 20; batch++) {
      await Promise.all(
        Array.from({ length: 25 }, async (_, k) => {
          const i = (batch * 25 + k) % STUDENTS;
          const t0 = Date.now();
          const res = await request(server)
            .post(url)
            .send({ examId: exam._id, classId: cls._id, roll: i + 1, dob: studentDocs[i].dob });
          samples.push(Date.now() - t0);
          expect(res.status).toBe(200);
        }),
      );
    }
    server.close();
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)];
    console.log(`public lookup p95: ${p95} ms over ${samples.length} requests`);
    expect(p95).toBeLessThan(500);
  }, 300_000);
});

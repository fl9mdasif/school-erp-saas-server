import { describe, expect, it } from 'vitest';
import { agent, authed, login, registerTenant } from './helpers/api';
import { banglaMarks, mathMarks, setupExam } from './helpers/exams';
import { useTestDb } from './helpers/db';

useTestDb();

const put = (tok: Record<string, string>, ex: any, subjectId: string, marks: unknown[]) =>
  agent()
    .put(`/api/v1/exams/${ex.exam._id}/marks`)
    .set(tok)
    .send({ classId: ex.cls._id, sectionId: ex.sections[0]._id, subjectId, marks });
const submit = (tok: Record<string, string>, ex: any, subjectId: string) =>
  agent()
    .post(`/api/v1/exams/${ex.exam._id}/marks/submit`)
    .set(tok)
    .send({ classId: ex.cls._id, sectionId: ex.sections[0]._id, subjectId });
const setStatus = (ex: any, status: string) =>
  agent().patch(`/api/v1/exams/${ex.exam._id}/status`).set(ex.h).send({ status });

describe('exam setup', () => {
  it('uses the default grading scale, walks the state machine and deletes only drafts', async () => {
    const t = await registerTenant();
    const ex = await setupExam(t);
    expect(ex.exam.status).toBe('draft');
    expect(ex.exam.resultVersion).toBe(1);
    expect((await setStatus(ex, 'marks_closed')).status).toBe(409);
    expect((await setStatus(ex, 'marks_open')).body.data.status).toBe('marks_open');
    expect((await agent().delete(`/api/v1/exams/${ex.exam._id}`).set(ex.h)).status).toBe(409);
    expect((await setStatus(ex, 'draft')).body.data.status).toBe('draft');
    expect((await agent().delete(`/api/v1/exams/${ex.exam._id}`).set(ex.h)).status).toBe(200);
  });

  it('validates grading scale bands', async () => {
    const t = await registerTenant();
    const h = authed(t.token);
    const gap = await agent()
      .post('/api/v1/grading-scales')
      .set(h)
      .send({
        name: 'Bad',
        kind: 'percentage',
        bands: [
          { minPercent: 0, maxPercent: 40, letter: 'F' },
          { minPercent: 60, maxPercent: 100, letter: 'A' },
        ],
      });
    expect(gap.body.code).toBe('BANDS_INVALID');
    const ok = await agent()
      .post('/api/v1/grading-scales')
      .set(h)
      .send({
        name: 'Simple',
        kind: 'percentage',
        bands: [
          { minPercent: 0, maxPercent: 49, letter: 'F' },
          { minPercent: 50, maxPercent: 100, letter: 'P' },
        ],
      });
    expect(ok.status).toBe(201);
  });
});

describe('marks entry', () => {
  it('teachers enter only their own subjects; values are validated; submit needs every student', async () => {
    const t = await registerTenant();
    const ex = await setupExam(t);
    await setStatus(ex, 'marks_open');

    expect(
      (
        await put(
          ex.mathTok,
          ex,
          ex.bangla._id,
          banglaMarks(ex.kids, [
            [60, 20],
            [50, 15],
            [40, 12],
          ]),
        )
      ).status,
    ).toBe(403);
    const tooHigh = await put(
      ex.banglaTok,
      ex,
      ex.bangla._id,
      banglaMarks(ex.kids, [
        [71, 20],
        [50, 15],
        [40, 12],
      ]),
    );
    expect(tooHigh.body.code).toBe('MARKS_INVALID');

    const partial = await put(
      ex.banglaTok,
      ex,
      ex.bangla._id,
      banglaMarks(ex.kids.slice(0, 2), [
        [60, 20],
        [50, 15],
      ]),
    );
    expect(partial.body.data.saved).toBe(2);
    const incomplete = await submit(ex.banglaTok, ex, ex.bangla._id);
    expect(incomplete.body.code).toBe('MISSING_MARKS');
    expect(incomplete.body.details.missing).toHaveLength(1);

    await put(
      ex.banglaTok,
      ex,
      ex.bangla._id,
      banglaMarks(ex.kids, [
        [60, 20],
        [50, 15],
        [40, 12],
      ]),
    );
    expect((await submit(ex.banglaTok, ex, ex.bangla._id)).body.data.submitted).toBe(3);

    // submit locks the teacher
    const locked = await put(
      ex.banglaTok,
      ex,
      ex.bangla._id,
      banglaMarks(ex.kids, [
        [1, 1],
        [1, 1],
        [1, 1],
      ]),
    );
    expect(locked.body.code).toBe('MARK_LOCKED');
    // only admin can unlock
    const unlockBody = { classId: ex.cls._id, sectionId: ex.sections[0]._id, subjectId: ex.bangla._id };
    expect(
      (await agent().post(`/api/v1/exams/${ex.exam._id}/marks/unlock`).set(ex.banglaTok).send(unlockBody))
        .status,
    ).toBe(403);
    expect(
      (await agent().post(`/api/v1/exams/${ex.exam._id}/marks/unlock`).set(ex.h).send(unlockBody)).body.data
        .unlocked,
    ).toBe(3);
    expect(
      (
        await put(
          ex.banglaTok,
          ex,
          ex.bangla._id,
          banglaMarks(ex.kids, [
            [61, 20],
            [50, 15],
            [40, 12],
          ]),
        )
      ).status,
    ).toBe(200);
  });

  it('refuses entry when marks are not open and shows progress', async () => {
    const t = await registerTenant();
    const ex = await setupExam(t);
    expect(
      (
        await put(
          ex.banglaTok,
          ex,
          ex.bangla._id,
          banglaMarks(ex.kids, [
            [60, 20],
            [50, 15],
            [40, 12],
          ]),
        )
      ).body.code,
    ).toBe('MARKS_CLOSED');
    await setStatus(ex, 'marks_open');
    await put(
      ex.banglaTok,
      ex,
      ex.bangla._id,
      banglaMarks(ex.kids, [
        [60, 20],
        [50, 15],
        [40, 12],
      ]),
    );
    const p = (await agent().get(`/api/v1/exams/${ex.exam._id}/progress`).set(ex.h)).body.data;
    expect(p.complete).toBe(false);
    const row = p.rows.find((r: any) => r.subject === 'Bangla');
    expect(row).toMatchObject({ students: 3, entered: 3, submitted: 0 });
  });

  it('absent students count as zero and fail the component', async () => {
    const t = await registerTenant();
    const ex = await setupExam(t);
    await setStatus(ex, 'marks_open');
    const marks = banglaMarks(ex.kids, [
      [60, 20],
      [50, 15],
      [40, 12],
    ]);
    marks[2].components[1] = { key: 'mcq', obtained: null as any, absent: true };
    await put(ex.banglaTok, ex, ex.bangla._id, marks);
    const sheet = (
      await agent()
        .get(`/api/v1/exams/${ex.exam._id}/marks-sheet`)
        .set(ex.banglaTok)
        .query({ classId: ex.cls._id, sectionId: ex.sections[0]._id, subjectId: ex.bangla._id })
    ).body.data;
    const chandra = sheet.rows.find((r: any) => r.name === 'Chandra');
    expect(chandra.total).toBe(40);
    expect(chandra.letter).toBe('F');
  });
});

describe('results lifecycle', () => {
  const full = async () => {
    const t = await registerTenant();
    const ex = await setupExam(t);
    await setStatus(ex, 'marks_open');
    // Anik 85 (60+25) and 90; Babu 65 (50+15) and 70; Chandra 40 (28+12) and 30 -> fails Math
    await put(
      ex.banglaTok,
      ex,
      ex.bangla._id,
      banglaMarks(ex.kids, [
        [60, 25],
        [50, 15],
        [28, 12],
      ]),
    );
    await put(ex.mathTok, ex, ex.math._id, mathMarks(ex.kids, [90, 70, 30]));
    await submit(ex.banglaTok, ex, ex.bangla._id);
    await submit(ex.mathTok, ex, ex.math._id);
    await setStatus(ex, 'marks_closed');
    return { t, ex };
  };

  it('calculates GPA, positions and a summary', async () => {
    const { ex } = await full();
    const calc = await agent().post(`/api/v1/exams/${ex.exam._id}/calculate`).set(ex.h);
    expect(calc.body.data).toMatchObject({ calculated: 3, passed: 2, failed: 1 });
    expect(
      (await agent().post(`/api/v1/exams/${ex.exam._id}/calculate`).set(ex.h)).body.data.calculated,
    ).toBe(3); // idempotent
    const res = (await agent().get(`/api/v1/exams/${ex.exam._id}/results`).set(ex.h)).body.data;
    const by = (n: string) => res.results.find((r: any) => r.name === n);
    expect(by('Anik')).toMatchObject({
      gpa: 5,
      letter: 'A+',
      passed: true,
      positionInClass: 1,
      totalMarks: 175,
    });
    expect(by('Babu')).toMatchObject({ gpa: 3.75, passed: true, positionInClass: 2 }); // (3.5 + 4) / 2
    expect(by('Chandra')).toMatchObject({ gpa: 0, letter: 'F', passed: false, positionInClass: 3 });
    expect(res.summary).toMatchObject({ students: 3, passed: 2, failed: 1, passRate: 66.67 });
    expect(res.exam.status).toBe('marks_closed');
  });

  it('publish refuses incomplete marks unless forced, locks everything and is retry safe', async () => {
    const t = await registerTenant();
    const ex = await setupExam(t);
    await setStatus(ex, 'marks_open');
    await put(
      ex.banglaTok,
      ex,
      ex.bangla._id,
      banglaMarks(ex.kids, [
        [60, 25],
        [50, 15],
        [28, 12],
      ]),
    );
    await submit(ex.banglaTok, ex, ex.bangla._id);
    await setStatus(ex, 'marks_closed'); // Math was never entered
    const blocked = await agent().post(`/api/v1/exams/${ex.exam._id}/publish`).set(ex.h).send({});
    expect(blocked.body.code).toBe('MARKS_INCOMPLETE');

    const forced = await agent()
      .post(`/api/v1/exams/${ex.exam._id}/publish`)
      .set(ex.h)
      .send({ forceMissingAsAbsent: true });
    expect(forced.status).toBe(200);
    expect(forced.body.data).toMatchObject({ alreadyPublished: false, results: 3, filledAbsent: 3 });
    const again = await agent().post(`/api/v1/exams/${ex.exam._id}/publish`).set(ex.h).send({});
    expect(again.body.data.alreadyPublished).toBe(true);

    // missing Math became absent: everybody fails Math -> nobody passes
    const res = (await agent().get(`/api/v1/exams/${ex.exam._id}/results`).set(ex.h)).body.data;
    expect(res.summary.passed).toBe(0);
    // locked: marks cannot be edited directly, exam cannot be edited or reopened
    expect((await put(ex.mathTok, ex, ex.math._id, mathMarks(ex.kids, [50, 50, 50]))).body.code).toBe(
      'MARKS_CLOSED',
    );
    expect((await setStatus(ex, 'marks_open')).status).toBe(409);
    expect((await agent().post(`/api/v1/exams/${ex.exam._id}/calculate`).set(ex.h)).status).toBe(409);
  });

  it('correction after publish bumps the version, re-ranks the class and writes an audit entry with before, after and reason', async () => {
    const { ex } = await full();
    await agent().post(`/api/v1/exams/${ex.exam._id}/publish`).set(ex.h).send({});
    const chandra = ex.kids[2];
    const bad = await agent()
      .post(`/api/v1/exams/${ex.exam._id}/results/${chandra._id}/correct`)
      .set(ex.h)
      .send({ reason: 'x', changes: [] });
    expect(bad.status).toBe(400);
    const fix = await agent()
      .post(`/api/v1/exams/${ex.exam._id}/results/${chandra._id}/correct`)
      .set(ex.h)
      .send({
        reason: 'Math script re-checked, marks were mis-added',
        changes: [{ subjectId: ex.math._id, components: [{ key: 'total', obtained: 95, absent: false }] }],
      });
    expect(fix.status).toBe(200);
    expect(fix.body.data).toMatchObject({ passed: true, version: 2 });

    const res = (await agent().get(`/api/v1/exams/${ex.exam._id}/results`).set(ex.h)).body.data;
    expect(res.exam.resultVersion).toBe(2);
    const by = (n: string) => res.results.find((r: any) => r.name === n);
    expect(by('Chandra').positionInClass).toBeLessThan(by('Babu').positionInClass);

    const audit = (await agent().get('/api/v1/audit-logs').set(ex.h).query({ action: 'result.correct' })).body
      .data[0];
    expect(audit.reason).toMatch(/re-checked/);
    expect(audit.before.passed).toBe(false);
    expect(audit.after.passed).toBe(true);
    expect(audit.before.marks).toBeTruthy();
    expect(
      (
        await agent()
          .post(`/api/v1/exams/${ex.exam._id}/results/${chandra._id}/correct`)
          .set(ex.banglaTok)
          .send({
            reason: 'teacher cannot do this',
            changes: [{ subjectId: ex.math._id, components: [{ key: 'total', obtained: 1, absent: false }] }],
          })
      ).status,
    ).toBe(403);
  });

  it('students see only published results of themselves; merit list and marksheet PDF work', async () => {
    const { t, ex } = await full();
    const lg = await agent()
      .post(`/api/v1/students/${ex.kids[0]._id}/create-login`)
      .set(ex.h)
      .send({ student: true });
    const sTok = authed(
      (await login(t.slug, ex.kids[0].studentId, lg.body.data.student.temporaryPassword)).body.data
        .accessToken,
    );
    expect((await agent().get('/api/v1/me/results').set(sTok)).body.data).toHaveLength(0);
    expect((await agent().get('/api/v1/exams').set(sTok)).body.data).toHaveLength(0); // draft/closed exams are invisible

    await agent().post(`/api/v1/exams/${ex.exam._id}/publish`).set(ex.h).send({});
    const mine = (await agent().get('/api/v1/me/results').set(sTok)).body.data;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ examName: 'Half Yearly', gpa: 5 });
    expect(
      (await agent().get(`/api/v1/me/results/${ex.exam._id}/${ex.kids[1]._id}/marksheet.pdf`).set(sTok))
        .status,
    ).toBe(404);
    const pdf = await agent()
      .get(`/api/v1/me/results/${ex.exam._id}/${ex.kids[0]._id}/marksheet.pdf`)
      .set(sTok)
      .buffer(true)
      .parse((res, cb) => {
        const c: Buffer[] = [];
        res.on('data', (d: Buffer) => c.push(d));
        res.on('end', () => cb(null, Buffer.concat(c)));
      });
    expect(pdf.status).toBe(200);
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

    const merit = await agent()
      .get(`/api/v1/exams/${ex.exam._id}/merit-list`)
      .set(ex.h)
      .query({ classId: ex.cls._id });
    expect(merit.body.data.map((m: any) => m.name)).toEqual(['Anik', 'Babu', 'Chandra']);
    const csv = await agent()
      .get(`/api/v1/exams/${ex.exam._id}/merit-list`)
      .set(ex.h)
      .query({ classId: ex.cls._id, format: 'csv' });
    expect(csv.text.split('\r\n')[1]).toContain('Anik');
  });
});

describe('public result lookup', () => {
  const published = async () => {
    const t = await registerTenant();
    const ex = await setupExam(t);
    await setStatus(ex, 'marks_open');
    await put(
      ex.banglaTok,
      ex,
      ex.bangla._id,
      banglaMarks(ex.kids, [
        [60, 25],
        [50, 15],
        [28, 12],
      ]),
    );
    await put(ex.mathTok, ex, ex.math._id, mathMarks(ex.kids, [90, 70, 30]));
    await submit(ex.banglaTok, ex, ex.bangla._id);
    await submit(ex.mathTok, ex, ex.math._id);
    await setStatus(ex, 'marks_closed');
    return { t, ex };
  };
  const body = (ex: any, over: Record<string, unknown> = {}) => ({
    examId: ex.exam._id,
    classId: ex.cls._id,
    roll: 1,
    dob: '2014-01-01',
    ...over,
  });

  it('returns the safe payload only, with no-store, and the same generic error for every failure', async () => {
    const { t, ex } = await published();
    const url = `/api/v1/public/schools/${t.slug}/results/lookup`;
    const hidden = await agent().post(url).send(body(ex));
    expect(hidden.status).toBe(404); // not published yet
    expect(hidden.body).toEqual({
      success: false,
      code: 'RESULT_NOT_FOUND',
      message: 'No result found for the details provided',
    });

    await agent().post(`/api/v1/exams/${ex.exam._id}/publish`).set(ex.h).send({});
    const good = await agent().post(url).send(body(ex));
    expect(good.status).toBe(200);
    expect(good.headers['cache-control']).toBe('no-store');
    expect(good.body.data).toMatchObject({
      school: 'Bright Model School',
      student: { name: 'Anik', roll: 1 },
      gpa: 5,
      grade: 'A+',
      position: 1,
    });
    expect(good.body.data.subjects.map((s: any) => s.name)).toEqual(['Bangla', 'Math']);
    expect(JSON.stringify(good.body)).not.toMatch(/phone|address|guardian|birthRegistration|tenantId|dob/i);

    const wrongRoll = await agent()
      .post(url)
      .send(body(ex, { roll: 99 }));
    const wrongDob = await agent()
      .post(url)
      .send(body(ex, { dob: '2010-10-10' }));
    const wrongExam = await agent()
      .post(url)
      .send(body(ex, { examId: '64b000000000000000000001' }));
    for (const r of [wrongRoll, wrongDob, wrongExam]) expect(r.body).toEqual(hidden.body);
  });

  it('supports the other lookup modes and rejects wrong shapes', async () => {
    const { t, ex } = await published();
    await agent().post(`/api/v1/exams/${ex.exam._id}/publish`).set(ex.h).send({});
    const url = `/api/v1/public/schools/${t.slug}/results/lookup`;
    expect((await agent().post(url).send({ examId: ex.exam._id, classId: ex.cls._id, roll: 1 })).status).toBe(
      400,
    ); // dob required in roll_dob
    await agent().patch('/api/v1/school/settings').set(ex.h).send({ resultLookupMode: 'roll_only' });
    expect(
      (await agent().post(url).send({ examId: ex.exam._id, classId: ex.cls._id, roll: 2 })).body.data.student
        .name,
    ).toBe('Babu');
    await agent().patch('/api/v1/school/settings').set(ex.h).send({ resultLookupMode: 'student_id_dob' });
    expect(
      (
        await agent()
          .post(url)
          .send({ examId: ex.exam._id, studentId: ex.kids[2].studentId, dob: '2014-03-03' })
      ).body.data.student.name,
    ).toBe('Chandra');
    expect(
      (
        await agent()
          .post(url)
          .send({ examId: ex.exam._id, studentId: ex.kids[2].studentId, dob: '2014-03-04' })
      ).status,
    ).toBe(404);
  });

  it('lists published exams for the form, serves a marksheet PDF and stays online when the school is suspended', async () => {
    const { t, ex } = await published();
    const exams = `/api/v1/public/schools/${t.slug}/exams`;
    expect((await agent().get(exams)).body.data).toHaveLength(0);
    await agent().post(`/api/v1/exams/${ex.exam._id}/publish`).set(ex.h).send({});
    const { clearExamListCache } = await import('../src/app/modules/publicResult/publicResult.service');
    clearExamListCache();
    expect((await agent().get(exams)).body.data[0]).toMatchObject({
      name: 'Half Yearly',
      classes: [{ name: 'Class 5' }],
    });

    const { Tenant } = await import('../src/app/modules/tenant/tenant.model');
    await Tenant.updateOne({ _id: t.tenantId }, { $set: { status: 'suspended' } });
    const pdf = await agent()
      .post(`/api/v1/public/schools/${t.slug}/results/marksheet`)
      .send(body(ex))
      .buffer(true)
      .parse((res, cb) => {
        const c: Buffer[] = [];
        res.on('data', (d: Buffer) => c.push(d));
        res.on('end', () => cb(null, Buffer.concat(c)));
      });
    expect(pdf.status).toBe(200);
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('a school cannot see another school results through the public API', async () => {
    const a = await published();
    const b = await registerTenant();
    await agent().post(`/api/v1/exams/${a.ex.exam._id}/publish`).set(a.ex.h).send({});
    const res = await agent().post(`/api/v1/public/schools/${b.slug}/results/lookup`).send(body(a.ex));
    expect(res.status).toBe(404);
    expect((await agent().get(`/api/v1/exams/${a.ex.exam._id}`).set(authed(b.token))).status).toBe(404);
    expect((await agent().get(`/api/v1/exams/${a.ex.exam._id}/results`).set(authed(b.token))).status).toBe(
      404,
    );
  });
});

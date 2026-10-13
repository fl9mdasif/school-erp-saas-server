import { agent, authed, login, type TestTenant } from './api';
import { newStudent, setupAcademic } from './academic';

const comps = [
  { key: 'written', label: 'Written', fullMarks: 70, passMarks: 23 },
  { key: 'mcq', label: 'MCQ', fullMarks: 30, passMarks: 10 },
];

/** Class 5 / section A with 3 students, subjects Bangla and Math (each 100), two teachers, a draft exam. */
export const setupExam = async (t: TestTenant) => {
  const h = authed(t.token);
  const a = await setupAcademic(t, { sections: ['A'] });
  const kids: any[] = [];
  const dobs = ['2014-01-01', '2014-02-02', '2014-03-03'];
  for (const [i, n] of ['Anik', 'Babu', 'Chandra'].entries()) {
    kids.push(
      (
        await agent()
          .post('/api/v1/students')
          .set(h)
          .send(newStudent(a.cls._id, a.sections[0]._id, { name: n, dob: dobs[i], guardians: [] }))
      ).body.data,
    );
  }
  const bangla = (await agent().post('/api/v1/subjects').set(h).send({ name: 'Bangla', components: comps }))
    .body.data;
  const math = (
    await agent()
      .post('/api/v1/subjects')
      .set(h)
      .send({ name: 'Math', components: [{ key: 'total', label: 'Total', fullMarks: 100, passMarks: 0 }] })
  ).body.data;
  const tBangla = (
    await agent()
      .post('/api/v1/users')
      .set(h)
      .send({ role: 'teacher', name: 'Bangla Sir', email: 'bn@example.com', password: 'Teacher#12345' })
  ).body.data.user;
  const tMath = (
    await agent()
      .post('/api/v1/users')
      .set(h)
      .send({ role: 'teacher', name: 'Math Sir', email: 'mt@example.com', password: 'Teacher#12345' })
  ).body.data.user;
  await agent()
    .post('/api/v1/class-subjects')
    .set(h)
    .send({
      sessionId: a.session._id,
      classId: a.cls._id,
      subjectId: bangla._id,
      teacherId: tBangla.id,
      order: 1,
    });
  await agent()
    .post('/api/v1/class-subjects')
    .set(h)
    .send({
      sessionId: a.session._id,
      classId: a.cls._id,
      subjectId: math._id,
      teacherId: tMath.id,
      order: 2,
    });
  const exam = (
    await agent()
      .post('/api/v1/exams')
      .set(h)
      .send({ name: 'Half Yearly', sessionId: a.session._id, classIds: [a.cls._id] })
  ).body.data;
  const banglaTok = authed((await login(t.slug, 'bn@example.com', 'Teacher#12345')).body.data.accessToken);
  const mathTok = authed((await login(t.slug, 'mt@example.com', 'Teacher#12345')).body.data.accessToken);
  return { ...a, h, kids, bangla, math, exam, banglaTok, mathTok };
};

export const banglaMarks = (kids: any[], vals: [number, number][]) =>
  kids.map((k, i) => ({
    studentId: k._id,
    components: [
      { key: 'written', obtained: vals[i][0], absent: false },
      { key: 'mcq', obtained: vals[i][1], absent: false },
    ],
  }));
export const mathMarks = (kids: any[], vals: number[]) =>
  kids.map((k, i) => ({
    studentId: k._id,
    components: [{ key: 'total', obtained: vals[i], absent: false }],
  }));

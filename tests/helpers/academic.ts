import { agent, authed, type TestTenant } from './api';

export const setupAcademic = async (t: TestTenant, over: { sections?: string[] } = {}) => {
  const h = authed(t.token);
  const cls = (await agent().post('/api/v1/classes').set(h).send({ name: 'Class 5', order: 5 })).body.data;
  const sections: any[] = [];
  for (const name of over.sections ?? ['A', 'B']) {
    sections.push((await agent().post('/api/v1/sections').set(h).send({ classId: cls._id, name })).body.data);
  }
  const sessions = (await agent().get('/api/v1/sessions').set(h)).body.data;
  return { cls, sections, session: sessions[0] };
};

export const newStudent = (
  classId: string,
  sectionId: string | undefined,
  over: Record<string, unknown> = {},
) => ({
  name: 'Student One',
  gender: 'male',
  dob: '2014-05-20',
  enrolment: { classId, sectionId },
  guardians: [{ name: 'Father One', phone: '01711000001', relation: 'father' }],
  ...over,
});

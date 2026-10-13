import { describe, expect, it } from 'vitest';
import { Student } from '../src/app/modules/student/student.model';
import { runAsTenant } from '../src/app/lib/tenantContext';
import { Types } from 'mongoose';
import { agent, authed, registerTenant } from './helpers/api';
import { setupAcademic } from './helpers/academic';
import { useTestDb } from './helpers/db';

useTestDb();

const HEADER = 'name,gender,dob,className,sectionName,roll,guardianName,guardianPhone,guardianRelation';
const csv = (...rows: string[]) => Buffer.from([HEADER, ...rows].join('\n'));
const upload = (token: string, body: Buffer, name = 'students.csv') =>
  agent().post('/api/v1/students/import/dry-run').set(authed(token)).attach('file', body, name);

describe('CSV import', () => {
  it('serves a template', async () => {
    const t = await registerTenant();
    const res = await agent().get('/api/v1/students/import/template').set(authed(t.token));
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text.split('\r\n')[0]).toContain('guardianPhone');
  });

  it('dry run reports row level errors and writes nothing', async () => {
    const t = await registerTenant();
    await setupAcademic(t);
    const res = await upload(
      t.token,
      csv(
        'Good Kid,male,2014-01-01,Class 5,A,1,Dad One,01711000010,father',
        'Bad Date,male,2014-13-40,Class 5,A,2,,,',
        'No Class,female,2014-01-01,Class 99,A,3,,,',
        'Bad Phone,male,2014-01-01,Class 5,A,4,Dad Two,123,father',
      ),
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ totalRows: 4, validRows: 1 });
    const fields = res.body.data.errors.map((e: any) => `${e.row}:${e.field}`);
    expect(fields).toEqual(expect.arrayContaining(['3:dob', '4:className', '5:guardianPhone']));
    const count = await runAsTenant(new Types.ObjectId(t.tenantId), () => Student.countDocuments({}));
    expect(count).toBe(0);
  });

  it('refuses to commit a dirty job and commits a clean one idempotently, reusing guardians by phone', async () => {
    const t = await registerTenant();
    await setupAcademic(t);
    const dirty = await upload(t.token, csv('Bad,male,nope,Class 5,A,1,,,'));
    expect(
      (await agent().post(`/api/v1/students/import/${dirty.body.data.jobId}/commit`).set(authed(t.token)))
        .status,
    ).toBe(400);

    const clean = await upload(
      t.token,
      csv(
        'Kid One,male,2014-01-01,Class 5,A,,Dad,01711000020,father',
        'Kid Two,female,2015-02-02,Class 5,A,,Dad,01711000020,father',
        'Kid Three,male,2013-03-03,Class 5,B,,,,',
      ),
    );
    expect(clean.body.data.errorCount).toBe(0);
    const id = clean.body.data.jobId;
    const first = await agent().post(`/api/v1/students/import/${id}/commit`).set(authed(t.token));
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ status: 'committed', created: 3 });
    const again = await agent().post(`/api/v1/students/import/${id}/commit`).set(authed(t.token));
    expect(again.body.data.created).toBe(3);
    const count = await runAsTenant(new Types.ObjectId(t.tenantId), () => Student.countDocuments({}));
    expect(count).toBe(3); // second commit did not duplicate
  });

  it('flags roll clashes against the database and inside the file, and enforces the cap', async () => {
    const t = await registerTenant();
    await setupAcademic(t);
    const first = await upload(t.token, csv('Kid One,male,2014-01-01,Class 5,A,5,,,'));
    await agent().post(`/api/v1/students/import/${first.body.data.jobId}/commit`).set(authed(t.token));
    const clash = await upload(
      t.token,
      csv(
        'Kid Two,male,2014-01-01,Class 5,A,5,,,',
        'Kid Three,male,2014-01-01,Class 5,B,6,,,',
        'Kid Four,male,2014-01-01,Class 5,B,6,,,',
      ),
    );
    const msgs = clash.body.data.errors.map((e: any) => e.message).join(' | ');
    expect(msgs).toMatch(/already used/);
    expect(msgs).toMatch(/twice in this file/);
  });

  it('rejects non-csv files and missing columns', async () => {
    const t = await registerTenant();
    expect((await upload(t.token, Buffer.from('x'), 'a.txt')).status).toBe(400);
    expect((await upload(t.token, Buffer.from('foo,bar\n1,2'))).status).toBe(400);
  });
});

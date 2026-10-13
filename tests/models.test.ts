import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import '../src/app/models';
import { AuditLog, writeAudit } from '../src/app/modules/auditLog/auditLog.model';
import { nextSeq } from '../src/app/modules/counter/counter.model';
import { User } from '../src/app/modules/user/user.model';
import { runAsTenant } from '../src/app/lib/tenantContext';
import { useTestDb } from './helpers/db';

useTestDb();
const T1 = new Types.ObjectId();
const T2 = new Types.ObjectId();

const mkUser = (over: Record<string, unknown>): any => ({
  name: 'U',
  role: 'teacher',
  passwordHash: 'x',
  ...over,
});

describe('Counter', () => {
  it('allocates unique sequence numbers under concurrency, per tenant', async () => {
    const nums = await runAsTenant(T1, () =>
      Promise.all(Array.from({ length: 25 }, () => nextSeq('invoice-2026'))),
    );
    expect(new Set(nums).size).toBe(25);
    expect(Math.max(...nums)).toBe(25);
    const other = await runAsTenant(T2, () => nextSeq('invoice-2026'));
    expect(other).toBe(1);
  });
});

describe('User indexes', () => {
  it('enforces unique email and phone per tenant but not across tenants', async () => {
    await User.init();
    await runAsTenant(T1, () => User.create(mkUser({ email: 'a@x.com', phone: '01711111111' })));
    await expect(runAsTenant(T1, () => User.create(mkUser({ email: 'a@x.com' })))).rejects.toMatchObject({
      code: 11000,
    });
    await expect(runAsTenant(T1, () => User.create(mkUser({ phone: '01711111111' })))).rejects.toMatchObject({
      code: 11000,
    });
    await runAsTenant(T2, () => User.create(mkUser({ email: 'a@x.com', phone: '01711111111' })));
  });

  it('allows students to share a phone but not a studentLoginId', async () => {
    await runAsTenant(T1, () =>
      User.create(mkUser({ role: 'student', studentLoginId: '26-0001', phone: '01822222222' })),
    );
    await runAsTenant(T1, () =>
      User.create(mkUser({ role: 'student', studentLoginId: '26-0002', phone: '01822222222' })),
    );
    await expect(
      runAsTenant(T1, () => User.create(mkUser({ role: 'student', studentLoginId: '26-0001' }))),
    ).rejects.toMatchObject({ code: 11000 });
  });
});

describe('AuditLog', () => {
  it('writes entries and refuses updates and deletes', async () => {
    const actor = new Types.ObjectId();
    await runAsTenant(T1, () =>
      writeAudit({ actorId: actor, actorRole: 'admin', action: 'user.role_change', entityType: 'User' }),
    );
    const rows = await runAsTenant(T1, () => AuditLog.find({}).lean());
    expect(rows).toHaveLength(1);
    await expect(runAsTenant(T1, () => AuditLog.updateOne({}, { $set: { action: 'x' } }))).rejects.toThrow(
      /APPEND_ONLY/,
    );
    await expect(runAsTenant(T1, () => AuditLog.deleteMany({}))).rejects.toThrow(/APPEND_ONLY/);
  });
});

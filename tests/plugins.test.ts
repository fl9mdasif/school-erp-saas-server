import mongoose, { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { createTenantSchema, PLATFORM_MODELS } from '../src/app/plugins/createTenantSchema';
import { runAsTenant, runUnscoped } from '../src/app/lib/tenantContext';
import { useTestDb } from './helpers/db';

useTestDb();

const Thing = mongoose.model(
  'TestThing',
  createTenantSchema({ name: { type: String, required: true } }, { softDelete: true }),
);
const A = new Types.ObjectId();
const B = new Types.ObjectId();
const userA = new Types.ObjectId();

describe('tenantScoped', () => {
  it('throws when a query has no tenant context', async () => {
    await expect(Thing.find({})).rejects.toThrow(/TENANT_CONTEXT_MISSING/);
    await expect(Thing.create({ name: 'x' })).rejects.toThrow(/TENANT_CONTEXT_MISSING/);
  });

  it('stamps tenantId and createdBy on create, and isolates reads', async () => {
    const a = await runAsTenant(A, () => Thing.create({ name: 'a1' }), { userId: userA });
    expect(String(a.tenantId)).toBe(String(A));
    expect(String((a as any).createdBy)).toBe(String(userA));
    await runAsTenant(B, () => Thing.create({ name: 'b1' }));

    const seenByA = await runAsTenant(A, () => Thing.find({}).lean());
    expect(seenByA.map((t: any) => t.name)).toEqual(['a1']);
    const countB = await runAsTenant(B, () => Thing.countDocuments({}));
    expect(countB).toBe(1);
  });

  it('cannot read another tenant document by id', async () => {
    const b = await runAsTenant(B, () => Thing.create({ name: 'secret' }));
    expect(await runAsTenant(A, () => Thing.findById(b._id))).toBeNull();
    await runAsTenant(A, () => Thing.deleteOne({ _id: b._id }));
    expect(await runAsTenant(B, () => Thing.findById(b._id))).not.toBeNull();
  });

  it('rejects a mismatched tenantId filter and tenantId updates', async () => {
    await expect(runAsTenant(A, () => Thing.find({ tenantId: B }))).rejects.toThrow(/MISMATCH/);
    await expect(runAsTenant(A, () => Thing.updateMany({}, { $set: { tenantId: B } }))).rejects.toThrow(
      /IMMUTABLE/,
    );
  });

  it('scopes aggregates and insertMany', async () => {
    await runAsTenant(A, () => Thing.insertMany([{ name: 'm1' }, { name: 'm2' }]));
    const agg = await runAsTenant(A, () => Thing.aggregate([{ $count: 'n' }]));
    const total = await runAsTenant(A, () => Thing.countDocuments({}));
    expect(agg[0].n).toBe(total);
    const docs = await runAsTenant(A, () => Thing.find({ name: 'm1' }).lean());
    expect(String((docs[0] as any).tenantId)).toBe(String(A));
  });

  it('unscoped() works only when asked explicitly', async () => {
    const all = await (Thing.find({}) as any).unscoped().lean();
    expect(all.length).toBeGreaterThan(2);
    const viaRun = await runUnscoped(() => Thing.countDocuments({}));
    expect(viaRun).toBe(all.length);
  });
});

describe('softDelete', () => {
  it('hides deleted docs unless withDeleted is used', async () => {
    const d = await runAsTenant(A, () => Thing.create({ name: 'gone' }));
    await runAsTenant(A, () => (d as any).softDelete(userA));
    expect(await runAsTenant(A, () => Thing.findById(d._id))).toBeNull();
    expect(await runAsTenant(A, () => (Thing.findById(d._id) as any).withDeleted())).not.toBeNull();
  });
});

describe('model registry guard', () => {
  it('every model is tenant scoped unless it is a listed platform model', () => {
    // Real models register themselves when their modules load; this guards future ones.
    for (const [name, model] of Object.entries(mongoose.models)) {
      if (PLATFORM_MODELS.includes(name)) continue;
      expect(model.schema.path('tenantId'), `${name} needs tenantId`).toBeTruthy();
    }
  });
});

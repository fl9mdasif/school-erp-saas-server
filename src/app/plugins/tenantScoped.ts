import { Schema, Types } from 'mongoose';
import { getContext } from '../lib/tenantContext';

const QUERY_OPS = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'countDocuments',
  'distinct',
] as const;

const same = (a: unknown, b: unknown) => String(a) === String(b);

const resolveTenant = (query?: { getOptions(): any }): Types.ObjectId | null => {
  const ctx = getContext();
  if (ctx?.unscoped || query?.getOptions().unscoped) return null;
  if (!ctx?.tenantId) throw new Error('TENANT_CONTEXT_MISSING: query ran without a tenant context');
  return ctx.tenantId;
};

/**
 * Forces every query, aggregate and write on this model to belong to the current tenant.
 * Missing tenant context throws. `.unscoped()` / runUnscoped() is the only escape hatch.
 */
export function tenantScoped(schema: Schema): void {
  schema.add({ tenantId: { type: Schema.Types.ObjectId, required: true, index: true, immutable: true } });

  (schema.query as any).unscoped = function (this: any) {
    return this.setOptions({ unscoped: true });
  };

  for (const op of QUERY_OPS) {
    schema.pre(op as any, function (this: any) {
      const tenantId = resolveTenant(this);
      if (!tenantId) return;
      const filter = this.getFilter();
      if (filter.tenantId !== undefined && !same(filter.tenantId, tenantId)) {
        throw new Error('TENANT_CONTEXT_MISMATCH: filter tenantId differs from the active tenant');
      }
      this.setQuery({ ...filter, tenantId });
      const update = typeof this.getUpdate === 'function' ? this.getUpdate() : null;
      if (update) {
        const set = (update as any).$set;
        if (
          (update as any).tenantId !== undefined ||
          set?.tenantId !== undefined ||
          (update as any).$unset?.tenantId !== undefined
        ) {
          throw new Error('TENANT_IMMUTABLE: tenantId cannot be changed');
        }
      }
    });
  }

  schema.pre('aggregate', function (this: any) {
    const ctx = getContext();
    if (ctx?.unscoped || this.options?.unscoped) return;
    if (!ctx?.tenantId) throw new Error('TENANT_CONTEXT_MISSING: aggregate ran without a tenant context');
    this.pipeline().unshift({ $match: { tenantId: ctx.tenantId } });
  });

  schema.pre('validate', function (this: any) {
    if (!this.isNew) return;
    const ctx = getContext();
    if (ctx?.unscoped) {
      if (!this.tenantId)
        throw new Error('TENANT_CONTEXT_MISSING: unscoped create needs an explicit tenantId');
      return;
    }
    if (!ctx?.tenantId) throw new Error('TENANT_CONTEXT_MISSING: create ran without a tenant context');
    if (this.tenantId && !same(this.tenantId, ctx.tenantId)) {
      throw new Error('TENANT_CONTEXT_MISMATCH: document tenantId differs from the active tenant');
    }
    this.tenantId = ctx.tenantId;
  });

  schema.pre('insertMany', function (this: any, docs: any) {
    const list: any[] = Array.isArray(docs) ? docs : [];
    const ctx = getContext();
    if (ctx?.unscoped) return;
    if (!ctx?.tenantId) throw new Error('TENANT_CONTEXT_MISSING: insertMany ran without a tenant context');
    for (const d of list) {
      if (d.tenantId && !same(d.tenantId, ctx.tenantId)) {
        throw new Error('TENANT_CONTEXT_MISMATCH: document tenantId differs from the active tenant');
      }
      d.tenantId = ctx.tenantId;
    }
  });
}

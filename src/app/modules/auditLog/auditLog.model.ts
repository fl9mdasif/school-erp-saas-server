import mongoose, { Schema, Types } from 'mongoose';
import { getContext, runUnscoped } from '../../lib/tenantContext';
import { createTenantSchema } from '../../plugins/createTenantSchema';

const schema = createTenantSchema(
  {
    actorId: { type: Schema.Types.ObjectId, required: true },
    actorRole: { type: String, required: true },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId },
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    reason: String,
    ip: String,
    requestId: String,
  },
  { auditable: false },
);
schema.index({ tenantId: 1, createdAt: -1 });
schema.index({ tenantId: 1, entityType: 1, entityId: 1 });

// Append-only: no update or delete through the model.
for (const op of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
  'replaceOne',
] as const) {
  schema.pre(op as any, () => {
    throw new Error('AUDIT_LOG_APPEND_ONLY');
  });
}

export const AuditLog = mongoose.model('AuditLog', schema) as unknown as mongoose.Model<any>;

export interface AuditInput {
  tenantId?: Types.ObjectId;
  actorId?: Types.ObjectId;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId?: Types.ObjectId;
  before?: unknown;
  after?: unknown;
  reason?: string;
  ip?: string;
  session?: mongoose.ClientSession;
}

/** Writes an audit entry using the request context unless values are given explicitly (platform actions). */
export const writeAudit = async (input: AuditInput) => {
  const ctx = getContext();
  const tenantId = input.tenantId ?? ctx?.tenantId;
  if (!tenantId) throw new Error('writeAudit needs a tenant');
  const doc = new AuditLog({
    tenantId,
    actorId: input.actorId ?? ctx?.userId,
    actorRole: input.actorRole ?? ctx?.role ?? 'system',
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.before,
    after: input.after,
    reason: input.reason,
    ip: input.ip,
    requestId: ctx?.requestId,
  });
  await runUnscoped(() => doc.save({ session: input.session }));
  return doc;
};

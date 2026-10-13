import type { AnyBulkWriteOperation, Model } from 'mongoose';
import { requireTenantId } from './tenantContext';

/**
 * bulkWrite bypasses model middleware, so tenant scoping is applied here by hand:
 * every filter and every inserted document carries the active tenantId.
 */
export const scopedBulkWrite = async (model: Model<any>, ops: AnyBulkWriteOperation<any>[]) => {
  if (!ops.length) return;
  const tenantId = requireTenantId();
  const scoped = ops.map((op: any) => {
    if (op.updateOne) {
      return {
        updateOne: {
          ...op.updateOne,
          filter: { ...op.updateOne.filter, tenantId },
          update: op.updateOne.upsert
            ? {
                ...op.updateOne.update,
                $setOnInsert: { ...(op.updateOne.update.$setOnInsert ?? {}), tenantId },
              }
            : op.updateOne.update,
        },
      };
    }
    if (op.updateMany)
      return { updateMany: { ...op.updateMany, filter: { ...op.updateMany.filter, tenantId } } };
    if (op.insertOne) return { insertOne: { document: { ...op.insertOne.document, tenantId } } };
    throw new Error('scopedBulkWrite supports updateOne, updateMany and insertOne only');
  });
  return model.bulkWrite(scoped as any, { ordered: false });
};

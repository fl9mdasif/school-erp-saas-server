import { Schema } from 'mongoose';
import { getContext } from '../lib/tenantContext';

/** Stamps createdBy / updatedBy from the request context. */
export function auditable(schema: Schema): void {
  schema.add({
    createdBy: { type: Schema.Types.ObjectId },
    updatedBy: { type: Schema.Types.ObjectId },
  });

  schema.pre('save', function (this: any) {
    const userId = getContext()?.userId;
    if (!userId) return;
    if (this.isNew && !this.createdBy) this.createdBy = userId;
    this.updatedBy = userId;
  });

  for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate'] as const) {
    schema.pre(op as any, function (this: any) {
      const userId = getContext()?.userId;
      if (!userId) return;
      // Aggregation-pipeline updates cannot be mixed with $set; those callers set updatedBy themselves.
      if (Array.isArray(this.getUpdate())) return;
      this.set({ updatedBy: userId });
    });
  }
}

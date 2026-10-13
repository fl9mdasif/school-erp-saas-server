import mongoose, { ClientSession } from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';

const schema = createTenantSchema(
  {
    key: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { auditable: false },
);
schema.index({ tenantId: 1, key: 1 }, { unique: true });

export const Counter = mongoose.model('Counter', schema) as unknown as mongoose.Model<any>;

/** Atomic per-tenant sequence. Key examples: 'student-26', 'invoice-2026', 'receipt-2026'. */
export const nextSeq = async (key: string, session?: ClientSession): Promise<number> => {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const doc = await Counter.findOneAndUpdate(
        { key },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after', session, setDefaultsOnInsert: true },
      );
      return (doc as any).seq as number;
    } catch (err: any) {
      if (err?.code !== 11000) throw err; // two first-time upserts raced, retry
    }
  }
  throw new Error('Could not allocate sequence number');
};

import { Schema, Types } from 'mongoose';

const READ_OPS = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'updateOne',
  'updateMany',
  'countDocuments',
  'distinct',
] as const;

/** Adds isDeleted/deletedAt and hides deleted docs from reads. Use `.withDeleted()` to include them. */
export function softDelete(schema: Schema): void {
  schema.add({
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId },
  });

  (schema.query as any).withDeleted = function (this: any) {
    return this.setOptions({ withDeleted: true });
  };

  for (const op of READ_OPS) {
    schema.pre(op as any, function (this: any) {
      if (this.getOptions().withDeleted) return;
      const filter = this.getFilter();
      if (filter.isDeleted === undefined) this.setQuery({ ...filter, isDeleted: { $ne: true } });
    });
  }

  schema.pre('aggregate', function (this: any) {
    if (this.options?.withDeleted) return;
    this.pipeline().unshift({ $match: { isDeleted: { $ne: true } } });
  });

  schema.methods.softDelete = async function (this: any, userId?: Types.ObjectId) {
    this.isDeleted = true;
    this.deletedAt = new Date();
    if (userId) this.deletedBy = userId;
    return this.save();
  };
}

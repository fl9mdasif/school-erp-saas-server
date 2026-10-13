import { Types } from 'mongoose';
import { z } from 'zod';

export const objectIdSchema = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v) && String(new Types.ObjectId(v)) === v, 'Invalid id');
export const idParams = z.strictObject({ id: objectIdSchema });
export const toObjectId = (v: string) => new Types.ObjectId(v);

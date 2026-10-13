import type { Model } from 'mongoose';
import { AppError } from '../errors/AppError';

/** Throws 409 IN_USE when any document in `model` matches `filter`. */
export const assertNotInUse = async (model: Model<any>, filter: Record<string, unknown>, what: string) => {
  if (await model.exists(filter)) throw AppError.conflict(`Cannot delete: ${what} is in use`, 'IN_USE');
};

import type { ClientSession, Types } from 'mongoose';
import { Guardian } from './guardian.model';

export interface GuardianInput {
  name: string;
  phone: string;
  relation: 'father' | 'mother' | 'other';
  occupation?: string;
  address?: string;
}

/** One guardian document per phone per tenant; a second child with the same phone reuses it. */
export const upsertGuardian = async (
  input: GuardianInput,
  studentId: Types.ObjectId,
  session?: ClientSession,
): Promise<{ guardian: any; reused: boolean }> => {
  const existing = await Guardian.findOne({ phone: input.phone }).session(session ?? null);
  if (existing) {
    if (!existing.studentIds.some((id: Types.ObjectId) => id.equals(studentId))) {
      existing.studentIds.push(studentId);
      await existing.save({ session });
    }
    return { guardian: existing, reused: true };
  }
  const [created] = await Guardian.create([{ ...input, studentIds: [studentId] }], { session });
  return { guardian: created, reused: false };
};

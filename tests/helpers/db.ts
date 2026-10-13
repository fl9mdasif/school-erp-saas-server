import mongoose from 'mongoose';
import { afterAll, beforeAll } from 'vitest';

/** Connects each test file to its own database on the shared in-memory replica set. */
export const useTestDb = () => {
  beforeAll(async () => {
    const base = process.env.TEST_MONGO_URI as string;
    const dbName = `t_${Math.random().toString(36).slice(2, 10)}`;
    await mongoose.connect(base, { dbName });
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
};

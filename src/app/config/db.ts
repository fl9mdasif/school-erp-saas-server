import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../lib/logger';

mongoose.set('strictQuery', true);

export const connectDb = async (uri: string = env.DATABASE_URL): Promise<typeof mongoose> => {
  const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  logger.info({ db: conn.connection.name }, 'mongo connected');
  return conn;
};

export const disconnectDb = async (): Promise<void> => {
  await mongoose.disconnect();
};

export const dbReady = (): boolean => mongoose.connection.readyState === 1;

export const pingDb = async (): Promise<boolean> => {
  try {
    await mongoose.connection.db?.admin().ping();
    return true;
  } catch {
    return false;
  }
};

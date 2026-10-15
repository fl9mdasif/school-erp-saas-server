import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../src/app';
import { connectDb, dbReady } from '../src/app/config/db';

const app = createApp();
let connecting: Promise<unknown> | null = null;

/** Vercel serverless entry. The Mongo connection is reused across warm invocations. */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!dbReady()) {
    connecting ??= connectDb().catch((err) => {
      connecting = null;
      throw err;
    });
    await connecting;
  }
  return app(req as any, res as any);
}

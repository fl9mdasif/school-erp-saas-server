import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { runWithContext } from '../lib/tenantContext';

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  const id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', id);
  runWithContext({ requestId: id }, () => next());
};

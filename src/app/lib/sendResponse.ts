import type { Response } from 'express';

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
}

export const ok = <T>(res: Response, data: T, meta?: PageMeta, status = 200) =>
  res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });

export const created = <T>(res: Response, data: T) => ok(res, data, undefined, 201);

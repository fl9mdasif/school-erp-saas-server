import type { RequestHandler } from 'express';

const clean = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.startsWith('$') || k.includes('.')) continue; // drop operator and path injection keys
      out[k] = clean(v);
    }
    return out;
  }
  return value;
};

/** Strips Mongo operator keys. Express 5 makes req.query read-only, so it is redefined. */
export const sanitize: RequestHandler = (req, _res, next) => {
  if (req.body) req.body = clean(req.body);
  Object.defineProperty(req, 'query', { value: clean(req.query), writable: true, configurable: true });
  next();
};

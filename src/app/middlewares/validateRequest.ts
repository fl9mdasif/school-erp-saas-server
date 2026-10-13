import type { RequestHandler } from 'express';
import { z } from 'zod';

export interface RequestSchema {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

const set = (req: object, key: string, value: unknown) =>
  Object.defineProperty(req, key, { value, writable: true, configurable: true });

/** Validates body, query and params. Unknown keys are rejected by using z.strictObject in the schemas. */
export const validateRequest =
  (schema: RequestSchema): RequestHandler =>
  (req, _res, next) => {
    try {
      if (schema.body) req.body = schema.body.parse(req.body ?? {});
      if (schema.query) set(req, 'query', schema.query.parse(req.query));
      if (schema.params) set(req, 'params', schema.params.parse(req.params));
      next();
    } catch (err) {
      next(err);
    }
  };

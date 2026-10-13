import { Router, type RequestHandler } from 'express';
import type { Model } from 'mongoose';
import type { z } from 'zod';
import { AppError } from '../errors/AppError';
import { authenticate, roleGuard } from '../middlewares/auth';
import { validateRequest } from '../middlewares/validateRequest';
import { writeAudit } from '../modules/auditLog/auditLog.model';
import { catchAsync } from './catchAsync';
import { idParams } from './objectId';
import { buildMeta, paginationQuery, toSkip } from './pagination';
import { created, ok } from './sendResponse';
import type { Role } from './tenantContext';
import { z as zod } from 'zod';

export interface CrudOptions {
  /** Entity label used in messages and audit actions, e.g. 'class'. */
  name: string;
  model: Model<any>;
  createBody: z.ZodType;
  updateBody: z.ZodType;
  /** Extra list filters: zod shape merged with pagination. */
  filterShape?: z.ZodRawShape;
  buildFilter?: (q: Record<string, any>) => Record<string, unknown>;
  sort?: Record<string, 1 | -1>;
  readRoles?: Role[];
  writeRoles?: Role[];
  allowDelete?: boolean;
  /** Runs before create/update. Throw AppError to reject. May return a transformed body. */
  prepare?: (body: any, existing?: any) => Promise<any> | any;
  afterCreate?: (doc: any) => Promise<void> | void;
  beforeDelete?: (doc: any) => Promise<void> | void;
  /** Used to hide internal rows (for example default sections) from lists. */
  baseFilter?: Record<string, unknown>;
  populate?: string;
}

const ALL: Role[] = ['admin', 'teacher', 'accountant', 'student', 'guardian'];

/** Standard tenant CRUD router: list, get, create, update, optional delete, audited. */
export function crudRouter(o: CrudOptions): Router {
  const router = Router();
  const read = roleGuard(...(o.readRoles ?? ALL));
  const write = roleGuard(...(o.writeRoles ?? ['admin']));
  router.use(authenticate());

  const query = zod.strictObject({ ...paginationQuery, ...(o.filterShape ?? {}) });

  const list: RequestHandler = catchAsync(async (req, res) => {
    const { page, limit, ...rest } = req.query as any;
    const filter = { ...(o.baseFilter ?? {}), ...(o.buildFilter?.(rest) ?? {}) };
    let q = o.model
      .find(filter)
      .sort(o.sort ?? { createdAt: -1 })
      .skip(toSkip({ page, limit }))
      .limit(limit);
    if (o.populate) q = q.populate(o.populate);
    const [rows, total] = await Promise.all([q.lean(), o.model.countDocuments(filter)]);
    ok(res, rows, buildMeta({ page, limit }, total));
  });

  const getOne = async (id: string) => {
    const doc = await o.model.findOne({ _id: id, ...(o.baseFilter ?? {}) });
    if (!doc) throw AppError.notFound(`${o.name} not found`);
    return doc;
  };

  router.get('/', read, validateRequest({ query }), list);
  router.get(
    '/:id',
    read,
    validateRequest({ params: idParams }),
    catchAsync(async (req, res) => ok(res, await getOne(req.params.id as string))),
  );

  router.post(
    '/',
    write,
    validateRequest({ body: o.createBody }),
    catchAsync(async (req, res) => {
      const body = o.prepare ? await o.prepare(req.body) : req.body;
      const doc = await o.model.create(body);
      await o.afterCreate?.(doc);
      await writeAudit({ action: `${o.name}.create`, entityType: o.name, entityId: doc._id, after: body });
      created(res, doc);
    }),
  );

  router.patch(
    '/:id',
    write,
    validateRequest({ params: idParams, body: o.updateBody }),
    catchAsync(async (req, res) => {
      const doc = await getOne(req.params.id as string);
      const body = o.prepare ? await o.prepare(req.body, doc) : req.body;
      const before = doc.toObject();
      doc.set(body);
      await doc.save();
      await writeAudit({
        action: `${o.name}.update`,
        entityType: o.name,
        entityId: doc._id,
        before,
        after: body,
      });
      ok(res, doc);
    }),
  );

  if (o.allowDelete !== false) {
    router.delete(
      '/:id',
      write,
      validateRequest({ params: idParams }),
      catchAsync(async (req, res) => {
        const doc = await getOne(req.params.id as string);
        await o.beforeDelete?.(doc);
        if (typeof (doc as any).softDelete === 'function') await (doc as any).softDelete(req.auth!.userId);
        else await doc.deleteOne();
        await writeAudit({ action: `${o.name}.delete`, entityType: o.name, entityId: doc._id });
        ok(res, { deleted: true });
      }),
    );
  }
  return router;
}

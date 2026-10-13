import { AsyncLocalStorage } from 'node:async_hooks';
import type { Types } from 'mongoose';

export type Role = 'superAdmin' | 'admin' | 'teacher' | 'accountant' | 'student' | 'guardian';

export interface RequestContext {
  requestId: string;
  tenantId?: Types.ObjectId;
  userId?: Types.ObjectId;
  role?: Role;
  /** Set only by runUnscoped(). Disables the tenantScoped guard for platform code. */
  unscoped?: boolean;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithContext = <T>(ctx: RequestContext, fn: () => T): T => storage.run(ctx, fn);
export const getContext = (): RequestContext | undefined => storage.getStore();

export const requireTenantId = (): Types.ObjectId => {
  const id = storage.getStore()?.tenantId;
  if (!id) throw new Error('TENANT_CONTEXT_MISSING: no tenant in the current context');
  return id;
};

/** Mutate the active context (used by auth and tenant resolution middlewares). */
export const setContext = (patch: Partial<RequestContext>): void => {
  const store = storage.getStore();
  if (!store) throw new Error('No active request context');
  Object.assign(store, patch);
};

/** Run code with tenant context set explicitly (jobs, scripts, tests). Queries are awaited inside the context. */
export const runAsTenant = <T>(
  tenantId: Types.ObjectId,
  fn: () => T,
  extra: Partial<RequestContext> = {},
): Promise<Awaited<T>> =>
  storage.run({ requestId: 'internal', tenantId, ...extra }, async () => await fn()) as Promise<Awaited<T>>;

/** Escape hatch. Allowed only in platform code and internal jobs (a test enforces this). */
export const runUnscoped = <T>(fn: () => T): Promise<Awaited<T>> => {
  const parent = storage.getStore();
  return storage.run(
    { requestId: parent?.requestId ?? 'internal', ...parent, unscoped: true },
    async () => await fn(),
  ) as Promise<Awaited<T>>;
};

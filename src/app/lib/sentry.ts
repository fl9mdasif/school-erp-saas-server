import * as Sentry from '@sentry/node';
import { env } from '../config/env';
import { getContext } from './tenantContext';

let enabled = false;

/** Error reporting is optional: with no SENTRY_DSN nothing is sent and nothing breaks. */
export const initSentry = () => {
  if (!env.SENTRY_DSN || env.isTest) return;
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, tracesSampleRate: 0 });
  enabled = true;
};

export const reportError = (err: unknown) => {
  if (!enabled) return;
  const c = getContext();
  Sentry.withScope((scope) => {
    // Ids only. No names, phone numbers or message bodies are ever attached.
    scope.setTag('tenantId', c?.tenantId?.toString() ?? 'none');
    scope.setTag('requestId', c?.requestId ?? 'none');
    if (c?.userId) scope.setUser({ id: c.userId.toString() });
    Sentry.captureException(err);
  });
};

import { z } from 'zod';

interface Meta {
  schema?: { body?: z.ZodType; query?: z.ZodType; params?: z.ZodType };
  roles?: string[];
  auth?: 'deny' | 'allow' | 'only';
}

interface Context {
  auth?: 'deny' | 'allow' | 'only';
  roles?: string[];
}

const toSchema = (s: z.ZodType) => {
  try {
    return z.toJSONSchema(s, { io: 'input', unrepresentable: 'any' }) as Record<string, any>;
  } catch {
    return { type: 'object' };
  }
};

const paramsOf = (
  shape: Record<string, any> | undefined,
  where: 'query' | 'path',
  required: (k: string) => boolean,
) =>
  Object.entries(shape ?? {}).map(([name, schema]) => ({
    name,
    in: where,
    required: required(name),
    schema,
  }));

const collect = (router: any, prefix: string, inherited: Context, out: any[]) => {
  const ctx: Context = { ...inherited };
  for (const layer of router.stack ?? []) {
    const meta: Meta | undefined = layer.handle?.__meta;
    if (layer.route) {
      const routeCtx = { ...ctx };
      let schema: Meta['schema'];
      for (const l of layer.route.stack) {
        const m: Meta | undefined = l.handle?.__meta;
        if (m?.auth) routeCtx.auth = m.auth;
        if (m?.roles) routeCtx.roles = m.roles;
        if (m?.schema) schema = m.schema;
      }
      for (const method of Object.keys(layer.route.methods))
        out.push({ method, path: prefix + layer.route.path, ctx: routeCtx, schema });
    } else if (layer.handle?.stack) {
      collect(layer.handle, prefix + (layer.handle.__mountPath ?? ''), ctx, out);
    } else if (meta) {
      if (meta.auth) ctx.auth = meta.auth;
      if (meta.roles) ctx.roles = meta.roles;
    }
  }
};

/** OpenAPI 3.1 document generated from the live router and the Zod schemas that guard every route. */
export const buildOpenApi = (apiRouter: any, opts: { title: string; version: string }) => {
  const routes: any[] = [];
  collect(apiRouter, '/api/v1', {}, routes);

  const paths: Record<string, any> = {};
  for (const r of routes) {
    const path = r.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
    const op: Record<string, any> = {
      summary: `${r.method.toUpperCase()} ${path}`,
      tags: [path.split('/')[3] ?? 'root'],
      responses: {
        200: { description: 'Success: { success: true, data, meta? }' },
        '4XX': { description: 'Error: { success: false, code, message, details? }' },
      },
    };
    const secure = r.ctx.auth !== undefined;
    if (secure) op.security = [{ bearerAuth: [] }];
    if (r.ctx.roles) op.description = `Allowed roles: ${r.ctx.roles.join(', ')}`;
    else if (secure) op.description = 'Any signed-in user';
    else op.description = 'Public';
    if (r.ctx.auth === 'only') op.description = 'Platform owner (superAdmin) only';

    const parameters: any[] = [];
    if (r.schema?.query) {
      const js = toSchema(r.schema.query);
      parameters.push(...paramsOf(js.properties, 'query', (k) => (js.required ?? []).includes(k)));
    }
    if (r.schema?.params) {
      const js = toSchema(r.schema.params);
      parameters.push(...paramsOf(js.properties, 'path', () => true));
    } else {
      for (const m of r.path.matchAll(/:([A-Za-z0-9_]+)/g))
        parameters.push({ name: m[1], in: 'path', required: true, schema: { type: 'string' } });
    }
    if (parameters.length) op.parameters = parameters;
    if (r.schema?.body)
      op.requestBody = {
        required: true,
        content: { 'application/json': { schema: toSchema(r.schema.body) } },
      };
    if (r.method === 'post' && (path.endsWith('/payments') || path.endsWith('/invoices/generate'))) {
      op.parameters = [
        ...(op.parameters ?? []),
        {
          name: 'Idempotency-Key',
          in: 'header',
          required: true,
          schema: { type: 'string', minLength: 8, maxLength: 100 },
        },
      ];
    }
    (paths[path] ??= {})[r.method] = op;
  }

  return {
    openapi: '3.1.0',
    info: {
      title: opts.title,
      version: opts.version,
      description:
        'Multi-tenant School Management API. Money is integer poisha. Dates are YYYY-MM-DD (Asia/Dhaka).',
    },
    servers: [{ url: '/' }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    paths,
  };
};

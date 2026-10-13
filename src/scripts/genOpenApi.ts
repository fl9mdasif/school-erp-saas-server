// Writes docs/openapi.json from the live routes. Run: npm run docs:api
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// The route modules read the environment at import time; a documentation run needs no real database or secrets.
process.env.DATABASE_URL ??= 'mongodb://localhost:27017/docs';
process.env.JWT_ACCESS_SECRET ??= 'docs-only-access-secret-123456';
process.env.JWT_REFRESH_SECRET ??= 'docs-only-refresh-secret-12345';

const run = async () => {
  await import('../app/docs/trackMounts.js');
  const { apiRouter } = await import('../app/routes/index.js');
  const { buildOpenApi } = await import('../app/docs/openapi.js');
  const doc = buildOpenApi(apiRouter, { title: 'School Management API', version: '1.0.0' });
  const out = path.resolve(process.cwd(), 'docs', 'openapi.json');
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(doc, null, 2));
  const count = Object.values(doc.paths).reduce((n: number, p: any) => n + Object.keys(p).length, 0);
  console.log(`wrote ${out} (${count} operations)`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

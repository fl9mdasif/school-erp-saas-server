import { connectDb, disconnectDb } from '../app/config/db';
import { env } from '../app/config/env';
import { ensureSuperAdmin } from '../app/modules/platform/platform.seed';

const run = async () => {
  if (!env.SUPER_ADMIN_EMAIL || !env.SUPER_ADMIN_PASS) {
    throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASS must be set in the environment');
  }
  await connectDb();
  const res = await ensureSuperAdmin(env.SUPER_ADMIN_EMAIL, env.SUPER_ADMIN_PASS);
  console.log(
    res.created
      ? `super admin created: ${env.SUPER_ADMIN_EMAIL}`
      : 'super admin already exists, nothing changed',
  );
  await disconnectDb();
};

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

import { connectDb, disconnectDb } from '../app/config/db';
import { seedPlans } from '../app/modules/plan/plan.seed';

const run = async () => {
  await connectDb();
  const plans = await seedPlans();
  console.log(`plans ready: ${plans.map((p) => p.code).join(', ')}`);
  await disconnectDb();
};

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

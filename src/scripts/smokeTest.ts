// Post-restore sanity check: connects, counts the main collections and verifies the ledger is consistent.
import { connectDb, disconnectDb } from '../app/config/db';
import { checkAllTenants } from '../app/jobs/ledgerConsistency';
import '../app/models';
import { Plan } from '../app/modules/plan/plan.model';
import { Tenant } from '../app/modules/tenant/tenant.model';

const run = async () => {
  await connectDb();
  const [tenants, plans] = await Promise.all([Tenant.countDocuments({}), Plan.countDocuments({})]);
  console.log(`tenants: ${tenants}, plans: ${plans}`);
  if (tenants === 0) throw new Error('no tenants found: the restore looks empty');
  const mismatches = await checkAllTenants();
  if (mismatches.length) {
    console.error(JSON.stringify(mismatches, null, 2));
    throw new Error(`ledger inconsistencies in ${mismatches.length} tenant(s)`);
  }
  console.log('ledger consistent for every tenant. smoke test passed');
  await disconnectDb();
};

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

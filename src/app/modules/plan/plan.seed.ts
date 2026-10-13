import { Plan } from './plan.model';

/** Default pricing slabs from the PRD. They are an unvalidated starting guess and editable by the superAdmin. */
export const DEFAULT_PLANS = [
  {
    code: 'starter',
    name: 'Starter',
    priceMonthly: 150000,
    studentCap: 150,
    features: { customDomain: false, csvImport: true, marksheetPdf: true },
  },
  {
    code: 'standard',
    name: 'Standard',
    priceMonthly: 300000,
    studentCap: 500,
    features: { customDomain: true, csvImport: true, marksheetPdf: true },
  },
  {
    code: 'large',
    name: 'Large',
    priceMonthly: 500000,
    studentCap: 1500,
    features: { customDomain: true, csvImport: true, marksheetPdf: true },
  },
];

export const seedPlans = async () => {
  for (const p of DEFAULT_PLANS) {
    await Plan.updateOne({ code: p.code }, { $setOnInsert: p }, { upsert: true });
  }
  return Plan.find({ isActive: true }).sort({ priceMonthly: 1 });
};

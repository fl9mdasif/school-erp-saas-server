import type { Types } from 'mongoose';
import type { Money } from '../../lib/money';

export interface IPlan {
  _id: Types.ObjectId;
  code: string;
  name: string;
  priceMonthly: Money;
  studentCap: number;
  features: { customDomain: boolean; csvImport: boolean; marksheetPdf: boolean };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

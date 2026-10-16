import type { Types } from 'mongoose';

export interface IPlan {
  _id: Types.ObjectId;
  slug: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  yearlyDiscount?: number;
  trialDays?: number;
  isActive: boolean;
  isPopular: boolean;
  features: string[];
  notIncluded: string[];
  createdAt: Date;
  updatedAt: Date;
}

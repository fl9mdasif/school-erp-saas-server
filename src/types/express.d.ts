import type { Types } from 'mongoose';
import type { Role } from '../app/lib/tenantContext';

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: Types.ObjectId; tenantId?: Types.ObjectId; role: Role; isPlatform: boolean };
      tenant?: {
        id: Types.ObjectId;
        slug: string;
        name: string;
        status: 'trial' | 'active' | 'suspended' | 'cancelled';
        redirectedFromAlias?: boolean;
      };
    }
  }
}

export {};

import type { Role } from './tenantContext';

/** Single source for role names: use `ROLE.ADMIN` in route guards instead of raw strings. */
export const ROLE = {
  SUPER_ADMIN: 'superAdmin',
  ADMIN: 'admin',
  TEACHER: 'teacher',
  ACCOUNTANT: 'accountant',
  STUDENT: 'student',
  GUARDIAN: 'guardian',
} as const satisfies Record<string, Role>;

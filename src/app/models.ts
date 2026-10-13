// Registry that loads every Mongoose model. Add each new model here so isolation guards can see it.
export { PlatformAdmin } from './modules/platform/platformAdmin.model';
export { SubscriptionPayment } from './modules/platform/subscriptionPayment.model';
export { Plan } from './modules/plan/plan.model';
export { Tenant } from './modules/tenant/tenant.model';
export { User } from './modules/user/user.model';
export { RefreshToken } from './modules/auth/refreshToken.model';
export { Counter } from './modules/counter/counter.model';
export { AuditLog } from './modules/auditLog/auditLog.model';
export { AcademicSession } from './modules/academicSession/academicSession.model';
export { FeeHead } from './modules/feeHead/feeHead.model';
export { GradingScale } from './modules/gradingScale/gradingScale.model';
export { PasswordReset } from './modules/auth/passwordReset.model';

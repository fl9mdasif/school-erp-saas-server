# Security and rate-limit review

Reviewed against PRD section 9. Everything below is enforced in code and covered by tests.

## Rate limits (express-rate-limit, per client IP unless noted)

| Scope | Limit | Where |
|---|---|---|
| Whole API | 300 requests / minute | `globalLimiter` |
| Login, forgot and reset password | 10 / 15 minutes | `loginLimiter` |
| Institution signup | 10 / hour | `registerLimiter` |
| Slug availability check | 30 / minute | `slugCheckLimiter` |
| Public website reads | 120 / minute | `publicLimiter` |
| Admission inquiry | 5 / hour | `inquiryLimiter` (plus honeypot field) |
| Public result lookup | 10 / minute per IP, and 60 / hour per IP per school | `resultLookupMinuteLimiter`, `resultLookupHourLimiter` |

Account lock: 8 consecutive wrong passwords lock the account for 15 minutes. The response is identical to a wrong password.
The server runs behind one reverse proxy (`trust proxy` = 1) so the limiter sees the real client IP.

## Controls

- Tenant isolation: `tenantScoped` plugin on every tenant model; a query without tenant context throws; `.unscoped()` is allowed only in platform, auth, tenant, audit, public and job code (a test fails the build otherwise); a cross-tenant attack suite runs in CI.
- Tokens: access JWT, refresh token rotated on every use with reuse detection (reuse revokes the whole family), refresh tokens stored as SHA-256 hashes, httpOnly SameSite=Lax cookie scoped to `/api/v1/auth`, custom header required on `/auth/refresh`.
- Passwords: argon2id. Login errors are generic and take similar time for unknown accounts.
- Input: Zod on body, query and params with unknown keys rejected; Mongo operator keys stripped; 1 MB JSON limit, 5 MB CSV limit with a 2,000 row cap.
- Money: integer poisha, append-only ledger (updates and deletes throw), transactions for every multi-document write, idempotency keys on payments and invoice generation.
- Public results: generic "not found" for every failure, `Cache-Control: no-store`, no phone, address, guardian or birth registration data in responses.
- Files: nothing is uploaded through the API. The browser uploads to Cloudinary using a short-lived signed request; stored links must belong to this platform's Cloudinary account.
- Logging: pino with request id, tenant id, user id; authorization, cookies, phone numbers and passwords are redacted.
- Headers: helmet. CORS: dashboard origins only with credentials; public routes allow any origin without credentials.

## Before launch (owner tasks, not code)

- Review madrasa division names with someone who runs a madrasa.
- Confirm grading rules with two or three real teachers.
- Write the privacy policy and terms of service; check current Bangladesh data protection requirements (students are minors).
- Rotate every secret that was ever shared in a chat or committed by mistake, and use new random values in production (`openssl rand -base64 48`).

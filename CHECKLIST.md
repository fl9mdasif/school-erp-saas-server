# Development Checklist

Source of truth for progress. Run `npm run tracker` to regenerate `../development-tracker.html`.
A step is ticked only after typecheck, lint and tests pass, then committed and pushed as `step X.Y: ...`.

## Phase 0: Foundation
- [x] 0.1 Repo init: git, .gitignore, .env.example, CHECKLIST, tracker, README
- [ ] 0.2 Boilerplate: package.json, tsconfig strict, ESLint, Prettier, Vitest, folder skeleton
- [ ] 0.3 Env loader (Zod, fails on invalid) and pino logger
- [ ] 0.4 App and server bootstrap, Mongo connect, graceful shutdown, /health
- [ ] 0.5 Error classes, global error handler, 404, request id, helmet, CORS, rate limit, sanitize
- [ ] 0.6 tenantContext, tenantScoped, softDelete, auditable plugins; money, pagination, localDate libs
- [ ] 0.7 Seed super admin script (argon2id)
- [ ] 0.8 Isolation test harness (two tenants, replset) and CI workflow

## Phase 1: Tenancy and identity
- [ ] 1.1 Models: Plan, Tenant, PlatformAdmin, User, RefreshToken, AuditLog, Counter
- [ ] 1.2 Slug helper (normalize, reserved, availability) and seedPlans
- [ ] 1.3 register-institution with seeded defaults (transactional)
- [ ] 1.4 Login by tenantSlug, JWT access, refresh rotation with reuse detection, logout, me
- [ ] 1.5 authGuard, roleGuard, tenantResolver, suspension rules
- [ ] 1.6 Change, forgot and reset password
- [ ] 1.7 Staff user management (last-admin guard)
- [ ] 1.8 Platform console routes (tenants, plans, status, SMS credit, stats)
- [ ] 1.9 Phase 1 acceptance tests and cross-tenant attack suite

## Phase 2: Academic core
- [ ] 2.1 Sessions, classes, sections, subjects
- [ ] 2.2 Class-subject mapping
- [ ] 2.3 Students, guardians, enrolments (cap, atomic studentId)
- [ ] 2.4 Student and guardian logins, /me/students
- [ ] 2.5 CSV import (dry run, commit)
- [ ] 2.6 Promotion (preview, commit)
- [ ] 2.7 Phase 2 acceptance tests

## Phase 3: Daily operations
- [ ] 3.1 Attendance
- [ ] 3.2 Notices
- [ ] 3.3 Public site and staff profiles
- [ ] 3.4 Inquiries and signed uploads
- [ ] 3.5 Public API (by slug and by host)
- [ ] 3.6 Dashboard summary
- [ ] 3.7 Phase 3 acceptance tests

## Phase 4: Money
- [ ] 4.1 Fee heads, structures, adjustments
- [ ] 4.2 Invoice generation (idempotent, dry run)
- [ ] 4.3 Payments, allocations, ledger (transactions)
- [ ] 4.4 Reversal and void
- [ ] 4.5 Receipts (HTML and Bangla PDF)
- [ ] 4.6 Dues and collection reports
- [ ] 4.7 Phase 4 acceptance tests

## Phase 5: Exams and results
- [ ] 5.1 Grading scales and presets
- [ ] 5.2 Exams and marks entry, submit, unlock
- [ ] 5.3 Result calculation engine
- [ ] 5.4 Publish, lock, correction with audit
- [ ] 5.5 Marksheet PDF and merit list
- [ ] 5.6 Public result lookup
- [ ] 5.7 Phase 5 acceptance tests

## Phase 6: Communication and domains
- [ ] 6.1 SMS provider interface, job queue, balance
- [ ] 6.2 SMS automation (absent, fee, result)
- [ ] 6.3 Custom domains, verifier job, domain-check
- [ ] 6.4 Phase 6 acceptance tests

## Phase 7: Hardening and ship
- [ ] 7.1 Audit log viewer and rate limit review
- [ ] 7.2 Dockerfile, compose, Caddy config
- [ ] 7.3 Backup and restore scripts
- [ ] 7.4 Load tests
- [ ] 7.5 OpenAPI docs, Sentry, dependency audit
- [ ] 7.6 Staging and production deploy

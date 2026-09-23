# ECCLESIA — Security

**Status:** verified 2026-09-23 (Phase 4). Evidence: `backend/tests/phase4-security.test.ts` (27 tests, 3 consecutive green runs), plus the pre-existing `security.test.ts`, `perms.test.ts` (13), `session-invalidation.test.ts`, `auth.test.ts`, `admin-recovery.test.ts`. Server-side authorization is enforced on every protected route; frontend visibility is never authorization.

## 1. Authentication

| Control | Implementation | Verified by |
|---|---|---|
| Password hashing | bcrypt, cost 12, salted; all crypto funneled through `lib/auth.ts` | unit + suite |
| Login | uniform `Invalid email or password` for wrong password AND unknown account (no enumeration) | phase4: `correct password…uniform` |
| Account lockout | 5 failed logins → 15-min lock (HTTP 423); reset-code failures lock at 10 | security.test + phase4 |
| Rate limiting | login 10 / forgot 5 / reset 5 per 15 min per IP; `E2E_TESTING` opt-out ignored in production | security.test 429 test |
| JWT | HS256, secret resolved fail-fast in production (`lib/config.ts` refuses dev defaults), default expiry 7 d (`JWT_EXPIRES_IN`) | phase4 expired-token test |
| Token tampering | any payload modification breaks the signature → 401 | phase4 |
| Revocation | `tokenVersion` epoch re-checked against the DB on every request; password change/reset bumps it — all older tokens die instantly | session-invalidation + phase4 replay test |
| Logout/deactivation | deactivating an account invalidates its tokens immediately | phase4 |
| Password reset | 8-char base56 code, SHA-256-hashed at rest, 30-min TTL, single-use, emailed; success path bumps tokenVersion | auth.test + code |
| Session payload | never contains `passwordHash`/`resetTokenHash` | phase4 hygiene tests |

## 2. First-run administrator (no developer credentials in production)

- Fresh database → `GET /api/auth/bootstrap-status` returns `needsBootstrap: true`; the parish creates its own administrator in the guided wizard (`POST /api/auth/bootstrap`: name + email + strong password, bcrypt-hashed, `mustChangePassword: false` because the parish chose it).
- Bootstrap works **only while zero users exist** — afterwards it returns 409 (verified).
- **Developer seed accounts are gated**: `prisma/seed.ts` creates the three `@ecclesia.local` super_admin accounts **only when `ALLOW_DEVELOPER_SEED_ACCOUNTS=true`**. A production `npm run db:seed` therefore seeds singletons only and creates **no** users; passwords are never printed unless accounts are explicitly created. E2E seeding (`scripts/seed-e2e.ts`) is separate and unaffected.
- Lost-admin recovery: `npm run admin:reset -- <email>` (random one-time password, forces change at sign-in) — tested in `admin-recovery.test.ts`.
- Never hard-coded: no production password exists in the repo; `SUPER_ADMIN_PASSWORD` env is honored only at explicit opt-in seed time.

## 3. Roles and the authorization matrix (actual model)

Roles (schema enum): `super_admin` › `admin` › `staff` › `viewer`.
Two enforcement layers, both server-side:
1. **Role guards** — `requireAuth` (live DB user + tokenVersion), `requireAdmin` (admin/super_admin), `requireSuperAdmin`.
2. **Module rights** — `requireModule(panel)` maps method→action (`GET→view`, `POST/PUT/PATCH→edit`, `DELETE→delete`) against layered permissions: compiled defaults ‹ global `PanelPermissions` row ‹ per-user JSON overrides (Rights Centre).

**Role floor (Phase-4 fix):** `viewer` is read-only **at the server regardless of any stored overrides** — view everywhere allowed, edit/delete always false (priest/auditor use-case). Previously a viewer with default (allow-all) permissions could create and delete.

| Panel (router) | super_admin | admin | staff (defaults) | viewer |
|---|---|---|---|---|
| christian (registry, sacraments) | CRUD | CRUD (panel-gated) | CRUD (panel-gated) | **read-only** |
| activities (contributions/transfers/billed) | CRUD | CRUD (panel-gated) | CRUD (panel-gated) | read-only |
| finance (deposits/creditors/debtors/expenses) | CRUD | CRUD (panel-gated) | CRUD (panel-gated) | read-only |
| ledgers (+transfer) | CRUD | CRUD (panel-gated) | CRUD (panel-gated) | read-only |
| inventory | CRUD | CRUD (panel-gated) | CRUD (panel-gated) | read-only |
| hr (employees/payroll/leave/recruitment/docs) | CRUD | CRUD (panel-gated) | CRUD (panel-gated) | read-only |
| reports / dashboard | read | read | read | read |
| communications | CRUD | CRUD (panel-gated) | CRUD (panel-gated) | read-only |
| administration (users, rights, mail, M-Pesa, audit) | full | admin+panel | **no** (403) | **no** |
| POST /api/admin/backup | ✔ | **no (Phase-4 fix)** | no | no |
| GET /api/admin/export | ✔ | **no (Phase-4 fix)** | no | no |
| POST /api/admin/import | ✔ + `confirm:true` | no | no | no |
| POST /api/auth/register (create users) | ✔ | no (403) | no | no |
| PUT /api/parish (settings) | ✔ | ✔ | no | no |
| GET/POST /api/auth/bootstrap | fresh-DB only | — | — | — |

Role-specific protections verified: only super_admin can create/modify super_admin accounts; nobody can deactivate/demote themselves; email uniqueness includes soft-deleted users.

**Export = READ, ADMIN = yes where noted.** EXPORT for business data is `GET /api/admin/export` (super_admin); module-level CSV/report exports live under each panel's `view` right.

## 4. IDOR / tampering posture (verified)

- Document downloads are scoped: `/employees/:id/documents/:docId/download` 404s when the doc belongs to another employee (UUID-keyed storage, no user-controlled paths; traversal probes → 400/404, never 500 or file contents).
- All IDs are UUIDs; malformed ID/probe URLs now surface as **400 `INVALID_REQUEST`** (Phase-4 handler for Prisma P2023/validation errors) instead of noisy 500s.
- Mass assignment: Zod strips unknown fields (verified `role`/`passwordHash` in an expense payload are dropped).
- Single-parish database: no cross-tenant IDs exist; the only cross-record surface (employee documents, audit restore) is tested.

## 5. Input validation

Zod at every external boundary. Verified boundaries (phase4 suite): missing fields, wrong types, malformed dates/enums, oversized strings, negative/zero money (FIN-07 fix: contribution `amountKES`, billed `unitFee`/`totalAmount`, sale `amount` now `.positive()`), oversized body (5 MB parser limit — no processing, server healthy), SQL-injection strings (Zod + Prisma parameterization; raw SQL exists only in parameterized tagged templates: ref-counter UPSERTs, employee-code allocation, diagnostics).

## 6. Security headers & transport

- Helmet CSP: `default-src 'self'`, `object-src 'none'`, `frame-src 'none'`, `connect-src 'self' ws: wss:`; no `upgrade-insecure-requests` (plain-HTTP LAN default). CORS: any origin outside production; `CORS_ORIGINS` whitelist in production; credentials are not used (Bearer header only). `NODE_ENV=production` is set by docker-compose.
- HTTPS: Caddy terminates TLS in front of the single-process server (Caddyfile: internal CA for `ecclesia.local`, automatic HTTP→HTTPS redirect, reverse proxy incl. WebSocket upgrade). Verified by configuration review + `docs/` drill checklist; the live Caddy drill remains OPS-04 in the register (Caddy not installed on this machine). No mixed content: the SPA is served same-origin from the app itself.

## 7. Audit

- Soft-delete/restore writes an `AuditLog` row **in the same transaction** as the flag flip (Phase-3), snapshotting the record with credentials stripped. Restore is guarded (double-restore 404s).
- Audit rows are only readable/restorable through the admin surface (`requireAdmin` + administration panel); ordinary users cannot list, edit, or restore them. AuditLog has no update API at all — the trail is append-only.
- **Remaining gap (register DEF-OPS-06, open):** AuditAction enum covers DELETE/RESTORE only — login events, user creation, role changes, and financial creation are not yet audited. Recommended before multi-branch rollout; single-parish deployment is acceptable with the app-level trails that do exist (users.lastLoginAt, price audit log, ledger movements, audit_logs).
- Never logged: passwords, JWTs, keys, SMTP/M-Pesa/SMS credentials (masked in every settings response via `maskCredential`; backup failures redact connection URLs — asserted by tests in `backup.test.ts` and phase4 hygiene tests).

## 8. Backup & secrets

Backups: SHA-256-verified, optionally AES-256-GCM-encrypted (see `BACKUP-AND-RESTORE.md`); the backup API requires super_admin. Secrets live in `backend/.env` (JWT_SECRET fail-fast enforced in production; `BACKUP_ENCRYPTION_KEY`; `DATABASE_URL`). Restrict file permissions; store the encryption key in a password manager.

## 9. Operator responsibilities (parish go-live)

1. Install on a clean database; create the administrator through the first-run wizard. Never seed developer accounts (`ALLOW_DEVELOPER_SEED_ACCOUNTS` unset).
2. Set a strong `JWT_SECRET` (the server refuses to start in production without one) and, if encrypting backups, `BACKUP_ENCRYPTION_KEY`.
3. Create one account per person with **least privilege**: viewer for priest/auditor, staff + narrowed panels for clerks, admin only for the office administrator. Use the Rights Centre to disable edit/delete for treasury-adjacent read roles — the server enforces the same matrix.
4. Clear `E2E_TESTING` and `SMS_DEV_OUTBOX` from production env (rate limiters and mail gating revert to production values).
5. Keep HTTPS (Caddy) enabled if any non-LAN access exists; keep automatic backups on with an off-site mirror.
6. Review the audit trail monthly; run the restore drill quarterly (`DISASTER-RECOVERY.md` §3).

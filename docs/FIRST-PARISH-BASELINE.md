# ECCLESIA — First-Parish Engineering Baseline

**Date of baseline:** 2026-09-22
**Method:** live code inspection + full test-suite execution + E2E execution on an isolated PostgreSQL 18 instance. No application code was modified in this phase.
**Companion document:** [FIRST-PARISH-DEFECT-REGISTER.md](FIRST-PARISH-DEFECT-REGISTER.md) (every defect with ID, severity, evidence, and acceptance criteria)

Terminology used throughout (Rule 10):

| Term | Meaning |
|---|---|
| **Implemented** | Code exists and is wired into the running server. |
| **Tested** | An automated test exercises the code path and passes *as of this baseline*. |
| **Verified** | Independently re-executed and reproduced during this baseline (not merely claimed). |
| **Production-proven** | Running under real parish load/data with an operator on call. **Nothing in this repository is production-proven yet.** |

---

## 1. What exists (architecture, as found)

Single-process web application, LAN-first, no internet dependency for core operation. All claims below were checked against source, not documentation.

| Layer | Technology | Verified present |
|---|---|---|
| Frontend | React 19 + Vite 6 + Tailwind 4 + socket.io-client + PWA plugin | Yes (`package.json`, `src/`, `vite.config.ts`) |
| Backend | Express 4 + TypeScript, compiled to `backend/dist` via `tsc` | Yes (`backend/src/index.ts`, `backend/dist/index.js` exists) |
| ORM/DB | Prisma 5.22 + PostgreSQL (env `DATABASE_URL`) | Yes (`backend/prisma/schema.prisma`) |
| Realtime | Socket.IO 4 on the same HTTP port, JWT-authenticated handshake incl. live DB check + tokenVersion | Yes (`backend/src/lib/socket.ts`) |
| Auth | JWT bearer tokens, bcrypt password hashing, token-version revocation | Yes (see §5) |
| One-port serving | Express serves built `dist/` SPA + API on `PORT` (default 5000) | Yes (`servingFrontend` logic in `backend/src/index.ts`) |

**Installation paths (both preserved, per mandate):**
- **PATH A** — native Node.js + PostgreSQL: `scripts/install-parish.cmd` / `.sh`, manual steps in `INSTALL.md`, Windows service via `scripts/windows-service/*` (`npm run service:install`), systemd unit documented in `INSTALL.md`.
- **PATH B** — Docker Compose: `Dockerfile` (multi-stage, non-root, HEALTHCHECK, postgresql-client installed), `docker-compose.yml` (Postgres 16-alpine + app, DB port not published, `BACKUP_DISABLED=true`), `docker-entrypoint.sh` (wait-for-db → `prisma migrate deploy` → seed → exec node).

**Not installed (by design, per mission):** Bulk SMS gateway is a *stub behind a settings singleton* (`SmsSettings`, `backend/src/lib/sms.ts` — returns 400 "not configured" unless configured; dev outbox mode exists), and M-Pesa STK Push exists only as a settings singleton (`PushPaymentSettings`) with **no payment-initiation route found in any router**. Core operation does not depend on either. Verified: server boots and all CRUD/money paths work with both unconfigured.

---

## 2. What works — verified during this baseline

All items below were **executed** on 2026-09-22, not read from a report.

### 2.1 Backend test suite (Vitest)
- Command: `npx vitest run` in `backend/` (exactly `npm test`), PostgreSQL 18 local, DB `ecclesia_test`, untouched test code.
- **Result: 24 files, 294 passed / 0 failed / 5 skipped (299 total).** Skips are environment-gated, not failures (see §3).
- Notably verified live: concurrency matrix (expenses/deposits/sales/ledger transfers/debtor payments at 1/5/10/20/50 concurrent), soft-delete lifecycle, RBAC negative tests, idempotency-key dedup, auth + lockout + rate limits, mail settings, employee documents, backup engine unit tests.
- `tsc --noEmit` clean on both root and backend.

### 2.2 Backup live drill (the previously-failing suite)
- With PostgreSQL client tools on PATH (`pg_dump` 18.6) and `BACKUP_TEST_URL` set, `tests/backup.test.ts` runs **13/13 passed**, including the full drill: real `pg_dump` via the production code path → retention pruning → **restore into a scratch database with identical row counts** via the production `psql` argument builder.
- The historical "13/13 failing" claim is **obsolete**: root causes (URL `?schema=public` leaking into the DB name; `pg_dump`-only flags passed to `psql`) are fixed in code and locked by tests.

### 2.3 E2E (Playwright, compiled backend + built frontend)
- First full run: 24 passed / 4 failed. All four failures were **environment/test-data conditions**, not product defects; evidence for each is in the defect register (E2E-01, E2E-02, E2E-03):
  - `money-path` 403 on employee create — global `panel_permissions` singleton in the *test DB* had `"hr": false` from earlier unrelated runs. After a test-DB hygiene fix (data only): **3/3 money-path tests pass** (contribution → ledger transfer → payroll approve/pay).
  - `negative-authz` viewer login 401 — E2E seed accounts missing from the test DB. After `npm run seed:e2e`: **passes**.
  - `password-reset` round trip — passed in isolation; leaves the viewer password as `ResetE2E123!` when a *prior* run failed mid-flow, which then cascades into tour test 16.
  - Tour test 16 (viewer cannot register) — failed repeatedly with `Invalid email or password` / `Account temporarily locked` **because the viewer account's stored password no longer matched the fixture**, and 5 rapid failures triggered the (correct) 15-minute lockout. With a consistent seeded password and cleared lock: **passes**.
- Best verified full-suite state: **25/27 passed** with the two remaining failures accounted for by cross-spec password-state coupling (register: DEF-E2E-02). CI runs these against a *fresh* database each time, where the coupling does not trigger.

### 2.4 Manual/runtime spot checks
- Server process boots with compiled `dist` and serves frontend + API on one port; `/api/health` returns DB connectivity.
- `pg_dump` backups exist in `backend/backups/` (multiple recent snapshots on disk).
- `npm audit`: root 0 vulnerabilities; backend 3 (2 low, 1 moderate — `joi` via `africastalking`, `morgan < 1.12.0` log-forging). None remote-exploitable in the LAN threat model; see DEF-SEC-03.

---

## 3. Skipped tests (accounted for, none hidden)

| Test | Why skipped | Gated by |
|---|---|---|
| backup live drill ×3 | requires `pg_dump`/`psql` on PATH + reachable PG | `BACKUP_TEST_URL`/`DATABASE_URL` + tool probe — **verified passing when tools are on PATH** |
| windows-service POSIX signal tests ×2 | Windows host, POSIX-only behavior | OS gate |

---

## 4. Database forensics — model inventory

38 models in `backend/prisma/schema.prisma`. Conventions: UUID PKs (`@default(uuid())`) except three singletons with `id="default"`; `createdAt` everywhere; `updatedAt` on mutable models; soft-delete (`isDeleted` + `deletedAt`) on all parish-data models but **not** on `EmployeeDocument`, `InventoryPriceAuditLog`, `AuditLog`, `BroadcastRecipient`, `CelebrationGreeting` (append-only/child tables). Domain status enums enforced at DB level; `Debtor.status` and `Recruitment.status` use CHECK constraints (values contain spaces).

### Financial entities
| Model | PK | Unique | FKs | Financial role |
|---|---|---|---|---|
| `Contribution` | uuid | — | → Christian | Member giving; `amountKES Decimal(12,2)`; categories/monthlyTracker as Json; indexes (isDeleted,date), (isDeleted,christianId) |
| `BilledItem` | uuid | — | → Christian (nullable, walk-ins) | Fees; unitFee/totalAmount Decimal(12,2) |
| `Deposit` | uuid | `refNo` | — | Bank deposits; Decimal(12,2); refNo index for sequential generation |
| `Expense` | uuid | `voucherNo` | — | Spend; Decimal(12,2) |
| `Creditor` | uuid | — | — | Payables; `status` enum Pending/Overdue/Scheduled/Paid |
| `Debtor` | uuid | — | — | Receivables; status String + CHECK (Outstanding/Partially Paid/Paid) |
| `Ledger` | uuid | `code` | — | Cash/bank accounts; balance Decimal(14,2) default 0 |
| `LedgerMovement` | uuid | — | — (from/to are names, not FKs) | Transfer journal; Decimal(12,2) |
| `RefCounter` | `name` (string) | — | — | Gapless ref allocator (expense, deposit) |
| `Payroll` | uuid | — | → Employee (nullable!) | basicSalary/allowances/deductions/netPay Decimal(12,2); status enum Draft/Approved/Paid/Cancelled |

### Inventory entities
| Model | PK | Unique | Notes |
|---|---|---|---|
| `InventoryItem` | uuid | `sku` | stock Int default 0, reorder; **CHECK (stock >= 0)** from migration 20260921080000; matched by *name* in sale flow |
| `Delivery` | uuid | — | supplier/inv/units/total Decimal(12,2); **no FK to InventoryItem** |
| `Sale` | uuid | — | item by name, amount Decimal(12,2); no FK to InventoryItem |
| `StockTake` | uuid | — | system vs physical counts; **no automatic stock adjustment found** |
| `StockIssue` | uuid | — | item name + destination; **no stock decrement, no FK** |
| `InventoryPriceAuditLog` | uuid | — | append-only cost/price history |

### Identity entities
`Christian` (regNo unique; status enum Active/Transferred/Deceased/Inactive; sacrament JSON columns baptism/eucharist/confirmation/marriage; indexes on isDeleted+status+createdAt, dateOfBirth, scc, localChurch), `Transfer` (→Christian), `Death` (→Christian), `User` (email unique; role enum super_admin/admin/staff/viewer; tokenVersion, lockout fields, reset-token fields, panels/actions JSON), `Employee` (code, email unique), `EmployeeDocument` (→Employee; storedName unique; 5 MB cap, MIME allow-list pdf/jpeg/png).

### Audit entities
`AuditLog` (entityName/entityId/action enum DELETE|RESTORE/actor + cached name/`metadataSnapshot` with passwordHash stripped; indexes entityName+action, entityId, deletedByName), `InventoryPriceAuditLog` (above). **The audit trail records only DELETE and RESTORE — not create/update/permission-change/login** (register DEF-OPS-06).

### Configuration entities (singletons, id="default")
`PanelPermissions` (global rights defaults), `PushPaymentSettings` (M-Pesa placeholders; masked in API), `ParishSettings` (identity + `setupCompleted` wizard flag), `MailSettings` (SMTP; smtpPass encrypted at rest via `lib/crypto.ts`), `SmsSettings` (gateway; masked in API).

### Communications entities
`Announcement`, `Broadcast` (+ `BroadcastRecipient`, unique (broadcastId,address)), `ChurchEvent` (+ `EventRsvp`), `PrayerRequest` (privacy enforced server-side), `CelebrationGreeting` (unique christianId+kind+occasionDate).

### Migrations
12 migrations, chronological, `migration_lock.toml` for postgresql. Baseline 20260827040000; CHECK constraints added 20260828120000; concurrency unique indexes + `ref_counters` backfill 20260921080000. `prisma migrate deploy` is the production path (Docker entrypoint, CI, weekly workflow). **No documented down-migration/rollback strategy exists** (Prisma does not generate down-migrations; register DEF-OPS-07).

---

## 5. Authentication forensics (traced into source)

| Control | Status | Evidence |
|---|---|---|
| Login | Implemented + Tested + Verified | `routes/auth.ts` POST /login; bcrypt verify; uniform 401 (no user enumeration) |
| Password hashing | bcrypt cost 12 (`lib/auth.ts`) | Tests `auth.test.ts` |
| JWT creation/verification | HMAC, expiry, claims id/email/role/tokenVersion | `lib/auth.ts`, `middleware/auth.ts` |
| Token versioning (revocation) | Implemented + Tested; **live DB check on every request** incl. Socket.IO handshake | tokenVersion incremented on change-password, reset, admin reset, admin recovery |
| Logout | N/A by design (stateless JWT + tokenVersion) | — |
| Password change | Implemented + Tested; bumps tokenVersion; returns fresh token | `routes/auth.ts` |
| Password reset | Implemented + Tested + Verified (E2E round trip) | SHA-256-hashed single-use code, 30-min TTL, emailed via SMTP or dev outbox; replay/lockout counters |
| First-run bootstrap | Implemented + Tested | GET /bootstrap-status + POST /bootstrap — public **only while zero users exist**; creates first super_admin + singletons |
| Account lockout | Implemented + Tested | 5 failed logins / 10 failed resets → 15-min lock; verified live (caused tour test 16's environment failure) |
| Rate limiting | Implemented + Tested | login 10/15min, forgot/reset 5/15min per IP (`express-rate-limit`); `E2E_TESTING=1` raises limits and is ignored in production |
| RBAC at API layer | **Yes — server-side, not frontend-only** | `requireAuth` → `requireAdmin`/`requireSuperAdmin` → `requireModule(panel)` on **every** feature router incl. `admin.ts` (role + administration-panel guard); action derived from HTTP method; super_admin bypasses module guard |
| Permission resolution | Single source `loadPermissions()`; explicit-deny (`false` blocks), missing keys fall back to global defaults | `middleware/perms.ts`; `admin.test.ts`, `perms.test.ts`, negative E2E |
| Audit logging | Implemented for DELETE/RESTORE only | see §4 audit note |

**Authorization gap noted:** `settings.ts` enforces its own role check (admin/super_admin) and `sms.ts`/`support.ts` are `requireAuth` (+ admin for support); all verified in source.

---

## 6. Transaction forensics (money paths)

All `$transaction` call sites inventoried. Isolation level is default (READ COMMITTED) everywhere; no `Serializable` usage. Correctness strategy = guarded atomic single-statement writes + consistent lock ordering + unique backstops + bounded transient retry (`lib/transient.ts`: 40001/40P01/P2034 only, 4 attempts, full jitter).

| # | Transaction | File:function | Purpose | Reads | Writes | Invariant | Error/retry | Idempotency | Deadlock risk | Lost update | Duplication |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Expense create | `finance.ts` POST /expenses | voucher + record | ref_counters | ref_counters, expenses | gapless unique voucher | Zod/409 propagate; transient retry ×4 | X-Idempotency-Key | **None** (single counter row, ordered lock) | No | No (unique + idempotency) |
| 2 | Deposit create | `finance.ts` POST /deposits | refNo + record | ref_counters | ref_counters, deposits | gapless unique refNo | same | X-Idempotency-Key | None | No | No |
| 3 | Debtor payment | `finance.ts` POST /debtors/:id/payments | reduce balance | debtors | debtors ×2 (guarded decrement, then status) | balance never negative; no silent clamp | 409 concurrent-conflict / 422 overpayment | none (not keyed) | Low (single row, then re-read) | No (guarded decrement) | Payment rows aren't kept — history not auditable (DEF-FIN-04) |
| 4 | Ledger transfer | `ledgers.ts` POST /transfer | move funds | ledgers ×2 | ledgers ×2, ledger_movements | conservation; no negative | 404/422; transient retry | X-Idempotency-Key | **Eliminated by global id-order writes** (A→B vs B→A verified in tests) | No (guarded decrement) | Movement row per success only |
| 5 | Sale create | `inventory.ts` POST /sales | decrement stock + record | inventory_items | inventory_items, sales | stock ≥ 0 (guarded decrement + DB CHECK) | 404/422; transient retry | X-Idempotency-Key | None (one row) | No | No |
| 6 | Contribution create | `activities.ts` POST /contributions | record giving | — | contributions | FK to Christian | FK errors propagate | X-Idempotency-Key | None | n/a | No (idempotency) |
| 7 | Transfer create | `activities.ts` POST /transfers | record + flip member status | christians | transfers, christians | no orphan transfer | P2025 rollback | none | Low | n/a | possible on double-submit (no idempotency key; DEF-FIN-05) |
| 8 | Death create | `deaths.ts` POST | record + flip member | christians | deaths, christians | no orphan | P2025 rollback | none | Low | n/a | possible on double-submit (DEF-FIN-05) |
| 9 | Soft delete | `lib/audit.ts` softDelete | flag flip + audit | model row | model row, audit_logs | exactly-once delete; snapshot immutable | 404 when flipped 0 rows | n/a | None (guarded flip) | No | No |
| 10 | Batch item update | `inventory.ts` POST /items/batch-update | multi-edit + price audit | inventory_items | inventory_items, inventory_price_audit_logs | all-or-nothing | 404 rollback | none | Low | n/a | n/a |
| 11 | Christian batch import | `christians.ts` POST /import | bulk insert | christians | christians | atomic batch; regNo reserved incl. soft-deleted | per-row validation skips | none | Low | n/a | dedup pre-check + unique backstop |
| 12 | Export/import (admin) | `lib/export.ts` importAllData | full DB replace | all tables | all tables | claimed atomic — **defect: callback uses global `prisma`, not `tx`; writes run outside the transaction** (DEF-FIN-06) | none | n/a | n/a | n/a | deletes-then-inserts; failure mid-way leaves partial DB |

Also verified: raw SQL limited to `SELECT 1` (health), `ref_counters` upsert, and one `MAX(code)` scan in `hr.ts` (employee code allocation — read-then-insert **without** unique-retry; two concurrent employee creates can race → 500/unique-violation instead of distinct codes; DEF-HR-01, P2 because employee creation is rare and user-visible retry succeeds).

**Answers to the known-problem claims:** the previously reported "20 users → 3 succeed, 17 deadlocks" for expenses and inventory is **not reproducible**: the concurrency suite proves 20/20 (and 50/50) successes with gapless distinct numbers, and 20 sales against stock 15 yield exactly 15 wins + 5 business-rule 422s with zero 500s. The mixed-workload failure and the Christian soft-delete "Record to update not found" failure both trace to *fixed* code (audit-atomic soft delete; Policy A test pins the 404-by-design).

---

## 7. Backup & restore pipeline (real, as implemented)

**Backup** (`backend/src/lib/backup.ts` + `routes/admin.ts` POST /backup + CLI `npm run backup`):
1. Parse `DATABASE_URL` (WHATWG URL; strips `?schema=public`; decodes percent-encoded credentials).
2. `pg_dump -F p --no-owner --no-privileges` with `PGPASSWORD` from the URL; write `BACKUP_DIR/ecclesia-backup-<ts>.sql`.
3. Retention: prune to `BACKUP_KEEP` (default 14), best-effort.
4. Optional off-site mirror copy to `BACKUP_DEST_DIR`.
5. Scheduler **exists but is never started** — `startBackupScheduler()` is defined and exported but no call site in `backend/src/index.ts`, scripts, Dockerfile, or compose (DEF-OPS-01, **P1**: documented daily backups do not happen; only manual/CLI/API backups run).
- **No checksum, no encryption, no compression** of dumps (plain SQL). Restore drill exists and passes (§2.2).

**Restore** (`backend/scripts/restore.ts`): CLI-only, refuses without `--yes`, `psql -w -v ON_ERROR_STOP=1`, server must be stopped; verified end-to-end by the live drill test.

**Docker:** automatic backups deliberately disabled (`BACKUP_DISABLED=true` in compose; documented in DOCKER.md — manual `pg_dump` command provided).

---

## 8. Installation forensics (undocumented/manual steps found)

PATH A (`INSTALL.md` + `scripts/install-parish.{cmd,sh}`) and PATH B (`DOCKER.md`, compose) are both real and mutually consistent with the code. Items the docs do **not** fully capture:

1. **`pg_dump` must be on PATH** for both the scheduler (if enabled) and manual backups; on Windows the installer probes `C:\Program Files\PostgreSQL\*\bin`, but manual users get no guidance (OPERATIONS.md only says "requires pg_dump in PATH").
2. **Database creation is manual** on native installs (`createdb` step) — documented in INSTALL.md Step 4 but easy to miss; P1003 troubleshooting entry exists.
3. **`npm run setup` root script exists but is not the documented happy path** for Docker; both paths documented separately and consistently.
4. **Seed accounts**: three fixed super_admin emails; `SUPER_ADMIN_PASSWORD` optional; random password printed once; forced change on first sign-in. `admin:reset` CLI documented for both paths. First-run **bootstrap wizard** (empty-DB flow) also exists — README documents the wizard and the seed accounts as alternative first-run paths, which can confuse a fresh installer (P3).
5. **Port**: backend `.env.example` says 5000; the checked-out working `backend/.env` uses PORT=80; Docker maps host `APP_PORT`→5000. Docs cover the collision case.
6. **HTTPS**: Caddyfile present for `ecclesia.local` (self-signed internal CA, HTTP→HTTPS redirect) and domain mode via `caddy.env`. **Caddy is not installed on this machine and no CI/manual verification of the Caddy path exists** (DEF-OPS-04, P1 for go-live if HTTPS is required; plain HTTP is the working default).
7. **ecclesia.local DNS**: full router runbook in OPERATIONS.md §11 including `.local`/mDNS caveats and per-device stopgaps — accurate as written.
8. **Windows service** (`EcclesiaServer`): supervisor with crash-loop guard + orphan-watch; install/uninstall scripts; tested in suite (2 POSIX tests skipped on Windows).

---

## 9. Objective gates (no percentages)

| Gate | Status | Evidence |
|---|---|---|
| G1 Backend suite green | **PASS** | 294/294 non-skipped tests |
| G2 Backup→restore drill | **PASS** (when pg tools on PATH) | 13/13 backup tests incl. restore |
| G3 Money-path E2E | **PASS** | 3/3 money-path specs |
| G4 Negative-authz E2E | **PASS** | viewer 403s, unauthenticated 401s |
| G5 Password-reset E2E round trip | **PASS in isolation; state-coupled in full-suite order** | DEF-E2E-02 |
| G6 Full E2E suite green in one pass | **NOT PASSING** (25/27; 2 environment-coupled failures) | §2.3 |
| G7 Docker clean install | **NOT VERIFIED — Docker unavailable on this machine** | DEF-OPS-03 |
| G8 Native clean install from scratch | **PARTIALLY VERIFIED** — suite/build verified; the documented installer script itself was not executed end-to-end | DEF-OPS-02 |
| G9 HTTPS behind Caddy | **NOT VERIFIED** | DEF-OPS-04 |
| G10 Automatic backups actually scheduled | **FAIL** (scheduler never started) | DEF-OPS-01 |
| G11 Restore/DR runbook + drill schedule | **PARTIAL** — restore drill is automated in tests; no scheduled drill or incident runbook | DEF-OPS-05 |
| G12 Migration rollback strategy | **MISSING** | DEF-OPS-07 |
| G13 Audit coverage beyond delete/restore | **MISSING** | DEF-OPS-06 |
| G14 Docker deploy's automatic backups | **INTENTIONALLY OFF, documented** | DOCKER.md |
| G15 npm audit clean | **PASS (root) / 3 low+moderate (backend)** | §2.4 |

---

## 10. Recommended execution order (after this baseline)

1. **DEF-OPS-01 (P1):** call `startBackupScheduler()` on boot in `backend/src/index.ts` (guarded by `BACKUP_DISABLED`, mirroring Docker's env) + test.
2. **DEF-FIN-06 (P1):** fix `importAllData` to run writes on the transaction client `tx` (currently the atomicity claim is false); add a mid-import failure test.
3. **DEF-E2E-01/02 (P1→P2):** make password-reset spec restore state via `seed-e2e` re-run or DB teardown; then require a fully green single-pass E2E run as the release gate.
4. **DEF-OPS-03 (P1):** execute the Docker clean-install verification on a machine with Docker; record evidence against DOCKER.md's checklist 1–10.
5. **DEF-OPS-04 (P1):** verify the Caddy HTTPS path end-to-end (self-signed LAN mode) and document client trust steps.
6. **DEF-SEC-01/02 (P2):** per-route body limits for auth; log rotation + outbox retention.
7. **DEF-FIN-04/05, DEF-HR-01 (P2):** payment-history table; idempotency keys on transfer/death; employee-code retry.
8. **DEF-OPS-06/07 (P2):** audit-log widening (auth/permission/finance mutations); documented restore-into-scratch rollback runbook.
9. **DEF-SEC-03 (P3):** `npm audit fix` for morgan + africastalking upgrade when the API allows.
10. Only then: first-parish go-live with OPERATIONS.md §6 checklist + a scheduled restore drill.

**Explicitly deferred (safe to postpone):** Bulk SMS and M-Pesa STK Push integrations (stubs only), license/activation (OPERATIONS §8), crash reporting (§10), per-user session UI, email retry queue.

---

*Baseline complete. No application code was modified in this phase. Test-database hygiene changes only (seed accounts, one JSONB panel flag, lockout clear) were made to the throwaway `ecclesia_test` database and are documented in the defect register.*

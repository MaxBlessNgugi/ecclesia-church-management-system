# ECCLESIA — First-Parish Defect Register

**Baseline date:** 2026-09-22 · **Evidence method:** live execution + source inspection (see [FIRST-PARISH-BASELINE.md](FIRST-PARISH-BASELINE.md)).

Severity: **P0** = data loss / financial corruption / security breach / deployment blocker · **P1** = serious reliability or operational problem · **P2** = important, not first-parish blocking · **P3** = documentation, polish, future.

Root-cause status: **Confirmed** (mechanism identified in source) · **Reproduced** (failure re-executed) · **Suspected** (indicators only).

---

## P0

*None found.* No data-loss, financial-corruption, or security-breach defect survived verification. The historical claims of financial deadlocks (17/20 failures), duplicate reference numbers, and broken backups/restore were all **refuted by current evidence** — the corresponding fixes are present and regression-locked by tests. The absence of P0 items is a *result of this verification*, not an assumption.

---

## P1

### DEF-OPS-01 — Automatic backup scheduler is never started — **FIXED in Phase 2 (2026-09-22)**
- **Area:** Backup · **Root cause:** Confirmed (was: zero call sites for `startBackupScheduler`)
- **Resolution:** `backend/src/index.ts` now calls `startBackupScheduler()` at boot (guarded by `BACKUP_DISABLED=true`, Docker's documented default). Scheduler behavior verified live (2026-09-22, SCHED-VERIFY PASS): boot-if-due creates a verified snapshot (1 artifact in a 4 s window), a fresh snapshot suppresses the duplicate (0 extra), `BACKUP_DISABLED=true` produces nothing, and the due-check uses only **verified** snapshots (`lastBackupTime`), so a failed backup can never be mistaken for a success. Overlap-safe (`runBackupIfNotRunning` returns `{skipped:'already-running'}`), failed runs are logged (`Scheduled backup FAILED: <reason>`) and retried at the next 6 h check. See `docs/BACKUP-AND-RESTORE.md` §4.
- **Evidence:** live run `[backup] Created ecclesia-backup-…sql.gz (24 KB, sha256 4ffdf01cdbdc…)`; disabled mode produced 0 additional snapshots; unit tests 33/33 in `tests/backup.test.ts`.
- **Acceptance criteria met:** (a) boot-if-due ✓ (b) disabled ✓ (c) recorded evidence ✓.

### DEF-FIN-06 — Database-wide import claims atomicity but writes outside the transaction — **FIXED in Phase 3 (2026-09-23)**
- **Resolution:** `importAllData` (`backend/src/lib/export.ts`) now threads the transaction client `tx` through every `deleteMany()`/`createMany()` (and through `prepareUserRows` via `insert(tx, table)`), with a 120 s transaction timeout for full-DB imports. Regression-locked by `tests/phase3-concurrency.test.ts` "a mid-import failure rolls back to the pre-import state": a bundle corrupted mid-import is rejected and all row counts are verified identical to pre-import.
- **Acceptance criteria met:** induced failure mid-import leaves row counts identical to pre-import ✓ (plus a companion test proving successful import still replaces data).
- **Area:** Finance/Ops · **Root cause:** Confirmed
- **Current behavior:** `importAllData` (`backend/src/lib/export.ts:270`) wraps delete-all + re-insert in `prisma.$transaction(async () => { ... })`, but the callback body uses the **global `prisma` client**, not the `tx` parameter. Every `deleteMany()`/`createMany()` runs in autocommit — a mid-import failure leaves a **partially wiped, partially repopulated database**. This is the super-admin restore-from-JSON path (`POST /api/admin/import`).
- **Expected:** All writes on `tx` so any failure rolls back to the pre-import state.
- **Evidence:** source read at export.ts lines 240–288; callback signature has no `tx` usage.
- **Source file:** `backend/src/lib/export.ts` · **Test:** none covers mid-import failure.
- **Dependencies:** none · **Blocking:** YES for the import path (do not use `/api/admin/import` on parish data until fixed; pg_dump restore is the sanctioned recovery path).
- **Recommended fix:** accept `tx` in the callback and thread it through `insert()`/`prepareUserRows()`; add a failure-injection test asserting full rollback.
- **Acceptance criteria:** induced failure mid-import leaves row counts identical to pre-import.

### DEF-OPS-02 — Native clean-install not executed end-to-end
- **Area:** Installation · **Root cause:** N/A (verification gap)
- **Current behavior:** Suite/build/tests verified on this machine, but `scripts/install-parish.cmd/.sh` was **not executed from a clean state**; INSTALL.md's manual sequence not re-walked from zero.
- **Expected:** Clean-VM run of both the installer and the manual path with recorded output.
- **Evidence:** no machine-readable artifact of a clean install exists in-repo.
- **Test:** none · **Dependencies:** clean Windows/Linux VM or machine · **Blocking:** YES before handing to the parish.
- **Recommended fix:** run the install checklist; record a transcript in `acceptance-evidence/`.
- **Acceptance criteria:** clean machine → `npm start` → login → health endpoint OK, using only documented steps.

### DEF-OPS-03 — Docker clean install not verified
- **Area:** Docker · **Root cause:** N/A (environment gap)
- **Current behavior:** Docker Desktop/Engine unavailable on this machine; Dockerfile/compose/entrypoint inspected and internally consistent, but **never built or run here**.
- **Expected:** `docker compose up -d --build` from clean state; DOCKER.md verification checklist 1–10 executed.
- **Evidence:** `docker --version` fails on host.
- **Test:** no CI job builds the Docker image (ci.yml runs Vitest/Playwright only).
- **Dependencies:** any Docker-capable host · **Blocking:** YES if PATH B is the parish's chosen install.
- **Recommended fix:** run DOCKER.md checklist on a Docker host; add an image-build job to CI.
- **Acceptance criteria:** checklist 1–6 and 8 pass; evidence file committed.

### DEF-OPS-04 — HTTPS (Caddy) path unverified
- **Area:** HTTPS · **Root cause:** N/A
- **Current behavior:** Caddyfile exists (internal CA for `ecclesia.local`, redirect, domain mode); Caddy not installed locally; no test or documented drill covers the reverse-proxy path (WebSocket upgrade through Caddy unverified).
- **Expected:** LAN HTTPS with self-signed trust, HTTP→HTTPS redirect, Socket.IO working through the proxy.
- **Evidence:** `which caddy` → not installed; no CI coverage.
- **Dependencies:** Caddy binary · **Blocking:** YES only if the parish requires HTTPS at go-live; plain HTTP is the working default.
- **Recommended fix:** one-time verified drill; document client-trust steps for self-signed CA.
- **Acceptance criteria:** `https://ecclesia.local` serves app; login + realtime sync work through Caddy.

### DEF-E2E-01 — E2E suite not green in a single pass (2/27)
- **Area:** E2E · **Root cause:** Reproduced + Confirmed
- **Current behavior:** Best verified full pass = 25/27. Failing pair is state-coupled: `password-reset.spec.ts` leaves viewer's password as `ResetE2E123!` when a prior spec order/failure interferes; tour test 16 then logs in with fixture `Viewer123!` → 5 rapid failures → **designed 15-min account lockout** cascades (`Invalid email or password` / `Account temporarily locked` screenshots captured). Both pass in isolation after re-seed.
- **Expected:** Full `--project=fast` pass from a seeded DB without inter-spec coupling.
- **Evidence:** test-results screenshots + DB row (`lockedUntil` in future, password hash mismatch via bcrypt compare).
- **Source files:** `e2e/tests/password-reset.spec.ts` (restore step), `e2e/tests/visual-tour.spec.ts:403`
- **Dependencies:** none · **Blocking:** not for code correctness — **yes for the release gate**.
- **Recommended fix:** password-reset spec should re-run `seed-e2e.ts` (or API-restore + clear lockout) in `afterAll`; assert restored credentials.
- **Acceptance criteria:** 27/27 in one CI-style pass against a seeded DB.

---

## P2

### DEF-FIN-04 — Debtor payments leave no per-payment history
- **Area:** Finance · **Root cause:** Confirmed
- **Current behavior:** `POST /debtors/:id/payments` decrements the balance and updates status; there is no payment-transaction table, so partial-payment amounts/times/actors are unrecoverable.
- **Expected:** Payment ledger rows (amount, date, actor) alongside the balance.
- **Evidence:** schema has no Payment model; route writes only the debtor row.
- **Dependencies:** migration · **Blocking:** No (operationally acceptable at parish scale; financial auditability gap).
- **Recommended fix:** add `DebtorPayment` table written in the same guarded-decrement transaction.
- **Acceptance criteria:** each payment produces one queryable row; balance matches sum of payments.

### DEF-FIN-05 — Transfer/Death/other POSTs lack idempotency keys
- **Area:** Finance/Registry · **Root cause:** Confirmed
- **Current behavior:** `X-Idempotency-Key` is mounted on contributions, deposits, expenses, sales, ledger transfer — **not** on `/api/transfers`, `/api/deaths`, creditors, debtors, deliveries, billed-items, stock takes/issues.
- **Expected:** consistent double-click/retry protection on all create endpoints handling money or legal records.
- **Evidence:** `grep requireIdempotencyKey backend/src/routes` → 5 call sites.
- **Blocking:** No · **Recommended fix:** extend middleware to the remaining money/legal create routes.
- **Acceptance criteria:** duplicate keyed request on each listed route creates exactly one record.

### DEF-HR-01 — Employee code allocation has a read-then-insert race — **FIXED in Phase 3 (2026-09-23)**
- **Resolution:** `POST /api/hr/employees` now allocates codes from the atomic `ref_counters` UPSERT ('employee_code' series) **inside** the create transaction, wrapped in `retryOnTransient` — same pattern as deposits/expenses. Regression-locked: 20 concurrent employee creates → 20× 201, 20 distinct codes (tests/phase3-concurrency.test.ts).

### DEF-OPS-08 — `/api/admin/backup` and `/api/admin/export` lack super-admin restriction — **RESOLVED in Phase 4 (2026-09-23)**
- **Resolution:** policy decided and enforced — both now require `requireSuperAdmin`, consistent with `/import`. Regression-locked in `tests/phase4-security.test.ts` (admin → 403, super_admin → 200, credentials never in responses).
- **Area:** Security · **Root cause:** Confirmed
- **Current behavior:** `express.json({limit:'5mb'})` (needed for base64 logos) covers `/api/auth/*`.
- **Recommended fix:** mount 64 KB parser before auth router (pre-release audit P2.6, still open).
- **Acceptance criteria:** >1 MB POST to /api/auth/login rejected with 413.

### DEF-SEC-02 — Log/outbox growth unbounded; reset codes hit disk in dev mode
- **Area:** Operations/Privacy · **Root cause:** Confirmed
- **Current behavior:** `backend/logs/outbox` (194 files on this machine), sms-outbox, service.log grow without rotation; dev-outbox reset codes persist on disk. Structured `logger.ts` writes stdout only — OPERATIONS.md §5's claim of `backend/logs/error.log` is **not implemented** (errorHandler logs to console).
- **Recommended fix:** rotation/retention for logs and outbox; correct the OPERATIONS.md statement.
- **Acceptance criteria:** retention policy enforced; docs match reality.

### DEF-OPS-05 — No scheduled restore drill / incident runbook
- **Area:** Operations/DR · **Root cause:** N/A
- **Current behavior:** restore drill exists as a test (excellent) and restore script works; no periodic drill schedule, no documented incident playbooks (DB corruption, stolen server, disk failure, DB-down restart loop).
- **Evidence:** PRE_RELEASE_AUDIT P1.4/P2.5 remain open.
- **Recommended fix:** monthly drill job + `docs/INCIDENTS.md` covering the four scenarios above.
- **Acceptance criteria:** drill evidence + runbook committed; OPERATIONS.md links them.

### DEF-OPS-06 — Audit trail covers only DELETE/RESTORE
- **Area:** Audit · **Root cause:** Confirmed
- **Current behavior:** `AuditAction` enum is only DELETE|RESTORE; creates/updates, permission/rights changes, user admin actions, and logins are not audited.
- **Recommended fix:** widen enum + write sites for auth/permission/finance mutations.
- **Acceptance criteria:** rights change and payroll status change produce audit rows.

### DEF-OPS-07 — No migration rollback/recovery strategy
- **Area:** Migrations · **Root cause:** N/A
- **Current behavior:** forward-only `migrate deploy`; OPERATIONS.md documents baseline adoption but no down/rollback or drift-recovery procedure (`migrate diff`/`resolve` unmentioned).
- **Recommended fix:** document rollback = restore-from-backup into corrected schema; add pre-migration backup step to the update runbook.
- **Acceptance criteria:** update runbook includes "backup before migrate deploy" and a drift-recovery section.

### DEF-OPS-08 — `/api/admin/backup` and `/api/admin/export` lack super-admin restriction
- **Area:** AuthZ · **Root cause:** Confirmed
- **Current behavior:** admin router enforces requireAuth + requireAdmin + administration-panel; `/import` additionally requires super_admin, but `/backup` (full DB dump to file) and `/export` (full JSON download) are available to any admin with the administration panel. Probably intentional, but inconsistent with `/import`.
- **Recommended fix:** decide and document; consider `requireSuperAdmin` on both.
- **Acceptance criteria:** policy documented; tests match policy.

### DEF-E2E-03 — E2E seed/password state not part of test setup
- **Area:** E2E · **Root cause:** Confirmed
- **Current behavior:** Local E2E runs require the operator to remember `npm run seed:e2e --prefix backend` first; failure mode is a confusing 401 (observed). CI seeds automatically; local docs don't.
- **Recommended fix:** README/dev docs note + optional global-setup auto-seed.
- **Acceptance criteria:** fresh clone + documented commands → green E2E run.

---

## P3

### DEF-SEC-04 (new, Phase 4) — Dev seed accounts could land on a production database — **FIXED in Phase 4 (2026-09-23)**
- **Was:** `npm run db:seed` unconditionally created three developer-owned `@ecclesia.local` super_admin accounts (documented first-parish dependency on developer credentials).
- **Fix:** accounts are created only when `ALLOW_DEVELOPER_SEED_ACCOUNTS=true`; production seeding creates singletons only and the parish administrator comes from the fresh-DB bootstrap wizard. Verified both modes by running the seeder; E2E seeding unaffected.

### DEF-SEC-05 (new, Phase 4) — `viewer` role could edit/delete via default allow-all permissions — **FIXED in Phase 4 (2026-09-23)**
- **Was:** permission resolution defaulted every action to allowed, so a viewer could POST/DELETE on every module (frontend hid the buttons, but the server — the authority — permitted it).
- **Fix:** `loadPermissions` enforces a viewer floor: view everywhere permitted, edit/delete always false regardless of overrides. Regression-locked: 9 read endpoints 200; writes 403 even with allow-all action overrides.

### DEF-SEC-06 (new, Phase 4) — Malformed IDs surfaced as 500s — **FIXED in Phase 4 (2026-09-23)**
- **Was:** probing URLs (`/api/christians/…not-a-uuid`, traversal payloads) hit Prisma invalid-argument errors and fell through to the 500 fallback (noisy, misclassified).
- **Fix:** centralized handler maps P2023/`PrismaClientValidationError` → 400 `INVALID_REQUEST` (no internals leaked). Verified against 5 probe shapes.

### DEF-FIN-07 — `Sale.amount` accepts zero/negative; `Contribution.amountKES` accepts negatives — **FIXED in Phase 4 (2026-09-23)**
- **Resolution:** `.positive()` added to contribution `amountKES`, billed-item `unitFee`/`totalAmount`, and sale `amount`. Boundary tests: negative/zero → 400 on all three routes (tests/phase4-security.test.ts).

### DEF-SEC-03 — 3 npm audit findings in backend runtime deps
- `joi` 18.0.0–18.2.4 (2 low, prototype pollution) via `africastalking` 0.8.3 — fix is a breaking downgrade; wait for upstream. `morgan` <1.12.0 (moderate, log forging) — `npm audit fix` eligible; morgan only runs in non-production anyway. **Recommended:** schedule `npm audit fix` for morgan now; africastalking upgrade when released. Acceptance: backend `npm audit --omit=dev` → 0 moderate+.

### DEF-DOC-01 — README duplicated "Start the backend + frontend" step and mixes first-run narratives
- README Quick Start lists step 2 twice; seeded-accounts section and bootstrap-wizard section describe two different first-run paths without a "which one applies" note. Acceptance: single coherent first-run narrative.

### DEF-DOC-02 — REPORT.md claims "All modules are working and verified" (dated 2026-08-10)
- Pre-dates the concurrency/backup fixes and lacks evidence links. Either refresh against this baseline or mark as a marketing snapshot. Acceptance: REPORT.md references this baseline or carries a verification date.

### DEF-DOC-03 — No CHANGELOG and no Gitflow/release documentation
- No `CHANGELOG.md`; single `v1.0.0` tag (2026-08-10); no release-automation workflow (tags are manual). Known-problem items 6–8 verified as still open. Acceptance: CHANGELOG generation from conventional commits + documented tag/release steps (CI exists for tests only).

### DEF-OPS-09 — Backend `.env` in working tree enables dev conveniences unsafe for production
- Local `backend/.env` has `SMS_DEV_OUTBOX="true"` and `E2E_TESTING="1"`; both are **production-safe by code** (`E2E_TESTING` ignored when NODE_ENV=production; dev outbox off unless enabled), but the go-live checklist should require both cleared/absent on the parish server. Acceptance: OPERATIONS.md §6 checklist includes these two lines.

### DEF-FIN-07 — `Sale.amount` accepts zero/negative; `Contribution.amountKES` accepts negatives
- Zod schemas use `z.number()` without `.positive()` on sale amount and contribution amountKES (expenses/deposits/ledgers correctly use `.positive()`). No in-app path sends bad values; API callers could. Acceptance: `.positive()` added and a 422 test exists. (P2→P3 borderline; kept P3 because the UI cannot produce it and reports aggregate what was stored.)

### DEF-INV-01 — Deliveries/issues/stock-takes do not adjust stock
- Deliveries add no stock; StockIssue records but decrements nothing; StockTake records counts without applying variance. If the parish expects ERP-grade stock accounting, this is a functional gap, not a defect of what's claimed; the UI presents them as records. Flagged for the product owner before deployment. Acceptance: explicit product decision documented.

---

## Historical claims vs. verified reality

| # | Claim (pre-baseline) | Verified finding |
|---|---|---|
| 1 | Backup tests 13/13 failing | **Refuted.** 13/13 pass with pg tools on PATH; root causes fixed and regression-locked |
| 2 | Concurrent expenses 20→3 success, 17 deadlocks | **Refuted.** 20/20 and 50/50 succeed, gapless distinct voucherNos |
| 3 | Concurrent inventory 20→3 success | **Refuted.** Exactly 15/20 sales win on stock 15 (business rule), 0 deadlocks |
| 4 | Mixed workload 1 failure | **Not reproducible** in current suite |
| 5 | Christian soft-delete "Record to update not found" | **Refuted as defect; confirmed as designed 404 (Policy A)**, pinned by tests |
| 6 | CHANGELOG completeness | Still open (DEF-DOC-03) |
| 7 | Release automation | Still open (DEF-DOC-03) |
| 8 | Gitflow/release docs | Still open (DEF-DOC-03) |
| 9 | Migration rollback strategy | Still open (DEF-OPS-07) |
| 10 | Disaster recovery testing | Partial: restore drill automated; schedule/runbook open (DEF-OPS-05) |
| 11 | Docker clean install | Unverified (DEF-OPS-03) |
| 12 | Native clean install | Partially verified (DEF-OPS-02) |
| 13 | HTTPS | Unverified (DEF-OPS-04) |
| 14 | Complete E2E | 25/27 best pass; coupling defect DEF-E2E-01 |
| 15 | Production seeded admin behavior | Verified: forced change on first sign-in, `admin:reset` CLI works, bootstrap wizard empty-DB-only |
| 16 | Backup storage & retention | Verified working manually; **scheduler dead** (DEF-OPS-01); no checksum/encryption/compression |
| 17 | Server restart behavior | Data persists (volume/DB); no SIGTERM handler (process dies mid-request; transactions roll back — safe but not graceful); Windows supervisor provides restart; Linux systemd documented |
| 18 | Database failure behavior | Health endpoint 503s correctly; requests error to 500 with generic message; no auto-reconnect verification recorded |
| 19 | Disk/storage failure behavior | Unverified; backups best-effort prune, off-site mirror swallows errors with a log line |
| 20 | Role/permission enforcement | **Verified server-side** (not frontend-only), incl. Socket.IO handshake |
| 21 | Audit coverage | Delete/restore only (DEF-OPS-06) |

---

## Phase-3 update (2026-09-23) — concurrency, atomicity and integrity hardening

- **FIN-06 FIXED** (import atomicity — see P1 entry above). **HR-01 FIXED** (employee code race).
- **Two new concurrency defects found and fixed in Phase 3:**
  - **DEF-INV-02 (P2, fixed):** `POST /inventory/items/batch-update` applied updates in caller-supplied order → two admins batch-editing overlapping items in opposite orders could deadlock (classic lock-order cycle). Fix: updates sorted by global id order inside the transaction. Regression-locked: 20 concurrent reversed-order batch updates → zero 500s.
  - **DEF-FIN-08 (P2, fixed):** debtor payment derived status in a **separate autocommit statement** after the guarded decrement — a concurrent second payment could commit its decrement+status between them and the last writer's stale status (e.g. 'Partially Paid' with balance 0) would overwrite the winner's correct 'Paid'. Fix: decrement → re-read → status derivation/persist all inside one transaction holding the row lock. Regression-locked: 20 concurrent full-balance payments → exactly 1 winner, final status `Paid`.
- **Audit restore() atomicity hardened (Phase 3):** the RESTORE flip and its audit entry now commit/roll back together (guarded `WHERE isDeleted=true` flip — double-restore 404s, exactly one RESTORE row; previously flip and audit write were separate autocommits).
- **Baseline "17/20 deadlocks" claims re-measured:** refuted. Matrix 1/5/10/20/50 users × expense / sale / mixed workload: 0 unexpected failures, 0 deadlocks; recorded in `tests/phase3-concurrency.test.ts` console evidence (`[matrix:expense]`, `[matrix:sale]`).
- **New tests:** `backend/tests/phase3-concurrency.test.ts` — 15 tests (import rollback + success, batch-update ordering, debtor status atomicity, restore atomicity/double-restore, HR code race, matrix with percentiles, SQL invariants: conservation/orphans/gapless refs, oversale 20×5 + 21st unit, movement equation, 2 forced-rollback tests). Reproducibility: 4 consecutive green runs; pre-existing concurrency+integrity suites re-run green (38/38).
- **Docs:** `docs/CONCURRENCY-AND-TRANSACTION-DESIGN.md`, `docs/FINANCIAL-INTEGRITY.md`, `docs/INVENTORY-INTEGRITY.md`.
- **Not addressed (deferred, by design):** DEF-FIN-04 (debtor payment history — needs a migration), DEF-FIN-05 (idempotency keys on remaining routes), DEF-INV-01 (deliveries/issues adjusting stock — product decision). Correctness of what IS implemented is fully verified.

## Phase-2 update (2026-09-22) — backup/verify/restore/DR hardening

- DEF-OPS-01 **FIXED** (scheduler wired + verified live). Backup pipeline upgraded: gzip compression, optional AES-256-GCM encryption, SHA-256 sidecar checksum over final bytes, guarded retention (only `ecclesia-backup-*` files, sidecar-aware), explicit pg-tool diagnostics, in-process locking, accurate failure reporting (`npm run backup` exits non-zero on any stage failure).
- New drill `backend/scripts/phase2-drill.ts`: **PASS** — deterministic dataset (100 christians / 100 contributions / 50 expenses / 20 deposits / 100 ledger movements / 50 inventory items / 100 sales / 50 stock-takes / 20 employees / 40 payrolls / 10 users / 100 audit rows), real pg_dump backups (plaintext + encrypted), tamper/wrong-key/truncation detection, source DB destroyed, encrypted artifact restored into a fresh DB, compiled app booted (health 200, login 200, dashboard 200), baseline == restored on counts/financial totals/inventory totals/identity/config. Measured: backup ~1.0–1.2 s, restore 1.2–1.9 s, boot-to-healthy 2.2–2.8 s.
- Tests: backup suite 13 → **33 tests** (checksum determinism/mismatch/truncation, encryption round-trip/unique IV/wrong key/tamper, retention matrix N−1…N+20 + unrelated-file guard, failures: missing DATABASE_URL, unreachable DB, missing tool, auth-failure pg_dump, mirror failure, dir-is-file, read-only dir (POSIX), corrupt sidecar, restore-failure-loud, no-secret logging, scheduler overlap). Full backend suite: **313 passed / 6 skipped (319)** — no test weakened or removed.
- Docs: `docs/BACKUP-AND-RESTORE.md`, `docs/DISASTER-RECOVERY.md` (measured RPO/RTO). `backend/.env.example` documents the new knobs. `diagnostics.ts` counts new artifact shapes.
- Root cause of the historical "13/13 backup failures": fixed before this phase (URL parsing + psql flags), re-confirmed and regression-locked; the two new P1-level backup gaps (dead scheduler, no verification/encryption) are now closed with evidence.

## Phase-4 update (2026-09-23) — security model, first-run admin, RBAC, validation

- **First-run admin secured (SEC-04):** developer seed accounts behind `ALLOW_DEVELOPER_SEED_ACCOUNTS=true`; fresh-parish path = bootstrap wizard (fresh-DB-only, 409 afterwards). `docs/SECURITY.md` documents the full flow and operator duties.
- **Viewer role floor (SEC-05):** server-side read-only regardless of stored overrides.
- **DEF-OPS-08 resolved:** `/api/admin/backup` + `/api/admin/export` now super_admin-only.
- **FIN-07 fixed:** positive-amount validation on contributions/billed-items/sales.
- **SEC-06 fixed:** malformed-ID probes → 400 `INVALID_REQUEST` (was 500).
- **New suite `tests/phase4-security.test.ts` (27 tests, 3 green runs):** auth states (correct/wrong/unknown uniform, lockout 423, expired/tampered/revoked/replayed tokens, deactivation), bootstrap freshness, viewer matrix (9 reads OK / all writes 403 incl. override-proof), role-escalation blocks (admin→super_admin grant/modify denied, registration super_admin-only, admin surface denied to staff), IDOR (employee-doc scoping), bulk-restore param garbage, parish-settings role gate, backup/export/import gates, FIN-07 boundaries (negative/zero/missing/wrong-type/malformed-date/enum/oversized-string/mass-assignment/oversized-body), secret hygiene (no passwordHash/resetTokenHash in any surface, masked gateway credentials, no tokens in login failures).
- **Audit (DEF-OPS-06) remains open** — documented in SECURITY.md §7 as the primary remaining gap; delete/restore auditing is transactional and append-only (Phase 3).
- Full suite at phase close: **355 passed / 6 skipped (361), 25+1 test files, tsc clean.**

## Counts

**P0: 0 · P1: 5 (2 fixed: OPS-01, FIN-06) · P2: 11 (3 fixed: OPS-08, SEC-04→new IDs, FIN-07) · P3: 7**

Blocking-before-go-live set (in order): DEF-OPS-01 → DEF-FIN-06 → DEF-OPS-02 → DEF-OPS-03 (if PATH B) → DEF-OPS-04 (if HTTPS required) → DEF-E2E-01.

# ECCLESIA — Concurrency & Transaction Design

**Status:** verified 2026-09-23 (Phase 3). Every claim below is backed by executed tests in `backend/tests/concurrency.test.ts` (23 tests) and `backend/tests/phase3-concurrency.test.ts` (15 tests). Companion docs: [FINANCIAL-INTEGRITY.md](FINANCIAL-INTEGRITY.md) · [INVENTORY-INTEGRITY.md](INVENTORY-INTEGRITY.md).

## 1. Design principles (in priority order)

1. **Correctness before convenience.** Failures are explicit (4xx with a business code); money and stock are never silently clamped or swallowed.
2. **READ COMMITTED everywhere + guarded atomic writes.** No transaction in the codebase elevates isolation. Every multi-row invariant is enforced by *single-statement check-and-set* (`UPDATE … WHERE <guard>`), which is race-safe under READ COMMITTED because the guard is evaluated while holding the row lock. SERIALIZABLE was evaluated and rejected: the same invariants are enforced more cheaply and with fewer retries by guarded writes + lock ordering.
3. **Consistent global lock ordering.** Whenever a transaction touches multiple rows, rows are ordered by primary key (`id`) regardless of business direction — the A→B vs B→A wait-for cycle is structurally impossible.
4. **Unique-constraint backstops.** Every generated business reference (`refNo`, `voucherNo`, `code`) has a DB UNIQUE index; a race that slips past the counter surfaces as 409, never a duplicate row.
5. **Bounded, transient-only retries.** `lib/transient.ts` retries **only** SQLSTATE 40001/40P01 and Prisma P2034, max 4 attempts, full-jitter backoff (25 ms base). Validation, authorization, P2002/P2025 and business rejections are never retried.

## 2. Transaction map (all sites affecting money/stock/registry)

| # | Transaction | File · Function | Reads | Writes | Lock order | Isolation | Retry | Idempotency |
|---|---|---|---|---|---|---|---|---|
| 1 | Create deposit | finance.ts `POST /deposits` | ref_counters | deposits, ref_counters | counter row → insert | RC | transient-only | `X-Idempotency-Key` |
| 2 | Create expense | finance.ts `POST /expenses` | ref_counters | expenses, ref_counters | counter row → insert | RC | transient-only | `X-Idempotency-Key` |
| 3 | Debtor payment | finance.ts `POST /debtors/:id/payments` | debtors | debtors | single debtor row | RC | transient-only | (balance is the guard) |
| 4 | Ledger transfer | ledgers.ts `POST /transfer` | ledgers ×2 | ledgers ×2, ledger_movements | **both ledger rows in ascending id order** | RC | transient-only | `X-Idempotency-Key` |
| 5 | Create ledger | ledgers.ts `POST /` | ledgers (max code) | ledgers | — (single insert; UNIQUE code backstop) | RC | none | — |
| 6 | Record sale | inventory.ts `POST /sales` | inventory_items | inventory_items, sales | single item row → insert | RC | transient-only | `X-Idempotency-Key` |
| 7 | Batch update items | inventory.ts `POST /items/batch-update` | inventory_items | inventory_items, inventory_price_audit_logs | **all item rows in ascending id order** (Phase-3 fix) | RC | none | — |
| 8 | Create/update item | inventory.ts `POST/PUT /items` | — | inventory_items (+audit log) | single row | RC | none | — |
| 9 | Soft delete | lib/audit.ts `softDelete` | target row | target row, audit_logs | single row | RC | none | guarded flip (`WHERE isDeleted=false`) |
| 10 | Restore | lib/audit.ts `restore` | target row | target row, audit_logs | single row | RC | none | guarded flip (`WHERE isDeleted=true`, Phase-3 fix) |
| 11 | Parish transfer | activities.ts `POST /transfers` | christians | transfers, christians | transfer row → christian row | RC | none | — (legal record; status flip idempotent) |
| 12 | Death record | deaths.ts `POST /` | christians | deaths, christians | death row → christian row | RC | none | — |
| 13 | Bulk import | christians.ts CSV import | christians | christians | single transaction, createMany | RC | none | regNo UNIQUE + pre-filter |
| 14 | Employee create | hr.ts `POST /employees` | ref_counters | employees, ref_counters | counter row → insert (Phase-3 fix) | RC | transient-only | — (email UNIQUE backstop) |
| 15 | Contribution create | activities.ts `POST /contributions` | — | contributions | single insert | RC | none | `X-Idempotency-Key` |
| 16 | Full-DB import | lib/export.ts `importAllData` | all tables | all tables | TABLE_ORDER (FK-safe) | RC (12-min timeout) | none | super-admin + confirm gate |

Non-transactional single-statement writes (creditor/debtor create, status flips, stock-take PATCH) are atomic by definition and need no wrapping.

## 3. Lock-dependency graph and ordering proof

Edges = "locks row X then row Y" inside one transaction:

```
Ledger transfer:      ledger(min id) → ledger(max id) → ledger_movements
Batch item update:    item(min id) → item(next) → … → price_audit_logs
Sale:                 inventory_item → sale
Deposit / Expense:    ref_counter → deposit|expense
Employee create:      ref_counter → employee
Soft delete/restore:  target row → audit_log
Transfer (registry):  transfer → christian
Death:                death → christian
```

All multi-row sites order by primary key before locking. **No site locks rows in an order that can form a cycle with another site** (each multi-row site is the only writer of its row pair in that order). The historical "20 users → 3 successes" expense/inventory claims are **refuted by the current implementation and pinned by tests**: expenses 50/50 succeed with gapless distinct vouchers; sales over stock 15 yield exactly 15 wins + 5 explicit 422s, zero deadlocks.

## 4. Isolation choices (per transaction)

| Invariant | Mechanism | Minimum isolation needed | Used |
|---|---|---|---|
| No oversell | guarded decrement `WHERE stock >= 1` | READ COMMITTED | RC |
| No negative/overdrawn ledger | guarded decrement `WHERE balance >= amount` re-checked under row lock | RC | RC |
| No lost debtor payment | guarded decrement `WHERE amount >= payment` + status derived in same tx | RC | RC |
| Gapless distinct refs | counter UPSERT + UNIQUE index | RC | RC |
| Transfer conservation | both rows written in one tx, global id order | RC | RC |
| Import atomicity | single `$transaction`, tx client threaded (FIN-06 fix) | RC | RC |

Rationale: every invariant is a *single-row predicate* or is protected by *consistent ordering*, both of which hold under READ COMMITTED. SERIALIZABLE would add retry storms (40001) without removing any defect the current design has.

## 5. Transaction boundaries (Step 4)

All integrity-critical writes live inside their transaction: stock decrement + sale row; both ledger balances + movement; debtor decrement + status; ref allocation + document row; import wipe + reinsert; flip + audit entry. Deliberately pushed **outside** transactions: Zod validation, permission checks (`requireAuth`/`requireModule` run before handlers), `emitChange` broadcasts (after commit — a crash during broadcast can never roll back committed money), and `resolveActor` reads where the audit write does not depend on them.

## 6. Duplicate protection (Step 6)

`X-Idempotency-Key` middleware (24 h in-memory replay cache, in-flight coalescing, non-2xx never cached) is mounted on: contributions, deposits, expenses, sales, ledger transfers. Business-reference uniqueness (refNo, voucherNo, code, regNo) provides natural idempotency for generated numbers. Known gap (register DEF-FIN-05, open, P2): transfers/deaths/debtors/deliveries/stock endpoints don't accept keys yet — double-click there creates two records (no financial corruption; amounts are independent rows).

## 7. Retry policy (Step 8)

`retryOnTransient(fn, { maxAttempts: 4, baseDelayMs: 25 })` — full jitter `random(0, 25·2^(attempt−1))` ms → delays within the brief's 50–200 ms guidance on the first retry paths. Retry log line: `[transient] <label> hit a transient DB conflict (attempt n/4), retrying in Xms` — contains labels only, never user data. Never retried: Zod errors, `AppError`/`HttpError`, P2002 (unique), P2025 (not found), any non-40001/40P01/P2034 error.

## 8. Failure behavior summary

| Stage | Behavior |
|---|---|
| Validation failure | 400/422 before any write |
| Business rule (out of stock / insufficient balance / overpayment) | 422, zero side effects (guard evaluated before/within the write) |
| Concurrent conflict | 409 with explicit code (e.g. `CONCURRENT_PAYMENT_CONFLICT`) |
| Unique race | P2002 → 409 `DUPLICATE_RECORD` |
| Transient deadlock/serialization | ≤3 retries with jitter; if exhausted → 500 (logged) |
| Crash mid-transaction | full rollback (Step-13 tests prove stock + balances revert) |

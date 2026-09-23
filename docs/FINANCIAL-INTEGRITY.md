# ECCLESIA — Financial Integrity

**Status:** verified 2026-09-23 (Phase 3). Evidence: `backend/tests/phase3-concurrency.test.ts` (Steps 10/13), `backend/tests/concurrency.test.ts`, `backend/tests/integrity.test.ts`. Companion: [CONCURRENCY-AND-TRANSACTION-DESIGN.md](CONCURRENCY-AND-TRANSACTION-DESIGN.md).

## 1. The accounting model actually implemented

ECCLESIA is a **cash-book model**, not double-entry bookkeeping:

- **Deposits** record cash moved into a bank (document with refNo; no GL posting).
- **Expenses** record cash paid out (document with voucherNo; no GL posting).
- **Ledgers** are named cash books with a running `balance` (Decimal 14,2).
- **Ledger transfers** move value between two ledgers and append a movement row; total balance across all ledgers is **conserved** by construction (both writes in one transaction).
- **Debtors/creditors** track receivables/payables with a running `amount`/`amountOwed`; payments decrement the debtor balance (currently without per-payment history — register DEF-FIN-04, open P2).
- **Contributions/billed items** are income records; reports aggregate them (`SUM(amountKES)`, `SUM(totalAmount)`).

Invariants claimed by the system — and verified from raw SQL after concurrent runs:

1. **Conservation:** for any set of transfers, Σ(balances of involved ledgers) is unchanged; movements between A and B sum to exactly the transferred amount.
2. **No impossible balance:** ledger balances can never go below 0 (guarded decrement re-checked under row lock); debtor balances never negative.
3. **No lost/duplicate transaction:** every successful HTTP 2xx corresponds to exactly one committed row (counts + distinct refs verified); voucher/ref numbers are distinct and gapless.
4. **No orphan:** every ledger movement references an existing ledger name (SQL check).
5. **No partial transaction:** a crash between balance writes rolls back both (Step-13 rollback tests).

## 2. Verified under concurrency (authoritative SQL, not app reads)

| Scenario | Result (2026-09-23) |
|---|---|
| 20 alternating A↔B transfers | 20/20 committed, Σ balances = 2000 exactly, movements A→B sum = 100 |
| 20 concurrent expenses × amount 10 | SQL `SUM(amount) = 200`, 20 distinct gapless vouchers |
| 20 concurrent full-balance debtor payments | exactly 1 winner, 19 explicit 409s, final status `Paid`, balance 0 |
| 50-way expense matrix | 50/50 committed, 0 deadlocks (matrix sizes 1/5/10/20/50 all clean) |
| Mixed workload (expense+sale+transfer+contribution+payment, 20-way) | 0 unexpected statuses (only 2xx/400/409/422) |
| Forced rollback (crash after balance writes) | both balances unchanged |

## 3. Atomicity of each financial operation

| Operation | Created | Modified | Audited | Failure → |
|---|---|---|---|---|
| Deposit | deposit row (+refNo) | ref_counters | soft-delete only (DEF-OPS-06 open) | rollback: no deposit, no ref consumed* |
| Expense | expense row (+voucherNo) | ref_counters | soft-delete only | same* |
| Ledger transfer | movement row | 2 ledger balances | soft-delete only | rollback: balances untouched |
| Debtor payment | — | debtor balance + status | soft-delete only | rollback: balance untouched |
| Contribution | contribution row | — | soft-delete only | single insert; idempotency-key dedup |
| Payroll | payroll row | — | soft-delete only | single insert |

\* The ref counter is allocated inside the transaction; a rolled-back create leaves a **gapless counter** intact (the allocation rolls back too). Counters are monotonic and never reused; rollbacks make *gaps in the counter row impossible* because allocation is not committed on failure.

## 4. Duplicate protection

- `X-Idempotency-Key` on contributions, deposits, expenses, sales, transfers (verified: same key → one row, `X-Cache-Lookup: HIT` on replay; failed requests not cached).
- UNIQUE backstops: `deposits.refNo`, `expenses.voucherNo`, `employees.code`, `employees.email`, `christians.regNo`.
- Open gap: DEF-FIN-05 (no keys on transfers/deaths/debtors/deliveries yet) — double-click protection, not integrity, is affected.

## 5. Known, documented limitations (not silent)

- No per-payment history for debtors (DEF-FIN-04) — balances are exact; *history* is not.
- No double-entry GL — the cash-book model is what's implemented and verified; reports aggregate stored rows.
- Audit trail covers delete/restore only (DEF-OPS-06) — who deleted what is recorded; who created each payment is not (actor is implicit in the JWT session logs).

# ECCLESIA — Inventory Integrity

**Status:** verified 2026-09-23 (Phase 3). Evidence: `backend/tests/phase3-concurrency.test.ts` (Steps 11/12), `backend/tests/concurrency.test.ts`. Companion: [CONCURRENCY-AND-TRANSACTION-DESIGN.md](CONCURRENCY-AND-TRANSACTION-DESIGN.md).

## 1. The stock model actually implemented

One authoritative quantity column: `inventory_items.stock` (Int, `CHECK (stock >= 0)` in the DB — migration 20260921080000). Writers of `stock` in application code:

| Writer | Direction | Mechanism |
|---|---|---|
| `POST /inventory/sales` | −1 per sale | guarded decrement `WHERE stock >= 1` + sale insert, one transaction |
| `POST /inventory/items` (create) | sets initial stock | insert with `min(0)` Zod validation |
| `PUT /inventory/items/:id` (stock field) | sets absolute stock | direct write (admin correction path) |

**Deliveries, stock issues and stock-takes do NOT adjust stock** (they are records only). This is the product decision documented in the defect register (DEF-INV-01): the movement equation below therefore holds *for sales*; a full ERP equation including deliveries/issues is not implemented and would be new functionality.

## 2. Movement equation (as implemented and verified)

```
closing stock = opening stock − Σ(successful sale units) ± admin corrections
```

Verified directly (Phase-3 `movement equation` test): with opening stock 40 and 25 concurrent sale attempts, `closing == 40 − sold` exactly; every rejected attempt is an explicit 422 with stock untouched.

## 3. Oversell protection (Step 12)

- Mechanism: single-statement `UPDATE inventory_items SET stock = stock − 1 WHERE id = … AND stock >= 1` evaluated under the row lock, inside the same transaction as the sale insert. A concurrent loser sees 0 affected rows → 422 `Out of stock: <item> (N left)`.
- DB backstop: `CHECK (stock >= 0)` makes a negative stock impossible from any code path.
- Verified: stock 100, 20 clients × 5 sequential single-unit sales → exactly 100 × 201, stock = 0; a further sale → 422; stock stays 0. Stock 15 vs 20 concurrent sales (regression suite) → exactly 15 wins + 5 × 422, never negative, zero 500s.

## 4. Deadlock safety

The sale transaction locks exactly one row (the item) then inserts into `sales` — no second lockable row, so it cannot participate in a lock cycle. Batch updates (the other multi-row inventory writer) now sort updates by id (Phase-3 fix), so two admins editing overlapping item sets in opposite orders cannot deadlock (verified: 20 concurrent reversed-order batch updates, zero 500s).

## 5. Known limitations (documented, not hidden)

- **Name-based item match on sales** (not SKU): duplicate item names would sell from an arbitrary match. Documented at the call site; safe at parish scale with unique names. (Improvement candidate: switch to `sku` or item id in the sale payload.)
- **Deliveries/issues/stock-takes are records, not stock movements** (DEF-INV-01) — flagged for product owner decision before enabling ERP-grade stock accounting.
- Sales quantity is fixed at 1 unit per sale row (the API has no quantity field); the oversale test therefore drives quantity via multiple requests.
- `Sale.amount` accepts zero/negative at the API boundary (DEF-FIN-07, P3) — stock integrity is unaffected; reports aggregate what was stored.

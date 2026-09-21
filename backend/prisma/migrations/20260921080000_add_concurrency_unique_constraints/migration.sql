-- =============================================================================
-- Migration: add_concurrency_unique_constraints
-- =============================================================================
-- PURPOSE
--   Turns reference-number collisions and negative stock into
--   database-enforced impossibilities. This is what makes the concurrent
--   "generate max+1 and create" pattern in finance.ts correct:
--
--     1. Two concurrent writers can both read the same "highest" refNo and
--        compute the same next number — the UNIQUE constraint lets exactly one
--        INSERT win and forces the loser to regenerate and retry (bounded,
--        transient-only retry in lib/transient.ts). Before this migration a
--        collision silently produced two rows with the same voucherNo/refNo.
--
--     2. InventoryItem.stock must never go negative under any code path; the
--        CHECK is a backstop to the guarded atomic decrement in inventory.ts.
--
--   Both statements are idempotent (IF NOT EXISTS) so re-running on a database
--   that already has them is a no-op — same convention as the
--   add_check_constraints migration.
--
--   NOTE ON EXISTING DATA: unlike employees.email (which had a one-off
--   backfill), duplicate voucherNo/refNo values have never been observed in
--   production data — sequential generation is the only writer. If a live
--   database somehow contains duplicates, CREATE UNIQUE INDEX will fail loudly
--   rather than silently pick a winner; that is the desired behavior.
-- =============================================================================

-- Expenses: one voucher per voucher number, ever.
CREATE UNIQUE INDEX IF NOT EXISTS "expenses_voucher_no_unique" ON "expenses"("voucherNo");

-- Deposits: one reference per reference number, ever.
CREATE UNIQUE INDEX IF NOT EXISTS "deposits_ref_no_unique" ON "deposits"("refNo");

-- Stock can never go negative, regardless of writer.
-- Names match the convention used for debtors_status_check.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_items_stock_check'
      AND conrelid = '"inventory_items"'::regclass
  ) THEN
    ALTER TABLE "inventory_items"
      ADD CONSTRAINT "inventory_items_stock_check"
      CHECK (stock >= 0);
  END IF;
END $$;

-- =============================================================================
-- GAPLESS REFERENCE COUNTERS (primary mechanism for refNo/voucherNo)
-- =============================================================================
--   One row per reference series. Allocation is a single atomic statement:
--       UPDATE ref_counters SET next = next + 1 WHERE name = $1 RETURNING next;
--   The row lock serializes allocators for microseconds; every writer gets a
--   distinct, gapless number with NO retry storms and NO duplicate refs.
--   The UNIQUE indexes above remain as backstops for client-supplied values.
--
--   Backfill: seed each counter one past the highest existing numeric suffix
--   (MAX ignores non-numeric refs like 'CUSTOM-REF'; empty tables start at 1).
--   ON CONFLICT DO NOTHING keeps the migration idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "ref_counters" (
  "name" TEXT PRIMARY KEY,
  "next" INTEGER NOT NULL
);

INSERT INTO "ref_counters" ("name", "next")
  SELECT 'deposit', COALESCE(MAX((regexp_match("refNo", '(\d+)$'))[1])::int, 0) + 1 FROM "deposits"
  ON CONFLICT ("name") DO NOTHING;

INSERT INTO "ref_counters" ("name", "next")
  SELECT 'expense', COALESCE(MAX((regexp_match("voucherNo", '(\d+)$'))[1])::int, 0) + 1 FROM "expenses"
  ON CONFLICT ("name") DO NOTHING;

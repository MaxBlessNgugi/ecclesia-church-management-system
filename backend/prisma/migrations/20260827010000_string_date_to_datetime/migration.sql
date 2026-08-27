-- Migration: String → DateTime for all operational date fields
-- Convention: All dates stored as UTC. Date-only fields stored as UTC midnight (00:00:00+00).
-- Existing string values are expected in ISO format (YYYY-MM-DD) or locale format (M/D/YYYY, H:MM:SS AM/PM).

-- Helper function: safely convert a date string to UTC timestamp.
-- Accepts ISO date (YYYY-MM-DD), ISO datetime, and locale format (M/D/YYYY, H:MM:SS AM/PM).
-- Returns NULL for NULL or unparseable values (logged to migration output).
CREATE OR REPLACE FUNCTION safe_to_timestamp(input TEXT) RETURNS TIMESTAMPTZ AS $$
DECLARE
  result TIMESTAMPTZ;
BEGIN
  IF input IS NULL OR trim(input) = '' THEN
    RETURN NULL;
  END IF;
  -- Try ISO format first (most common in this codebase)
  BEGIN
    result := (input || 'T00:00:00Z'):: TIMESTAMPTZ;
    RETURN result;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  -- Try ISO datetime format
  BEGIN
    result := input:: TIMESTAMPTZ;
    RETURN result;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  -- Try locale format: M/D/YYYY, H:MM:SS AM/PM (from seed-demo.ts)
  BEGIN
    result := to_timestamp(input, 'MM/DD/YYYY, HH12:MI:SS AM');
    RETURN result;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  -- Try locale format without time: M/D/YYYY
  BEGIN
    result := to_timestamp(input, 'MM/DD/YYYY');
    RETURN result;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  -- If nothing works, log and return NULL (will need manual fixup)
  RAISE WARNING 'safe_to_timestamp: could not parse "%", setting NULL', input;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── Backfill existing data ──────────────────────────────────────────────────

-- Contribution.date
UPDATE "contributions" SET "date" = safe_to_timestamp("date")::text WHERE "date" IS NOT NULL;

-- Transfer.date
UPDATE "transfers" SET "date" = safe_to_timestamp("date")::text WHERE "date" IS NOT NULL;

-- BilledItem.date
UPDATE "billed_items" SET "date" = safe_to_timestamp("date")::text WHERE "date" IS NOT NULL;

-- Death.dateOfDeath and dateOfBurial
UPDATE "deaths" SET "dateOfDeath" = safe_to_timestamp("dateOfDeath")::text WHERE "dateOfDeath" IS NOT NULL;
UPDATE "deaths" SET "dateOfBurial" = safe_to_timestamp("dateOfBurial")::text WHERE "dateOfBurial" IS NOT NULL;

-- Deposit.date
UPDATE "deposits" SET "date" = safe_to_timestamp("date")::text WHERE "date" IS NOT NULL;

-- Creditor.dueDate
UPDATE "creditors" SET "dueDate" = safe_to_timestamp("dueDate")::text WHERE "dueDate" IS NOT NULL;

-- Expense.date
UPDATE "expenses" SET "date" = safe_to_timestamp("date")::text WHERE "date" IS NOT NULL;

-- LedgerMovement.time
UPDATE "ledger_movements" SET "time" = safe_to_timestamp("time")::text WHERE "time" IS NOT NULL;

-- Delivery.date
UPDATE "deliveries" SET "date" = safe_to_timestamp("date")::text WHERE "date" IS NOT NULL;

-- Sale.time
UPDATE "sales" SET "time" = safe_to_timestamp("time")::text WHERE "time" IS NOT NULL;

-- Employee.hireDate
UPDATE "employees" SET "hireDate" = safe_to_timestamp("hireDate")::text WHERE "hireDate" IS NOT NULL;

-- Leave.startDate and endDate
UPDATE "leaves" SET "startDate" = safe_to_timestamp("startDate")::text WHERE "startDate" IS NOT NULL;
UPDATE "leaves" SET "endDate" = safe_to_timestamp("endDate")::text WHERE "endDate" IS NOT NULL;

-- Recruitment.datePosted and closingDate
UPDATE "recruitments" SET "datePosted" = safe_to_timestamp("datePosted")::text WHERE "datePosted" IS NOT NULL;
UPDATE "recruitments" SET "closingDate" = safe_to_timestamp("closingDate")::text WHERE "closingDate" IS NOT NULL;

-- ── Alter column types ──────────────────────────────────────────────────────

-- Contribution
ALTER TABLE "contributions" ALTER COLUMN "date" SET DATA TYPE TIMESTAMPTZ USING "date":: TIMESTAMPTZ;

-- Transfer
ALTER TABLE "transfers" ALTER COLUMN "date" SET DATA TYPE TIMESTAMPTZ USING "date":: TIMESTAMPTZ;

-- BilledItem
ALTER TABLE "billed_items" ALTER COLUMN "date" SET DATA TYPE TIMESTAMPTZ USING "date":: TIMESTAMPTZ;

-- Death
ALTER TABLE "deaths" ALTER COLUMN "dateOfDeath" SET DATA TYPE TIMESTAMPTZ USING "dateOfDeath":: TIMESTAMPTZ;
ALTER TABLE "deaths" ALTER COLUMN "dateOfBurial" SET DATA TYPE TIMESTAMPTZ USING "dateOfBurial":: TIMESTAMPTZ;

-- Deposit
ALTER TABLE "deposits" ALTER COLUMN "date" SET DATA TYPE TIMESTAMPTZ USING "date":: TIMESTAMPTZ;

-- Creditor
ALTER TABLE "creditors" ALTER COLUMN "dueDate" SET DATA TYPE TIMESTAMPTZ USING "dueDate":: TIMESTAMPTZ;

-- Expense
ALTER TABLE "expenses" ALTER COLUMN "date" SET DATA TYPE TIMESTAMPTZ USING "date":: TIMESTAMPTZ;

-- LedgerMovement
ALTER TABLE "ledger_movements" ALTER COLUMN "time" SET DATA TYPE TIMESTAMPTZ USING "time":: TIMESTAMPTZ;

-- Delivery
ALTER TABLE "deliveries" ALTER COLUMN "date" SET DATA TYPE TIMESTAMPTZ USING "date":: TIMESTAMPTZ;

-- Sale
ALTER TABLE "sales" ALTER COLUMN "time" SET DATA TYPE TIMESTAMPTZ USING "time":: TIMESTAMPTZ;

-- Employee
ALTER TABLE "employees" ALTER COLUMN "hireDate" SET DATA TYPE TIMESTAMPTZ USING "hireDate":: TIMESTAMPTZ;

-- Leave
ALTER TABLE "leaves" ALTER COLUMN "startDate" SET DATA TYPE TIMESTAMPTZ USING "startDate":: TIMESTAMPTZ;
ALTER TABLE "leaves" ALTER COLUMN "endDate" SET DATA TYPE TIMESTAMPTZ USING "endDate":: TIMESTAMPTZ;

-- Recruitment
ALTER TABLE "recruitments" ALTER COLUMN "datePosted" SET DATA TYPE TIMESTAMPTZ USING "datePosted":: TIMESTAMPTZ;
ALTER TABLE "recruitments" ALTER COLUMN "closingDate" SET DATA TYPE TIMESTAMPTZ USING "closingDate":: TIMESTAMPTZ;

-- ── Add indexes on date filter columns ──────────────────────────────────────

CREATE INDEX IF NOT EXISTS "contributions_date_idx" ON "contributions" ("date");
CREATE INDEX IF NOT EXISTS "transfers_date_idx" ON "transfers" ("date");
CREATE INDEX IF NOT EXISTS "billed_items_date_idx" ON "billed_items" ("date");
CREATE INDEX IF NOT EXISTS "deposits_date_idx" ON "deposits" ("date");
CREATE INDEX IF NOT EXISTS "expenses_date_idx" ON "expenses" ("date");
CREATE INDEX IF NOT EXISTS "deliveries_date_idx" ON "deliveries" ("date");

-- ── Cleanup ─────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS safe_to_timestamp(TEXT);

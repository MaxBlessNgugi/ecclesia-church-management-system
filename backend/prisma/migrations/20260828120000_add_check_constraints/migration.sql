-- =============================================================================
-- Migration: add_check_constraints
-- =============================================================================
-- PURPOSE
--   Adds database-level CHECK constraints for columns that use open-ended String
--   types in Prisma but have a defined closed set of valid values. These act as
--   a backstop if the Zod validation layer is bypassed (e.g., direct DB access
--   or a future code path that skips validation).
--
--   Also adds a UNIQUE constraint on employees.email which was missing.
-- =============================================================================

-- Debtor status must be one of three allowed values.
-- The space in 'Partially Paid' is why this cannot be a Prisma enum.
ALTER TABLE "debtors"
  ADD CONSTRAINT "debtors_status_check"
  CHECK (status IN ('Outstanding', 'Partially Paid', 'Paid'));

-- Recruitment status must be one of four allowed values.
-- 'On Hold' contains a space, preventing it from being a Prisma enum.
ALTER TABLE "recruitments"
  ADD CONSTRAINT "recruitments_status_check"
  CHECK (status IN ('Open', 'Closed', 'On Hold', 'Cancelled'));

-- Employee email should be unique — two employees sharing an email is a data error.
-- Using CREATE UNIQUE INDEX so it can be added without a full table rewrite.
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");

-- AlterTable: Float → Decimal(12,2) for all money fields
-- Existing values are safe: PostgreSQL Float→Decimal cast is lossless for values within DECIMAL range.

-- Contribution
ALTER TABLE "contributions" ALTER COLUMN "amountKES" SET DATA TYPE DECIMAL(12, 2);

-- BilledItem
ALTER TABLE "billed_items" ALTER COLUMN "unitFee" SET DATA TYPE DECIMAL(12, 2);
ALTER TABLE "billed_items" ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(12, 2);

-- Deposit
ALTER TABLE "deposits" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12, 2);

-- Creditor
ALTER TABLE "creditors" ALTER COLUMN "amountOwed" SET DATA TYPE DECIMAL(12, 2);

-- Debtor
ALTER TABLE "debtors" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12, 2);

-- Expense
ALTER TABLE "expenses" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12, 2);

-- Ledger (14,2 — balances can accumulate large values)
ALTER TABLE "ledgers" ALTER COLUMN "balance" SET DATA TYPE DECIMAL(14, 2);

-- LedgerMovement
ALTER TABLE "ledger_movements" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12, 2);

-- InventoryItem
ALTER TABLE "inventory_items" ALTER COLUMN "cost" SET DATA TYPE DECIMAL(12, 2);
ALTER TABLE "inventory_items" ALTER COLUMN "price" SET DATA TYPE DECIMAL(12, 2);

-- Delivery
ALTER TABLE "deliveries" ALTER COLUMN "total" SET DATA TYPE DECIMAL(12, 2);

-- Sale
ALTER TABLE "sales" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12, 2);

-- Payroll
ALTER TABLE "payrolls" ALTER COLUMN "basicSalary" SET DATA TYPE DECIMAL(12, 2);
ALTER TABLE "payrolls" ALTER COLUMN "allowances" SET DATA TYPE DECIMAL(12, 2);
ALTER TABLE "payrolls" ALTER COLUMN "deductions" SET DATA TYPE DECIMAL(12, 2);
ALTER TABLE "payrolls" ALTER COLUMN "netPay" SET DATA TYPE DECIMAL(12, 2);

-- InventoryPriceAuditLog
ALTER TABLE "inventory_price_audit_logs" ALTER COLUMN "oldCost" SET DATA TYPE DECIMAL(12, 2);
ALTER TABLE "inventory_price_audit_logs" ALTER COLUMN "newCost" SET DATA TYPE DECIMAL(12, 2);
ALTER TABLE "inventory_price_audit_logs" ALTER COLUMN "oldPrice" SET DATA TYPE DECIMAL(12, 2);
ALTER TABLE "inventory_price_audit_logs" ALTER COLUMN "newPrice" SET DATA TYPE DECIMAL(12, 2);

-- Migration: Add performance indexes for hot query paths
-- All indexes are additive (no drops) and safe on existing data.

-- Christian: composite for list endpoint (WHERE status + ORDER BY createdAt DESC)
CREATE INDEX "christians_status_createdat_idx" ON "christians" ("status", "createdAt");

-- Creditor: dashboard count (WHERE status IN (...))
CREATE INDEX "creditors_status_idx" ON "creditors" ("status");

-- Debtor: dashboard count (WHERE status IN (...))
CREATE INDEX "debtors_status_idx" ON "debtors" ("status");

-- AuditLog: composite for audit list (WHERE entityName + action)
CREATE INDEX "audit_logs_entityname_action_idx" ON "audit_logs" ("entityName", "action");

-- AuditLog: actor filter (WHERE deletedByName)
CREATE INDEX "audit_logs_deletedbyname_idx" ON "audit_logs" ("deletedByName");

-- Deposit: sequential refNo generation (ORDER BY refNo DESC)
CREATE INDEX "deposits_refno_idx" ON "deposits" ("refNo");

-- Expense: sequential voucherNo generation (ORDER BY voucherNo DESC)
CREATE INDEX "expenses_voucherno_idx" ON "expenses" ("voucherNo");

-- InventoryItem: name lookup for sales (findFirst WHERE name = item)
CREATE INDEX "inventory_items_name_idx" ON "inventory_items" ("name");

-- Sale: item filter for reports (WHERE item CONTAINS)
CREATE INDEX "sales_item_idx" ON "sales" ("item");

-- Payroll: status filter (WHERE status)
CREATE INDEX "payrolls_status_idx" ON "payrolls" ("status");

-- Leave: status filter (WHERE status)
CREATE INDEX "leaves_status_idx" ON "leaves" ("status");

-- Recruitment: status filter (WHERE status)
CREATE INDEX "recruitments_status_idx" ON "recruitments" ("status");

-- RecruitmentApplicant: status filter (WHERE status)
CREATE INDEX "recruitment_applicants_status_idx" ON "recruitment_applicants" ("status");

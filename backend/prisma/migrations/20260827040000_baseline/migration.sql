-- Ecclesia CMS — Baseline Migration
-- This is the initial migration that captures the full schema as of v1.0.0.
-- For fresh databases: `prisma migrate deploy` applies this automatically.
-- For existing databases (previously managed by `db push`): see OPERATIONS.md
-- for the one-time baseline adoption procedure.
--
-- Columns like User.panels, Christian.baptism, Contribution.categories etc.
-- use native jsonb for type safety. Prisma returns parsed JS objects.

-- ═══════════════════════════════════════════════════════════════════════════════
-- ENUM TYPES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TYPE "UserRole" AS ENUM ('super_admin', 'admin', 'staff', 'viewer');
CREATE TYPE "ChristianStatus" AS ENUM ('Active', 'Transferred', 'Deceased', 'Inactive');
CREATE TYPE "CreditorStatus" AS ENUM ('Pending', 'Overdue', 'Scheduled', 'Paid');
CREATE TYPE "PayrollStatus" AS ENUM ('Draft', 'Approved', 'Paid', 'Cancelled');
CREATE TYPE "LeaveStatus" AS ENUM ('Pending', 'Approved', 'Rejected', 'Cancelled');
CREATE TYPE "RecruitmentApplicantStatus" AS ENUM ('Pending', 'Reviewed', 'Interviewed', 'Accepted', 'Rejected');
CREATE TYPE "AuditAction" AS ENUM ('DELETE', 'RESTORE');
CREATE TYPE "PaymentMode" AS ENUM ('sandbox', 'live');

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Users & Auth ──────────────────────────────────────────────────────────────

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'staff',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "panels" jsonb,
    "actions" jsonb,
    "resetTokenHash" TEXT,
    "resetTokenExpires" TIMESTAMPTZ(6),
    "resetFailedAttempts" INTEGER NOT NULL DEFAULT 0,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "loginFailedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(6),
    "lastLoginAt" TIMESTAMPTZ(6),
    "lastActiveAt" TIMESTAMPTZ(6),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "panel_permissions" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "panels" jsonb NOT NULL,
    "actions" jsonb NOT NULL,

    CONSTRAINT "panel_permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "push_payment_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "paybill" TEXT NOT NULL DEFAULT '',
    "accountFormat" TEXT NOT NULL DEFAULT '',
    "consumerKey" TEXT NOT NULL DEFAULT '',
    "consumerSecret" TEXT NOT NULL DEFAULT '',
    "mode" "PaymentMode" NOT NULL DEFAULT 'sandbox',
    "testPhone" TEXT NOT NULL DEFAULT '',
    "testAmount" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "push_payment_settings_pkey" PRIMARY KEY ("id")
);

-- ── Parish Registry ───────────────────────────────────────────────────────────

CREATE TABLE "christians" (
    "id" TEXT NOT NULL,
    "regNo" TEXT NOT NULL,
    "nationalId" TEXT NOT NULL,
    "baptismalName" TEXT NOT NULL,
    "secondName" TEXT NOT NULL,
    "sirName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "diocese" TEXT NOT NULL,
    "parish" TEXT NOT NULL,
    "localChurch" TEXT NOT NULL,
    "scc" TEXT NOT NULL,
    "status" "ChristianStatus" NOT NULL DEFAULT 'Active',
    "baptism" jsonb,
    "eucharist" jsonb,
    "confirmation" jsonb,
    "marriage" jsonb,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "christians_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "christians_regNo_key" ON "christians"("regNo");
CREATE INDEX "christians_status_createdat_idx" ON "christians"("status", "createdAt");
CREATE INDEX "christians_scc_idx" ON "christians"("scc");
CREATE INDEX "christians_localChurch_idx" ON "christians"("localChurch");

CREATE TABLE "contributions" (
    "id" TEXT NOT NULL,
    "christianId" TEXT NOT NULL,
    "memberName" TEXT NOT NULL,
    "regNo" TEXT NOT NULL,
    "categories" jsonb NOT NULL,
    "otherCategory" TEXT,
    "monthlyTracker" jsonb NOT NULL,
    "amountKES" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMPTZ(6) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contributions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contributions_christianId_idx" ON "contributions"("christianId");
CREATE INDEX "contributions_date_idx" ON "contributions"("date");

CREATE TABLE "transfers" (
    "id" TEXT NOT NULL,
    "christianId" TEXT NOT NULL,
    "memberName" TEXT NOT NULL,
    "diocese" TEXT NOT NULL,
    "parish" TEXT NOT NULL,
    "localChurch" TEXT NOT NULL,
    "scc" TEXT NOT NULL,
    "date" TIMESTAMPTZ(6) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "transfers_christianId_idx" ON "transfers"("christianId");
CREATE INDEX "transfers_date_idx" ON "transfers"("date");

CREATE TABLE "billed_items" (
    "id" TEXT NOT NULL,
    "christianId" TEXT,
    "memberName" TEXT NOT NULL,
    "isWalkIn" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "unitFee" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMPTZ(6) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billed_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "billed_items_date_idx" ON "billed_items"("date");

CREATE TABLE "deaths" (
    "id" TEXT NOT NULL,
    "christianId" TEXT NOT NULL,
    "memberName" TEXT NOT NULL,
    "placeOfDeath" TEXT NOT NULL,
    "dateOfDeath" TIMESTAMPTZ(6) NOT NULL,
    "dateOfBurial" TIMESTAMPTZ(6) NOT NULL,
    "ministerName" TEXT NOT NULL,
    "remarks" TEXT NOT NULL DEFAULT '',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deaths_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "deaths_christianId_idx" ON "deaths"("christianId");

-- ── Finance ───────────────────────────────────────────────────────────────────

CREATE TABLE "deposits" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMPTZ(6) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNo" TEXT NOT NULL,
    "sourceOfCash" TEXT NOT NULL,
    "refNo" TEXT NOT NULL,
    "depositedBy" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "deposits_date_idx" ON "deposits"("date");
CREATE INDEX "deposits_refno_idx" ON "deposits"("refNo");

CREATE TABLE "creditors" (
    "id" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "amountOwed" DECIMAL(12,2) NOT NULL,
    "dueDate" TIMESTAMPTZ(6) NOT NULL,
    "status" "CreditorStatus" NOT NULL DEFAULT 'Pending',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "creditors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "creditors_status_idx" ON "creditors"("status");

CREATE TABLE "debtors" (
    "id" TEXT NOT NULL,
    "memberName" TEXT NOT NULL,
    "contributionType" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Outstanding',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "debtors_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "debtors_status_check" CHECK ("status" IN ('Outstanding', 'Partially Paid', 'Paid'))
);

CREATE INDEX "debtors_status_idx" ON "debtors"("status");

CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMPTZ(6) NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "voucherNo" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expenses_date_idx" ON "expenses"("date");
CREATE INDEX "expenses_voucherno_idx" ON "expenses"("voucherNo");

CREATE TABLE "ledgers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cashier" TEXT NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ledgers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ledgers_code_key" ON "ledgers"("code");

CREATE TABLE "ledger_movements" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "time" TIMESTAMPTZ(6) NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_movements_pkey" PRIMARY KEY ("id")
);

-- ── Inventory ─────────────────────────────────────────────────────────────────

CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "reorder" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_items_sku_key" ON "inventory_items"("sku");
CREATE INDEX "inventory_items_name_idx" ON "inventory_items"("name");

CREATE TABLE "deliveries" (
    "id" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "inv" TEXT NOT NULL,
    "date" TIMESTAMPTZ(6) NOT NULL,
    "units" INTEGER NOT NULL,
    "cat" TEXT NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "deliveries_date_idx" ON "deliveries"("date");

CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "time" TIMESTAMPTZ(6) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sales_item_idx" ON "sales"("item");

CREATE TABLE "stock_takes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "system" INTEGER NOT NULL,
    "physical" INTEGER NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stock_takes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_issues" (
    "id" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "dest" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_issues_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_price_audit_logs" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "oldCost" DECIMAL(12,2),
    "newCost" DECIMAL(12,2),
    "oldPrice" DECIMAL(12,2),
    "newPrice" DECIMAL(12,2),
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_price_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inventory_price_audit_logs_itemId_idx" ON "inventory_price_audit_logs"("itemId");
CREATE INDEX "inventory_price_audit_logs_createdAt_idx" ON "inventory_price_audit_logs"("createdAt");

-- ── Human Resources ───────────────────────────────────────────────────────────

CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "hireDate" TIMESTAMPTZ(6) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employees_code_key" ON "employees"("code");

CREATE TABLE "payrolls" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "basicSalary" DECIMAL(12,2) NOT NULL,
    "allowances" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(12,2) NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'Draft',
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payrolls_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payrolls_employeeId_idx" ON "payrolls"("employeeId");
CREATE INDEX "payrolls_status_idx" ON "payrolls"("status");

CREATE TABLE "leaves" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startDate" TIMESTAMPTZ(6) NOT NULL,
    "endDate" TIMESTAMPTZ(6) NOT NULL,
    "days" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'Pending',
    "approvedBy" TEXT,
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leaves_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "leaves_employeeId_idx" ON "leaves"("employeeId");
CREATE INDEX "leaves_status_idx" ON "leaves"("status");

CREATE TABLE "recruitments" (
    "id" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "datePosted" TIMESTAMPTZ(6) NOT NULL,
    "closingDate" TIMESTAMPTZ(6),
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recruitments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recruitments_status_check" CHECK ("status" IN ('Open', 'Closed', 'On Hold', 'Cancelled'))
);

CREATE INDEX "recruitments_status_idx" ON "recruitments"("status");

CREATE TABLE "recruitment_applicants" (
    "id" TEXT NOT NULL,
    "recruitmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "cvSummary" TEXT,
    "status" "RecruitmentApplicantStatus" NOT NULL DEFAULT 'Pending',
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recruitment_applicants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recruitment_applicants_recruitmentId_idx" ON "recruitment_applicants"("recruitmentId");
CREATE INDEX "recruitment_applicants_status_idx" ON "recruitment_applicants"("status");

-- ── Audit & Ops ───────────────────────────────────────────────────────────────

CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL DEFAULT 'DELETE',
    "deletedBy" TEXT,
    "deletedByName" TEXT,
    "metadataSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_entityname_action_idx" ON "audit_logs"("entityName", "action");
CREATE INDEX "audit_logs_entityId_idx" ON "audit_logs"("entityId");
CREATE INDEX "audit_logs_deletedbyname_idx" ON "audit_logs"("deletedByName");

-- ── Settings ──────────────────────────────────────────────────────────────────

CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL DEFAULT '',
    "diocese" TEXT NOT NULL DEFAULT '',
    "localChurch" TEXT NOT NULL DEFAULT '',
    "sccLabel" TEXT NOT NULL DEFAULT 'Jumuiya',
    "county" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'Kenya',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "motto" TEXT NOT NULL DEFAULT '',
    "logoData" TEXT,
    "setupCompleted" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sms_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT NOT NULL DEFAULT 'sandbox',
    "apiKey" TEXT NOT NULL DEFAULT '',
    "senderId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sms_settings_pkey" PRIMARY KEY ("id")
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- FOREIGN KEYS
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE "contributions" ADD CONSTRAINT "contributions_christianId_fkey"
    FOREIGN KEY ("christianId") REFERENCES "christians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transfers" ADD CONSTRAINT "transfers_christianId_fkey"
    FOREIGN KEY ("christianId") REFERENCES "christians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "billed_items" ADD CONSTRAINT "billed_items_christianId_fkey"
    FOREIGN KEY ("christianId") REFERENCES "christians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "deaths" ADD CONSTRAINT "deaths_christianId_fkey"
    FOREIGN KEY ("christianId") REFERENCES "christians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "leaves" ADD CONSTRAINT "leaves_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recruitment_applicants" ADD CONSTRAINT "recruitment_applicants_recruitmentId_fkey"
    FOREIGN KEY ("recruitmentId") REFERENCES "recruitments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

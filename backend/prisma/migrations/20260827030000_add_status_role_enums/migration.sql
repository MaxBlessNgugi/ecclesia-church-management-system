-- Migration: Add Prisma enums and CHECK constraints for status/role fields
-- Enforces allowed values at the database level as a backstop to Zod validation.

-- ═══════════════════════════════════════════════════════════════════════════════
-- PRISMA ENUMS (for fields without spaces in values)
-- ═══════════════════════════════════════════════════════════════════════════════

-- User.role — super_admin, admin, staff, viewer
CREATE TYPE "UserRole" AS ENUM ('super_admin', 'admin', 'staff', 'viewer');

-- Christian.status — Active, Transferred, Deceased, Inactive
CREATE TYPE "ChristianStatus" AS ENUM ('Active', 'Transferred', 'Deceased', 'Inactive');

-- Creditor.status — Pending, Overdue, Scheduled, Paid
CREATE TYPE "CreditorStatus" AS ENUM ('Pending', 'Overdue', 'Scheduled', 'Paid');

-- Payroll.status — Draft, Approved, Paid, Cancelled
CREATE TYPE "PayrollStatus" AS ENUM ('Draft', 'Approved', 'Paid', 'Cancelled');

-- Leave.status — Pending, Approved, Rejected, Cancelled
CREATE TYPE "LeaveStatus" AS ENUM ('Pending', 'Approved', 'Rejected', 'Cancelled');

-- RecruitmentApplicant.status — Pending, Reviewed, Interviewed, Accepted, Rejected
CREATE TYPE "RecruitmentApplicantStatus" AS ENUM ('Pending', 'Reviewed', 'Interviewed', 'Accepted', 'Rejected');

-- AuditLog.action — DELETE, RESTORE
CREATE TYPE "AuditAction" AS ENUM ('DELETE', 'RESTORE');

-- PushPaymentSettings.mode — sandbox, live
CREATE TYPE "PaymentMode" AS ENUM ('sandbox', 'live');

-- ═══════════════════════════════════════════════════════════════════════════════
-- ALTER COLUMNS to use enum types
-- ═══════════════════════════════════════════════════════════════════════════════

-- User.role
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole" USING "role"::"UserRole";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'staff';

-- Christian.status
ALTER TABLE "christians" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "christians" ALTER COLUMN "status" TYPE "ChristianStatus" USING "status"::"ChristianStatus";
ALTER TABLE "christians" ALTER COLUMN "status" SET DEFAULT 'Active';

-- Creditor.status
ALTER TABLE "creditors" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "creditors" ALTER COLUMN "status" TYPE "CreditorStatus" USING "status"::"CreditorStatus";
ALTER TABLE "creditors" ALTER COLUMN "status" SET DEFAULT 'Pending';

-- Payroll.status
ALTER TABLE "payrolls" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "payrolls" ALTER COLUMN "status" TYPE "PayrollStatus" USING "status"::"PayrollStatus";
ALTER TABLE "payrolls" ALTER COLUMN "status" SET DEFAULT 'Draft';

-- Leave.status
ALTER TABLE "leaves" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "leaves" ALTER COLUMN "status" TYPE "LeaveStatus" USING "status"::"LeaveStatus";
ALTER TABLE "leaves" ALTER COLUMN "status" SET DEFAULT 'Pending';

-- RecruitmentApplicant.status
ALTER TABLE "recruitment_applicants" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "recruitment_applicants" ALTER COLUMN "status" TYPE "RecruitmentApplicantStatus" USING "status"::"RecruitmentApplicantStatus";
ALTER TABLE "recruitment_applicants" ALTER COLUMN "status" SET DEFAULT 'Pending';

-- AuditLog.action
ALTER TABLE "audit_logs" ALTER COLUMN "action" DROP DEFAULT;
ALTER TABLE "audit_logs" ALTER COLUMN "action" TYPE "AuditAction" USING "action"::"AuditAction";
ALTER TABLE "audit_logs" ALTER COLUMN "action" SET DEFAULT 'DELETE';

-- PushPaymentSettings.mode
ALTER TABLE "push_payment_settings" ALTER COLUMN "mode" DROP DEFAULT;
ALTER TABLE "push_payment_settings" ALTER COLUMN "mode" TYPE "PaymentMode" USING "mode"::"PaymentMode";
ALTER TABLE "push_payment_settings" ALTER COLUMN "mode" SET DEFAULT 'sandbox';

-- ═══════════════════════════════════════════════════════════════════════════════
-- CHECK CONSTRAINTS (for fields with spaces in values)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Debtor.status — Outstanding, Partially Paid, Paid
ALTER TABLE "debtors" ADD CONSTRAINT "debtors_status_check"
  CHECK ("status" IN ('Outstanding', 'Partially Paid', 'Paid'));

-- Recruitment.status — Open, Closed, On Hold, Cancelled
ALTER TABLE "recruitments" ADD CONSTRAINT "recruitments_status_check"
  CHECK ("status" IN ('Open', 'Closed', 'On Hold', 'Cancelled'));

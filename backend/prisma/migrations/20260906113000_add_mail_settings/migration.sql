-- Singleton table storing outbound email (SMTP) configuration, edited from
-- the first-run setup wizard / Administration. smtpPass holds an encrypted
-- payload (backend/src/lib/crypto.ts) and is masked in API responses.
-- CreateTable
CREATE TABLE "mail_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "smtpHost" TEXT NOT NULL DEFAULT '',
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
    "smtpUser" TEXT NOT NULL DEFAULT '',
    "smtpPass" TEXT NOT NULL DEFAULT '',
    "fromAddress" TEXT NOT NULL DEFAULT 'ECCLESIA <no-reply@ecclesia.local>',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mail_settings_pkey" PRIMARY KEY ("id")
);

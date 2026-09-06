-- Add per-user token version for JWT session invalidation.
-- Incremented on every password change/reset (user-initiated, admin-issued
-- reset code, or admin recovery). requireAuth compares the version embedded in
-- the JWT against this column and rejects tokens signed before the change, so
-- stolen tokens cannot outlive a password reset.
ALTER TABLE "users" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

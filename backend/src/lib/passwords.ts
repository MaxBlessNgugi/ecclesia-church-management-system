// =============================================================================
// Password generation — shared by the seeder and admin recovery
// =============================================================================
// Single source of truth for temporary passwords so the seeder
// (backend/prisma/seed.ts) and the admin reset CLI
// (backend/scripts/reset-admin-password.ts) produce identical strength.
// Uses crypto.randomBytes — cryptographically secure.
// =============================================================================

import crypto from 'crypto';

/**
 * Generate a secure random password (alphanumeric + special chars).
 * Characters that look alike (0/O, 1/l/I) are excluded to survive copy-paste.
 */
export function generateRandomPassword(length = 16): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz23456789!@#$%^&*';
  const bytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[bytes[i] % charset.length];
  }
  return password;
}

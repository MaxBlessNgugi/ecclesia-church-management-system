// =============================================================================
// Admin password recovery — server-local credential rescue
// =============================================================================
// Core primitive for `npm run admin:reset -- <email>`: issues a new temporary
// password for a locked-out administrator. Runs only ON the server (CLI or
// `docker compose exec app`), never exposed as an HTTP route — possession of
// the server is the trust boundary for a parish LAN deployment.
//
// Clears everything that could keep the account unusable: lockout, failed
// attempt counters, and any pending password-reset code. Forces a password
// change at next sign-in because the temporary password is printed, not
// delivered privately.
//
// RELATED FILES
//   - backend/src/lib/passwords.ts          → generateRandomPassword()
//   - backend/scripts/reset-admin-password.ts → CLI wrapper
// =============================================================================

import { appPrisma } from './prisma.js';
import { hashPassword } from './auth.js';
import { generateRandomPassword } from './passwords.js';

/**
 * Reset an administrator's password, returning a one-time temporary password.
 *
 * @param email - Account email to reset (must exist and not be soft-deleted).
 * @returns The temporary password to print once to the operator.
 * @throws Error when no active account matches the email.
 */
export async function resetAdminPassword(email: string): Promise<{ temporaryPassword: string }> {
  const user = await appPrisma.user.findFirst({
    where: { email, isDeleted: false },
  });
  if (!user) {
    throw new Error(`No active account found for ${email}`);
  }

  const temporaryPassword = generateRandomPassword();
  await appPrisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      lockedUntil: null,
      loginFailedAttempts: 0,
      resetTokenHash: null,
      resetTokenExpires: null,
      resetFailedAttempts: 0,
    },
  });

  return { temporaryPassword };
}

/**
 * Admin password recovery tests — resetAdminPassword()
 *
 * Verifies the server-local recovery primitive used by
 * `npm run admin:reset -- <email>`:
 *   1. Issues a new password that verifies against the stored hash.
 *   2. Forces a password change at next sign-in (mustChangePassword).
 *   3. Clears any account lockout / failed-attempt state.
 *   4. Rejects unknown or soft-deleted accounts instead of creating them.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { createTestApp, seedTestUser, cleanupTestData } from './helpers.js';
import { appPrisma } from '../src/lib/prisma.js';
import { resetAdminPassword } from '../src/lib/adminRecovery.js';
import type { Express } from 'express';

let app: Express;

beforeAll(async () => {
  app = createTestApp();
});

beforeEach(async () => {
  await cleanupTestData();
  await seedTestUser();
});

describe('resetAdminPassword', () => {
  it('replaces the password so the new one verifies', async () => {
    const user = await appPrisma.user.findUniqueOrThrow({ where: { email: 'admin@test.com' } });

    const result = await resetAdminPassword('admin@test.com');

    const reloaded = await appPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(reloaded.passwordHash).not.toBe(user.passwordHash);
    expect(await bcrypt.compare(result.temporaryPassword, reloaded.passwordHash)).toBe(true);
  });

  it('forces a password change at next sign-in', async () => {
    await resetAdminPassword('admin@test.com');

    const reloaded = await appPrisma.user.findUniqueOrThrow({ where: { email: 'admin@test.com' } });
    expect(reloaded.mustChangePassword).toBe(true);
  });

  it('clears lockout and failed-attempt state', async () => {
    await appPrisma.user.update({
      where: { email: 'admin@test.com' },
      data: {
        lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
        loginFailedAttempts: 5,
      },
    });

    await resetAdminPassword('admin@test.com');

    const reloaded = await appPrisma.user.findUniqueOrThrow({ where: { email: 'admin@test.com' } });
    expect(reloaded.lockedUntil).toBeNull();
    expect(reloaded.loginFailedAttempts).toBe(0);
  });

  it('clears any pending password-reset code', async () => {
    await appPrisma.user.update({
      where: { email: 'admin@test.com' },
      data: {
        resetTokenHash: 'stale-hash',
        resetTokenExpires: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    await resetAdminPassword('admin@test.com');

    const reloaded = await appPrisma.user.findUniqueOrThrow({ where: { email: 'admin@test.com' } });
    expect(reloaded.resetTokenHash).toBeNull();
    expect(reloaded.resetTokenExpires).toBeNull();
  });

  it('rejects an unknown email without creating a user', async () => {
    await expect(resetAdminPassword('ghost@test.com')).rejects.toThrow(/no active account/i);
    await expect(
      appPrisma.user.findUnique({ where: { email: 'ghost@test.com' } }),
    ).resolves.toBeNull();
  });

  it('rejects a soft-deleted account', async () => {
    await appPrisma.user.update({
      where: { email: 'admin@test.com' },
      data: { isDeleted: true },
    });

    await expect(resetAdminPassword('admin@test.com')).rejects.toThrow(/no active account/i);
  });
});

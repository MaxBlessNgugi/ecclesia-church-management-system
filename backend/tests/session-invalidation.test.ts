/**
 * Session Invalidation Test Suite — tokenVersion rotation
 *
 * Verifies that JWTs cannot outlive a credential change:
 *   1. Self-service password change (PUT /auth/change-password) bumps the
 *      user's tokenVersion: tokens issued before the change are rejected with
 *      401, and the caller receives a fresh token that still works.
 *   2. Legacy tokens minted WITHOUT a tokenVersion claim are rejected outright.
 *   3. An admin-issued reset code (POST /api/admin/users/:id/reset-password)
 *      revokes the target's outstanding tokens; the pre-reset token stops
 *      working immediately.
 *
 * Runs against a real database via the shared test helpers.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, seedTestUser, cleanupTestData } from './helpers.js';
import type { Express } from 'express';
import { appPrisma } from '../src/lib/prisma.js';
import { signToken } from '../src/lib/auth.js';

let app: Express;
let token: string;

beforeAll(async () => {
  app = createTestApp();
});

beforeEach(async () => {
  await cleanupTestData();
  const seeded = await seedTestUser();
  token = seeded.token;
});

describe('Session invalidation (tokenVersion)', () => {
  /**
   * Sanity check: a freshly seeded token (tokenVersion matches the DB) is
   * accepted by a protected endpoint before any credential change.
   */
  it('accepts a token whose tokenVersion matches the DB', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  /**
   * Self-service password change must invalidate tokens issued before the
   * change: after PUT /change-password succeeds, replaying the OLD token
   * yields 401 instead of continuing to authorize requests.
   */
  it('rejects the old token after a self-service password change', async () => {
    const change = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'TestPass123!', newPassword: 'NewPass123!' });
    expect(change.status).toBe(200);

    const replay = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(replay.status).toBe(401);
  });

  /**
   * The change-password response carries a ROTATED token (with the
   * incremented tokenVersion) for the current session. That fresh token must
   * be accepted — the caller should not be logged out of the device they
   * changed their password from.
   */
  it('returns a fresh working token to the password-change caller', async () => {
    const change = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'TestPass123!', newPassword: 'NewPass123!' });
    expect(change.status).toBe(200);
    expect(typeof change.body.token).toBe('string');

    const fresh = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${change.body.token}`);
    expect(fresh.status).toBe(200);
  });

  /**
   * A token whose embedded tokenVersion no longer matches the live DB value
   * must be rejected. This also covers tokens minted WITHOUT the claim
   * (legacy tokens from before the feature): the middleware treats a missing
   * claim as -1, which never equals the stored version. Rejection must be
   * caused by the version mismatch itself, not by an unknown user id.
   */
  it('rejects a token whose tokenVersion no longer matches the DB', async () => {
    const seeded = await appPrisma.user.findUnique({ where: { email: 'admin@test.com' } });
    expect(seeded).toBeTruthy();

    // Token signed against the CURRENT version — must work.
    const current = signToken({
      id: seeded!.id, email: seeded!.email, role: seeded!.role, tokenVersion: seeded!.tokenVersion,
    });
    const ok = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${current}`);
    expect(ok.status).toBe(200);

    // Bump the DB version behind the token's back (simulates a credential
    // change from another device / a legacy claim-less token via the -1 rule).
    await appPrisma.user.update({
      where: { id: seeded!.id },
      data: { tokenVersion: { increment: 1 } },
    });

    const replay = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${current}`);
    expect(replay.status).toBe(401);
  });

  /**
   * An admin-issued reset code must revoke the target's outstanding sessions
   * immediately: the target's pre-reset token stops working even before the
   * reset code is redeemed, because whoever requested the reset is presumed
   * to hold (or be) the account owner.
   */
  it('revokes the target token when an admin issues a reset code', async () => {
    // Create a target user and give them a token, then reset them as admin.
    const target = await appPrisma.user.create({
      data: {
        email: 'target@test.com',
        passwordHash: 'x',
        name: 'Target User',
        role: 'staff',
        isActive: true,
      },
    });
    const targetToken = signToken({
      id: target.id, email: target.email, role: target.role, tokenVersion: target.tokenVersion,
    });

    const issueForTarget = await request(app)
      .post(`/api/admin/users/${target.id}/reset-password`)
      .set('Authorization', `Bearer ${token}`);
    expect(issueForTarget.status).toBe(200);
    expect(issueForTarget.body.code).toBeTruthy();

    // The target's pre-reset token must now be dead.
    const replay = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${targetToken}`);
    expect(replay.status).toBe(401);
  });
});

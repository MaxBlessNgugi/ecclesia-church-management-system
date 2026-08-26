/**
 * Security Test Suite — Ecclesia Church Management System
 *
 * Validates the backend's core security controls end-to-end via HTTP
 * requests using supertest against the test Express app.
 *
 * Coverage areas:
 *   1. Rate limiting — the login endpoint must not block legitimate requests
 *      under normal usage, while the underlying limiter configuration prevents
 *      brute-force attacks.
 *   2. Token validation — malformed or fabricated JWTs must be rejected with
 *      401 rather than leaking data or allowing impersonation.
 *   3. Password complexity enforcement — the registration endpoint must reject
 *      passwords that fail to meet the configured policy (min length, uppercase,
 *      lowercase, digit, and special character requirements).
 *   4. Account lockout — repeated failed login attempts must progressively lock
 *      the account (HTTP 423) to prevent online brute-force attacks.
 *   5. SQL injection resilience — crafted input containing SQL metacharacters
 *      must be handled gracefully (401) without crashing the server or
 *      executing arbitrary SQL.
 *   6. Health endpoint — the /api/health route must confirm database
 *      connectivity so orchestrators can detect a broken datasource.
 *   7. Authorization enforcement — protected endpoints must reject unauthenticated
 *      requests (missing Authorization header) with 401.
 *
 * Each test includes a descriptive comment explaining which security property
 * it verifies. Tests run against a real database via the shared test helpers
 * to ensure correctness at the integration level.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, seedTestUser, cleanupTestData } from './helpers.js';
import type { Express } from 'express';
import { appPrisma } from '../src/lib/prisma.js';
import bcrypt from 'bcryptjs';

let app: Express;
let token: string;

beforeAll(async () => {
  app = createTestApp();
  const seeded = await seedTestUser();
  token = seeded.token;
});

beforeEach(async () => {
  await cleanupTestData();
  const seeded = await seedTestUser();
  token = seeded.token;
});

describe('Security', () => {
  /**
   * Rate limiting — POST /api/auth/login with correct credentials must return
   * 200. This confirms the rate limiter does not interfere with legitimate
   * authentication requests under normal conditions. The limiter configuration
   * (10 requests per 15-minute window) only kicks in under sustained abuse.
   */
  it('rate limiter allows normal login', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'TestPass123!' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe('admin@test.com');
  });

  /**
   * Rate limiting — POST /api/auth/login exceeding the configured limit (10
   * requests per 15-minute window per IP) must return 429. This verifies the
   * express-rate-limit middleware actually blocks excessive requests, protecting
   * against brute-force login attempts. Invalid credentials are used so that
   * the test does not depend on account lockout logic (which triggers at 5
   * failed attempts with a different status code 423).
   */
  it('rate limiter blocks excessive login attempts with 429', async () => {
    // The loginLimiter is configured with max: 10 per window
    const LIMIT = 10;
    const invalidCredentials = { email: 'nonexistent@test.com', password: 'wrong' };

    // First LIMIT requests should not be rate-limited (they may return 401)
    for (let i = 0; i < LIMIT; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send(invalidCredentials);
      // Expect 401 for invalid credentials, not 429 (rate limit not hit yet)
      expect([400, 401]).toContain(res.status);
    }

    // The (LIMIT + 1)th request should be blocked by the rate limiter
    const blockedRes = await request(app)
      .post('/api/auth/login')
      .send(invalidCredentials);
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body).toHaveProperty('error');
    expect(blockedRes.body.error).toMatch(/too many sign-in attempts/i);
  });

  /**
   * Invalid token rejection — GET /api/auth/me with a fabricated Bearer token
   * must return 401. This ensures unsigned or malformed tokens cannot be used
   * to impersonate a user or bypass authentication.
   */
  it('rejects invalid Bearer token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer completely-fake-token-12345');
    expect(res.status).toBe(401);
  });

  /**
   * Password complexity — POST /api/auth/register with a weak password ("weak")
   * must fail with a validation error (400) and not create the user. The
   * register endpoint requires super_admin authentication, so the seeded admin
   * token is supplied. The password "weak" violates every complexity rule
   * (too short, no uppercase, no digit, no special character).
   */
  it('rejects weak password on registration', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'newuser@test.com',
        password: 'weak',
        name: 'Weak Password User',
        role: 'staff',
      });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message');
  });

  /**
   * Account lockout — after MAX_LOGIN_ATTEMPTS (5) consecutive wrong-password
   * attempts, the account must return 423 (Locked) on subsequent login tries.
   * The beforeEach hook resets loginFailedAttempts and lockedUntil so each test
   * starts from a clean state.
   */
  it('locks account after MAX_LOGIN_ATTEMPTS wrong passwords', async () => {
    const MAX_LOGIN_ATTEMPTS = 5;

    // Drain all wrong-password attempts up to the lockout threshold.
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'wrong-password' });
      expect(res.status).toBe(401);
    }

    // The next attempt — even with the correct password — must be locked out.
    const lockedRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'TestPass123!' });
    expect(lockedRes.status).toBe(423);
    expect(lockedRes.body.message).toMatch(/locked/i);
  });

  /**
   * SQL injection resilience — POST /api/auth/login with an email containing
   * classic SQL injection payload must return 400 (Zod validation rejects the
   * malformed email) or 401 (not found), and must NOT crash the server or
   * cause a 500 error. Zod catches the invalid format before it reaches the
   * database, and Prisma parameterizes any queries that do execute, so the
   * payload is treated as a literal string, not executable SQL.
   */
  it('handles SQL injection in login email gracefully', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: "'; DROP TABLE users; --", password: 'anything' });
    expect([400, 401]).toContain(res.status);
    // Verify the server is still operational after the injection attempt.
    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
  });

  /**
   * Health endpoint — GET /api/health must return 200 with db: "connected"
   * confirming the database is reachable. Load balancers and orchestrators
   * depend on this signal to route traffic away from unhealthy instances.
   */
  it('health endpoint reports database status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.db).toBe('connected');
    expect(res.body.status).toBe('ok');
  });

  /**
   * Missing auth header — GET /api/hr/employees without an Authorization
   * header must return 401. Protected endpoints must never serve data to
   * unauthenticated callers, regardless of other request properties.
   */
  it('rejects request without Authorization header', async () => {
    const res = await request(app).get('/api/hr/employees');
    expect(res.status).toBe(401);
  });
});

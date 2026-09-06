/**
 * Mail Settings Test Suite — SMTP configuration + verification endpoint
 *
 * Verifies the /api/admin/mail-settings contract used by the first-run wizard
 * and the Administration settings form:
 *   1. GET returns the singleton with a MASKED password (never the plaintext)
 *      and reports the active delivery mode.
 *   2. PUT stores the settings (password encrypted at rest) and the masked
 *      placeholder round-trip preserves the stored password.
 *   3. Non-admin users are rejected with 403.
 *   4. POST /verify against an unreachable SMTP server fails with a clean
 *      502 carrying the provider's message (no 500, no hang).
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, seedTestUser, cleanupTestData } from './helpers.js';
import type { Express } from 'express';
import { appPrisma, prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/lib/auth.js';
import { decryptString } from '../src/lib/crypto.js';

let app: Express;
let adminToken: string;

beforeAll(async () => {
  app = createTestApp();
});

beforeEach(async () => {
  await cleanupTestData();
  // Mail settings is a singleton — clear it so tests start from defaults.
  // (Raw client: appPrisma blocks hard deletes on every model.)
  await prisma.mailSettings.deleteMany();
  const seeded = await seedTestUser();
  adminToken = seeded.token;
});

/** Creates a low-privilege user and returns a token for them. */
async function staffToken() {
  const user = await appPrisma.user.create({
    data: {
      email: 'mailstaff@test.com',
      passwordHash: 'x',
      name: 'Mail Staff',
      role: 'staff',
      isActive: true,
    },
  });
  return signToken({ id: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion });
}

const VALID_SETTINGS = {
  enabled: true,
  smtpHost: 'smtp.test.example',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: 'parish@test.example',
  smtpPass: 's3cret!Pass',
  fromAddress: 'ECCLESIA <no-reply@test.example>',
};

describe('Mail settings (SMTP configuration)', () => {
  it('returns defaults with a masked password and the active mode', async () => {
    const res = await request(app)
      .get('/api/admin/mail-settings')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(res.body.smtpHost).toBe('');
    expect(res.body.smtpPass).toBe('');
    expect(res.body.hasSmtpPass).toBe(false);
    expect(['db', 'env', 'dev-outbox']).toContain(res.body.mode);
  });

  it('stores settings with the password encrypted at rest', async () => {
    const put = await request(app)
      .put('/api/admin/mail-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(VALID_SETTINGS);
    expect(put.status).toBe(200);
    expect(put.body.enabled).toBe(true);
    expect(put.body.smtpHost).toBe('smtp.test.example');
    // Masked in the response…
    expect(put.body.smtpPass).not.toBe(VALID_SETTINGS.smtpPass);
    expect(put.body.hasSmtpPass).toBe(true);
    // …and encrypted (not plaintext) in the database.
    const row = await appPrisma.mailSettings.findUnique({ where: { id: 'default' } });
    expect(row?.smtpPass).toBeTruthy();
    expect(row!.smtpPass).not.toContain('s3cret');
    expect(decryptString(row!.smtpPass)).toBe(VALID_SETTINGS.smtpPass);
    // The mailer now resolves the DB config.
    expect(put.body.mode).toBe('db');
  });

  it('preserves the stored password when the masked placeholder is sent back', async () => {
    await request(app)
      .put('/api/admin/mail-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(VALID_SETTINGS);

    // Re-PUT with the mask (as the UI does) and a changed host.
    const res = await request(app)
      .put('/api/admin/mail-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...VALID_SETTINGS, smtpHost: 'smtp2.test.example', smtpPass: '••••••••••••••••' });
    expect(res.status).toBe(200);

    const row = await appPrisma.mailSettings.findUnique({ where: { id: 'default' } });
    expect(row?.smtpHost).toBe('smtp2.test.example');
    expect(decryptString(row!.smtpPass)).toBe(VALID_SETTINGS.smtpPass);
  });

  it('rejects non-admin users with 403', async () => {
    const token = await staffToken();
    const res = await request(app)
      .put('/api/admin/mail-settings')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_SETTINGS);
    expect(res.status).toBe(403);
  });

  it('fails verification against an unreachable SMTP server with a clean 502', async () => {
    const res = await request(app)
      .post('/api/admin/mail-settings/verify')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...VALID_SETTINGS, smtpHost: '127.0.0.1', smtpPort: 1, to: 'admin@test.com' });
    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/Verification email failed/i);
  });

  it('refuses verification when SMTP is disabled or host is missing', async () => {
    const res = await request(app)
      .post('/api/admin/mail-settings/verify')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...VALID_SETTINGS, enabled: false, to: 'admin@test.com' });
    expect(res.status).toBe(400);
  });
});

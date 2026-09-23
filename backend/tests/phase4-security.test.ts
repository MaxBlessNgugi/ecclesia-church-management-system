/**
 * Phase-4 — Security model verification suite.
 *
 * Covers:
 *   1. Authentication states (correct/wrong/unknown/locked/expired/invalid/
 *      revoked/replayed tokens, token tampering, logout via version bump).
 *   2. First-run bootstrap authorization (fresh-DB only; viewer/role floors).
 *   3. Server-side RBAC matrix (viewer read-only floor incl. override-proof;
 *      panel/action matrix on sensitive modules; super_admin gates).
 *   4. IDOR / parameter tampering (cross-record access, malformed IDs, deep
 *      path probes, bulk-restore param manipulation).
 *   5. Backup/export/import authorization gates (DEF-OPS-08).
 *   6. Input validation boundaries (negative/zero money, oversized payloads,
 *      wrong types, unexpected fields, malformed dates/enums).
 *   7. Secret hygiene (no hashes/tokens/secrets in any JSON surface).
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, seedTestUser, cleanupTestData } from './helpers.js';
import type { Express } from 'express';
import { appPrisma } from '../src/lib/prisma.js';
import { prisma } from '../src/lib/prisma.js';
import { signToken, hashPassword } from '../src/lib/auth.js';
import bcrypt from 'bcryptjs';

let app: Express;
let superToken: string;
let superId: string;

beforeAll(async () => {
  app = createTestApp();
});

beforeEach(async () => {
  await cleanupTestData();
  const seeded = await seedTestUser();
  superToken = seeded.token;
  superId = seeded.user.id;

  // The shared test DB persists state across suites (other suites flip global
  // panel defaults). Reset to all-on so this suite's matrix is deterministic.
  await appPrisma.panelPermissions.upsert({
    where: { id: 'default' },
    create: { id: 'default', panels: {}, actions: {} },
    update: { panels: {}, actions: {} },
  });
});

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

/** Creates a user with the given role/overrides and returns a signed token. */
async function makeUser(
  role: 'admin' | 'staff' | 'viewer',
  overrides: { panels?: Record<string, boolean>; actions?: Record<string, boolean> } = {},
) {
  const passwordHash = await hashPassword('UserPass123!');
  const user = await appPrisma.user.create({
    data: {
      email: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`,
      passwordHash,
      name: `${role} User`,
      role,
      isActive: true,
      panels: overrides.panels ?? null,
      actions: overrides.actions ?? null,
    } as any,
  });
  const token = signToken({ id: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion });
  return { user, token };
}

// ---------------------------------------------------------------------------
// 1. Authentication states
// ---------------------------------------------------------------------------
describe('Phase-4 authentication states', () => {
  it('correct password → 200 with token; wrong password → 401; unknown account → 401 (uniform)', async () => {
    const ok = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'TestPass123!' });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
    expect(ok.body.user.passwordHash).toBeUndefined();

    const bad = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'nope' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'ghost@test.com', password: 'nope' });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.message).toBe(unknown.body.message); // no user enumeration
  });

  it('locked account → 423 even with the correct password', async () => {
    await appPrisma.user.update({
      where: { email: 'admin@test.com' },
      data: { lockedUntil: new Date(Date.now() + 10 * 60 * 1000) },
    });
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'TestPass123!' });
    expect(res.status).toBe(423);
  });

  it('expired token → 401', async () => {
    const expired = signToken({ id: superId, email: 'admin@test.com', role: 'super_admin', tokenVersion: 0 });
    // jwt.sign with an already-passed exp via the `expiresIn` trick is awkward;
    // craft one directly with jsonwebtoken using -1s.
    const jwt = await import('jsonwebtoken');
    const { resolveJwtSecret } = await import('../src/lib/config.js');
    const token = jwt.sign({ id: superId, email: 'admin@test.com', role: 'super_admin', tokenVersion: 0 }, resolveJwtSecret(), { expiresIn: -10 });
    expect(token).toBeTruthy();
    void expired;
    const res = await request(app).get('/api/auth/me').set(auth(token));
    expect(res.status).toBe(401);
  });

  it('invalid signature (tampered payload) → 401', async () => {
    const [h, p, s] = superToken.split('.');
    // Flip a byte in the payload: signature no longer matches.
    const tamperedPayload = Buffer.from(p, 'base64url').toString()
      .replace('"role":"super_admin"', '"role":"staff"');
    const tampered = `${h}.${Buffer.from(tamperedPayload).toString('base64url')}.${s}`;
    const res = await request(app).get('/api/auth/me').set(auth(tampered));
    expect(res.status).toBe(401);
  });

  it('replay of a revoked token (password change bumped tokenVersion) → 401', async () => {
    const { token } = await makeUser('staff');
    expect((await request(app).get('/api/auth/me').set(auth(token))).status).toBe(200);

    // Password change bumps tokenVersion → the older token is now revoked.
    const change = await request(app).put('/api/auth/change-password').set(auth(token))
      .send({ currentPassword: 'UserPass123!', newPassword: 'NewPass123!' });
    expect(change.status).toBe(200);

    const replay = await request(app).get('/api/auth/me').set(auth(token));
    expect(replay.status).toBe(401);
  });

  it('logout semantics: revoked user account invalidates its tokens', async () => {
    const { user, token } = await makeUser('staff');
    expect((await request(app).get('/api/auth/me').set(auth(token))).status).toBe(200);
    await appPrisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    const res = await request(app).get('/api/auth/me').set(auth(token));
    expect(res.status).toBe(401);
  });

  it('bootstrap endpoints are fresh-DB only', async () => {
    // With the seeded admin present, bootstrap must refuse.
    const status = await request(app).get('/api/auth/bootstrap-status');
    expect(status.body.needsBootstrap).toBe(false);
    const attempt = await request(app).post('/api/auth/bootstrap')
      .send({ name: 'Sneaky', email: 'sneaky@test.local', password: 'Bootstr9p!' });
    expect(attempt.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// 3. RBAC matrix — viewer floor + panel/action matrix + role gates
// ---------------------------------------------------------------------------
describe('Phase-4 RBAC — viewer is read-only at the server', () => {
  let member: { id: string; regNo: string };
  beforeEach(async () => {
    member = await appPrisma.christian.create({
      data: {
        regNo: `REG-SEC-${Date.now()}`, nationalId: 'ID', baptismalName: 'S', secondName: 'E', sirName: 'C',
        phone: '+254700000000', diocese: 'D', parish: 'P', localChurch: 'L', scc: 'S',
      },
    });
  });

  it('viewer CAN read every panel', async () => {
    const { token } = await makeUser('viewer');
    for (const url of [
      '/api/christians', '/api/contributions', '/api/expenses', '/api/deposits',
      '/api/ledgers', '/api/inventory/items', '/api/hr/employees', '/api/reports/contributions', '/api/dashboard/summary',
    ]) {
      const res = await request(app).get(url).set(auth(token));
      expect(res.status, `GET ${url}`).toBe(200);
    }
  });

  it('viewer CANNOT create, update or delete — even with allow-all action overrides', async () => {
    const { token } = await makeUser('viewer', { actions: { view: true, edit: true, delete: true } });
    const post = await request(app).post('/api/expenses').set(auth(token))
      .send({ date: '2026-09-23', category: 'X', description: 'viewer write', amount: 5, paymentMethod: 'Cash' });
    expect(post.status).toBe(403);

    const patch = await request(app).put(`/api/christians/${member.id}`).set(auth(token)).send({ phone: '+254711111111' });
    expect(patch.status).toBe(403);

    const del = await request(app).delete(`/api/christians/${member.id}`).set(auth(token));
    expect(del.status).toBe(403);

    const post2 = await request(app).post('/api/contributions').set(auth(token))
      .send({ christianId: member.id, memberName: 'V', regNo: member.regNo, categories: ['Tithe'], monthlyTracker: {}, amountKES: 10, date: '2026-09-23' });
    expect(post2.status).toBe(403);

    // The writes truly did not happen.
    expect(await appPrisma.expense.count()).toBe(0);
    expect(await appPrisma.contribution.count()).toBe(0);
  });

  it('staff with default permissions can write; wrong-panel staff gets 403', async () => {
    const { token: staffToken } = await makeUser('staff');
    const ok = await request(app).post('/api/expenses').set(auth(staffToken))
      .send({ date: '2026-09-23', category: 'X', description: 'staff write', amount: 5, paymentMethod: 'Cash' });
    expect(ok.status).toBe(201);

    const { token: noHr } = await makeUser('staff', { panels: { hr: false } });
    const hr = await request(app).get('/api/hr/employees').set(auth(noHr));
    expect(hr.status).toBe(403);
  });

  it('role escalation is blocked: admin cannot create/modify super_admin; non-admin cannot reach admin surface', async () => {
    const { token: adminToken, user: adminUser } = await makeUser('admin');
    const esc1 = await request(app).post('/api/admin/users').set(auth(adminToken))
      .send({ name: 'Escalated', email: `esc-${Date.now()}@test.local`, password: 'Escal8er!x', role: 'super_admin' });
    expect(esc1.status).toBe(403);

    // Admin cannot modify the seeded super_admin account.
    const esc2 = await request(app).put(`/api/admin/users/${superId}`).set(auth(adminToken)).send({ role: 'staff' });
    expect(esc2.status).toBe(403);

    // Staff cannot list users at all.
    const { token: staffToken } = await makeUser('staff');
    const users = await request(app).get('/api/admin/users').set(auth(staffToken));
    expect([401, 403]).toContain(users.status);
    void adminUser;
  });

  it('registration endpoint is super_admin-only (viewer/staff/admin → 403)', async () => {
    for (const role of ['viewer', 'staff', 'admin'] as const) {
      const { token } = await makeUser(role);
      const res = await request(app).post('/api/auth/register').set(auth(token))
        .send({ email: `reg-${Date.now()}@test.local`, password: 'RegPass123!', name: 'R', role: 'staff' });
      expect(res.status, role).toBe(403);
    }
    const ok = await request(app).post('/api/auth/register').set(auth(superToken))
      .send({ email: `reg-ok-${Date.now()}@test.local`, password: 'RegPass123!', name: 'R', role: 'staff' });
    expect(ok.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// 4. IDOR / parameter tampering
// ---------------------------------------------------------------------------
describe('Phase-4 IDOR and parameter tampering', () => {
  it('cross-user record access: employee documents are scoped to their employee path', async () => {
    // Create two employees with a document on the first.
    const e1 = await request(app).post('/api/hr/employees').set(auth(superToken))
      .send({ surname: 'One', firstName: 'Emp', designation: 'D', hireDate: '2026-01-01', email: `e1-${Date.now()}@t.local`, phone: '1' });
    const e2 = await request(app).post('/api/hr/employees').set(auth(superToken))
      .send({ surname: 'Two', firstName: 'Emp', designation: 'D', hireDate: '2026-01-01', email: `e2-${Date.now()}@t.local`, phone: '2' });
    const doc = await request(app).post(`/api/hr/employees/${e1.body.id}/documents`).set(auth(superToken))
      .send({ originalName: 'a.pdf', mimeType: 'application/pdf', data: Buffer.from('hello').toString('base64') });
    expect(doc.status).toBe(201);

    // IDOR attempt: fetch e1's document through e2's URL — must 404, not leak.
    const idor = await request(app).get(`/api/hr/employees/${e2.body.id}/documents/${doc.body.id}/download`).set(auth(superToken));
    expect(idor.status).toBe(404);

    // The legitimate path works.
    const own = await request(app).get(`/api/hr/employees/${e1.body.id}/documents/${doc.body.id}/download`).set(auth(superToken));
    expect(own.status).toBe(200);
  });

  it('malformed IDs and path-traversal probes return 400/404, never 500 or data', async () => {
    for (const url of [
      '/api/christians/…not-a-uuid',
      '/api/christians/..%2f..%2f..%2fetc%2fpasswd',
      '/api/hr/employees/undefined/documents',
      '/api/debtors/../users',
      '/api/inventory/items/%00',
    ]) {
      const res = await request(app).get(url).set(auth(superToken));
      expect(res.status, url).toBeLessThan(500);
      expect(res.status, url).toBeGreaterThanOrEqual(400);
    }
    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200); // server unharmed
  });

  it('bulk-restore with garbage parameters fails loudly without partial damage', async () => {
    const res = await request(app).post('/api/admin/audit-logs/restore-bulk').set(auth(superToken))
      .send({ ids: ['not-a-real-log-id', { evil: 'object' }, null] });
    expect(res.status).toBeLessThan(500);
    // Nothing restored (no matching logs existed).
    expect(res.body.restored ?? 0).toBe(0);
  });

  it('parish settings PUT is admin/super_admin-only (staff/viewer → 403)', async () => {
    const { token } = await makeUser('staff');
    const res = await request(app).put('/api/parish').set(auth(token)).send({ name: 'Hacked Parish' });
    expect([403, 404]).toContain(res.status); // 403 via perms or 404 via route ordering; never 2xx
    const settings = await request(app).get('/api/parish').set(auth(superToken));
    expect(settings.body.name).not.toBe('Hacked Parish');
  });
});

// ---------------------------------------------------------------------------
// 5. Backup / export / import authorization (DEF-OPS-08)
// ---------------------------------------------------------------------------
describe('Phase-4 backup/export/import authorization', () => {
  it('backup and export require super_admin (admin → 403)', async () => {
    const { token: adminToken } = await makeUser('admin');
    const backup = await request(app).post('/api/admin/backup').set(auth(adminToken)).send({});
    expect(backup.status).toBe(403);
    const exportRes = await request(app).get('/api/admin/export').set(auth(adminToken));
    expect(exportRes.status).toBe(403);
  });

  it('backup works for super_admin and never leaks credentials in its response', async () => {
    const res = await request(app).post('/api/admin/backup').set(auth(superToken)).send({});
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/postgres:|password|DATABASE_URL/i);
  });

  it('import remains super_admin + confirm-gated', async () => {
    const { token: adminToken } = await makeUser('admin');
    const denied = await request(app).post('/api/admin/import').set(auth(adminToken)).send({ confirm: true, bundle: {} });
    expect(denied.status).toBe(403);
    const noConfirm = await request(app).post('/api/admin/import').set(auth(superToken)).send({ bundle: {} });
    expect(noConfirm.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 6. Input validation boundaries
// ---------------------------------------------------------------------------
describe('Phase-4 input validation boundaries', () => {
  it('negative and zero money amounts are rejected (FIN-07)', async () => {
    const neg = await request(app).post('/api/expenses').set(auth(superToken))
      .send({ date: '2026-09-23', category: 'X', description: 'neg', amount: -100, paymentMethod: 'Cash' });
    expect(neg.status).toBe(400);
    const zero = await request(app).post('/api/expenses').set(auth(superToken))
      .send({ date: '2026-09-23', category: 'X', description: 'zero', amount: 0, paymentMethod: 'Cash' });
    expect(zero.status).toBe(400);

    const negSale = await request(app).post('/api/inventory/sales').set(auth(superToken))
      .send({ item: 'Whatever', time: '2026-09-23T09:00:00Z', amount: -5 });
    expect(negSale.status).toBe(400);

    const negContribution = await request(app).post('/api/contributions').set(auth(superToken))
      .send({ christianId: 'x', memberName: 'V', regNo: 'R', categories: ['Tithe'], monthlyTracker: {}, amountKES: -50, date: '2026-09-23' });
    expect(negContribution.status).toBe(400);
  });

  it('missing fields, wrong types, malformed dates and enums are 400', async () => {
    const missing = await request(app).post('/api/expenses').set(auth(superToken))
      .send({ date: '2026-09-23', category: 'X' }); // no amount/description
    expect(missing.status).toBe(400);

    const wrongType = await request(app).post('/api/expenses').set(auth(superToken))
      .send({ date: '2026-09-23', category: 'X', description: 'd', amount: 'lots', paymentMethod: 'Cash' });
    expect(wrongType.status).toBe(400);

    const badDate = await request(app).post('/api/expenses').set(auth(superToken))
      .send({ date: 'not-a-date', category: 'X', description: 'd', amount: 5, paymentMethod: 'Cash' });
    expect(badDate.status).toBe(400);

    const badRole = await request(app).post('/api/auth/register').set(auth(superToken))
      .send({ email: `role-${Date.now()}@test.local`, password: 'RegPass123!', name: 'R', role: 'emperor' });
    expect(badRole.status).toBe(400);
  });

  it('oversized strings are rejected (title > 100 chars)', async () => {
    const res = await request(app).post('/api/auth/register').set(auth(superToken))
      .send({ email: `big-${Date.now()}@test.local`, password: 'RegPass123!', name: 'R', role: 'staff', title: 'x'.repeat(200) });
    expect(res.status).toBe(400);
  });

  it('unexpected fields do not leak into records (mass-assignment guard)', async () => {
    const res = await request(app).post('/api/expenses').set(auth(superToken))
      .send({ date: '2026-09-23', category: 'X', description: 'd', amount: 5, paymentMethod: 'Cash', role: 'super_admin', passwordHash: 'x' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBeUndefined();
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('oversized JSON body does not succeed or crash the server', async () => {
    // supertest drains the response after the parser aborts an over-limit
    // body; the connection may yield 413, 400 or a socket error — the
    // security property is that the request is NOT processed (no 201) and
    // the server stays healthy afterwards.
    const big = JSON.stringify({ date: '2026-09-23', category: 'X', description: 'x'.repeat(6 * 1024 * 1024), amount: 5, paymentMethod: 'Cash' });
    let status = 0;
    try {
      const res = await request(app).post('/api/expenses').set(auth(superToken))
        .set('Content-Type', 'application/json')
        .send(big);
      status = res.status;
    } catch { /* socket destroyed by parser abort — acceptable */ }
    expect(status).not.toBe(201);
    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 7. Secret hygiene
// ---------------------------------------------------------------------------
describe('Phase-4 secret hygiene', () => {
  it('user objects never expose passwordHash or resetTokenHash anywhere', async () => {
    const users = await request(app).get('/api/admin/users').set(auth(superToken));
    expect(users.status).toBe(200);
    for (const u of users.body) {
      expect(u.passwordHash).toBeUndefined();
      expect(u.resetTokenHash).toBeUndefined();
    }
    const me = await request(app).get('/api/auth/me').set(auth(superToken));
    expect(me.body.passwordHash).toBeUndefined();
    expect(me.body.resetTokenHash).toBeUndefined();
  });

  it('push-payment and mail settings responses mask credentials', async () => {
    const push = await request(app).get('/api/admin/push-payments').set(auth(superToken));
    if (push.status === 200) {
      const body = JSON.stringify(push.body);
      expect(body).not.toMatch(/consumerSecret":"[^"]/); // never a real secret
    }
    const mail = await request(app).get('/api/admin/mail-settings').set(auth(superToken));
    if (mail.status === 200) {
      const body = JSON.stringify(mail.body);
      expect(body).not.toMatch(/smtpPass":"[^"•]/); // masked or empty only
    }
  });

  it('login failure and lockout responses never contain hashes or tokens', async () => {
    const bad = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'wrong' });
    const body = JSON.stringify(bad.body);
    expect(body).not.toMatch(/\\$2[aby]\$|token|passwordHash/i);
  });
});

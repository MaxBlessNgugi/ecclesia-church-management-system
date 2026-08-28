/**
 * Permissions Middleware Test Suite — Ecclesia Church Management System
 *
 * Tests the requireModule() middleware which enforces:
 *   1. Panel access  — panel disabled → 403
 *   2. Action rights — action disabled → 403
 *   3. super_admin   — always bypasses all checks → 200
 *   4. Missing auth  — no req.user → 401
 *   5. Default perms — staff with default permissions → 200
 *   6. HTTP method → action mapping (GET→view, POST→edit, DELETE→delete)
 *
 * Tests run against a real PostgreSQL database via the shared test helpers
 * so that the full middleware stack (JWT → requireModule → DB lookup) is
 * exercised end-to-end.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, seedTestUser, cleanupTestData } from './helpers.js';
import type { Express } from 'express';
import { appPrisma } from '../src/lib/prisma.js';
import { signToken } from '../src/lib/auth.js';

let app: Express;
let superAdminToken: string;
let superAdminId: string;

beforeAll(async () => {
  app = createTestApp();
  const seeded = await seedTestUser();
  superAdminToken = seeded.token;
  superAdminId = seeded.user.id;
});

beforeEach(async () => {
  await cleanupTestData();
  const seeded = await seedTestUser();
  superAdminToken = seeded.token;
  superAdminId = seeded.user.id;

  // Ensure global PanelPermissions singleton exists with default (all-on) values.
  await appPrisma.panelPermissions.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      panels: {
        christian: true, activities: true, sacraments: true, finance: true,
        ledgers: true, inventory: true, reports: true, hr: true, administration: true,
      },
      actions: { view: true, edit: true, delete: true },
    },
    update: {
      panels: {
        christian: true, activities: true, sacraments: true, finance: true,
        ledgers: true, inventory: true, reports: true, hr: true, administration: true,
      },
      actions: { view: true, edit: true, delete: true },
    },
  });
});

// Helper: create a non-super_admin user with custom panels/actions and sign a token.
async function createStaffUser(panels: Record<string, boolean>, actions: Record<string, boolean>) {
  const bcrypt = await import('bcryptjs');
  const passwordHash = await bcrypt.hash('TestPass123!', 10);
  const user = await appPrisma.user.create({
    data: {
      email: `staff-${Date.now()}@test.com`,
      passwordHash,
      name: 'Staff User',
      role: 'staff',
      isActive: true,
      panels,
      actions,
    },
  });
  const token = signToken({ id: user.id, email: user.email, role: user.role });
  return { user, token };
}

describe('requireModule — Panel access', () => {
  /**
   * A super_admin must always bypass panel checks and receive data (200 OK).
   * Panel restrictions should never lock out the system administrator.
   */
  it('super_admin bypasses panel restriction and gets 200', async () => {
    // Even if global defaults had HR disabled, super_admin should pass.
    await appPrisma.panelPermissions.update({
      where: { id: 'default' },
      data: { panels: { hr: false } as any },
    });
    const res = await request(app)
      .get('/api/hr/employees')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
  });

  /**
   * A staff user with the 'hr' panel explicitly disabled must receive 403.
   * This verifies the per-user panel override takes effect.
   */
  it('staff user with hr panel disabled gets 403', async () => {
    const { token } = await createStaffUser(
      { christian: true, activities: true, sacraments: true, finance: true,
        ledgers: true, inventory: true, reports: true, hr: false, administration: true },
      { view: true, edit: true, delete: true },
    );
    const res = await request(app)
      .get('/api/hr/employees')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/access to this module/i);
  });

  /**
   * A staff user with all panels enabled must be allowed through (200).
   * Confirms the default-allow behaviour works correctly.
   */
  it('staff user with hr panel enabled gets 200', async () => {
    const { token } = await createStaffUser(
      { christian: true, activities: true, sacraments: true, finance: true,
        ledgers: true, inventory: true, reports: true, hr: true, administration: true },
      { view: true, edit: true, delete: true },
    );
    const res = await request(app)
      .get('/api/hr/employees')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('requireModule — Action rights', () => {
  /**
   * A user with 'edit' action disabled must receive 403 when POSTing
   * to a protected endpoint (POST → 'edit' action).
   */
  it('user with edit action disabled gets 403 on POST', async () => {
    const { token } = await createStaffUser(
      { christian: true, activities: true, sacraments: true, finance: true,
        ledgers: true, inventory: true, reports: true, hr: true, administration: true },
      { view: true, edit: false, delete: true },  // edit disabled
    );
    const res = await request(app)
      .post('/api/christians')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nationalId: '12345678', baptismalName: 'John', secondName: 'Doe',
        sirName: 'Smith', phone: '0712345678', diocese: 'Nairobi',
        parish: 'St. Mary', localChurch: 'Main', scc: 'Alpha',
      });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/permission to edit/i);
  });

  /**
   * A user with 'delete' action disabled must receive 403 when sending
   * a DELETE request to a protected endpoint (DELETE → 'delete' action).
   */
  it('user with delete action disabled gets 403 on DELETE', async () => {
    const { token } = await createStaffUser(
      { christian: true, activities: true, sacraments: true, finance: true,
        ledgers: true, inventory: true, reports: true, hr: true, administration: true },
      { view: true, edit: true, delete: false },  // delete disabled
    );
    // Use a non-existent ID — the perms check happens before the DB lookup.
    const res = await request(app)
      .delete('/api/christians/non-existent-id')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/permission to delete/i);
  });

  /**
   * A user with 'view' action disabled must receive 403 on GET requests.
   * (GET → 'view' action).
   */
  it('user with view action disabled gets 403 on GET', async () => {
    const { token } = await createStaffUser(
      { christian: true, activities: true, sacraments: true, finance: true,
        ledgers: true, inventory: true, reports: true, hr: true, administration: true },
      { view: false, edit: true, delete: true },  // view disabled
    );
    const res = await request(app)
      .get('/api/christians')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/permission to view/i);
  });

  /**
   * A user with all actions enabled must not be blocked (200 on GET).
   */
  it('user with all actions enabled gets 200 on GET', async () => {
    const { token } = await createStaffUser(
      { christian: true, activities: true, sacraments: true, finance: true,
        ledgers: true, inventory: true, reports: true, hr: true, administration: true },
      { view: true, edit: true, delete: true },
    );
    const res = await request(app)
      .get('/api/christians')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('requireModule — Missing authentication', () => {
  /**
   * A request without an Authorization header must be rejected with 401
   * before the module permission check is even evaluated.
   */
  it('request with no Authorization header gets 401', async () => {
    const res = await request(app).get('/api/christians');
    expect(res.status).toBe(401);
  });

  /**
   * A request with a malformed Bearer token must be rejected with 401.
   */
  it('request with invalid token gets 401', async () => {
    const res = await request(app)
      .get('/api/christians')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});

describe('requireModule — Global defaults fallback', () => {
  /**
   * When a user has no personal panels/actions overrides (null columns),
   * the global PanelPermissions defaults should be used.
   * Here we set global hr=false and verify the user is blocked.
   */
  it('user with no overrides inherits global panel default (hr=false → 403)', async () => {
    // Set global default hr=false.
    await appPrisma.panelPermissions.update({
      where: { id: 'default' },
      data: {
        panels: {
          christian: true, activities: true, sacraments: true, finance: true,
          ledgers: true, inventory: true, reports: true, hr: false, administration: true,
        } as any,
      },
    });

    // Create a user with no personal overrides (panels/actions = null).
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await appPrisma.user.create({
      data: {
        email: `nooverride-${Date.now()}@test.com`,
        passwordHash,
        name: 'No Override User',
        role: 'staff',
        isActive: true,
        // panels and actions deliberately omitted (null)
      },
    });
    const token = signToken({ id: user.id, email: user.email, role: user.role });

    const res = await request(app)
      .get('/api/hr/employees')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

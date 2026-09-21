/**
 * ECCLESIA CHMS — Negative authorization tests (E2E acceptance)
 *
 * Restricted-account battery run against the REAL deployment:
 *   1. Unauthenticated requests are rejected with 401 (no token).
 *   2. The `viewer` role is rejected on administration routes (403) —
 *      /api/admin/* is gated by requireAuth + requireAdmin + requireModule —
 *      and cannot register users (super_admin only).
 *
 * Accounts come from backend/scripts/seed-e2e.ts (viewer@ecclesia.local /
 * Viewer123!), the same accounts the CI e2e job seeds.
 */
import { test, expect } from '../console-capture';
import { APIRequestContext, request as pwRequest } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5000';

const VIEWER = {
  email: process.env.E2E_VIEWER_EMAIL || 'viewer@ecclesia.local',
  password: process.env.E2E_VIEWER_PASSWORD || 'Viewer123!',
} as const;

let api: APIRequestContext;
let viewerToken = '';

test.beforeAll(async () => {
  api = await pwRequest.newContext({ baseURL: BASE_URL });
  const res = await api.post('/api/auth/login', { data: VIEWER });
  expect(res.status(), 'viewer account can log in').toBe(200);
  viewerToken = (await res.json()).token;
});

test.afterAll(async () => {
  await api.dispose();
});

test.describe('unauthenticated requests are rejected (401)', () => {
  // One probe per middleware surface: requireAuth alone (christians),
  // requireModule('finance') (expenses), requireAdmin+Module (admin).
  const endpoints: Array<[string, string]> = [
    ['GET', '/api/christians'],
    ['POST', '/api/expenses'],
    ['GET', '/api/admin/users'],
  ];
  for (const [method, path] of endpoints) {
    test(`${method} ${path} without token → 401`, async () => {
      // requireAuth runs before body validation, so no payload is needed.
      expect((await api.fetch(path, { method })).status()).toBe(401);
    });
  }
});

test.describe('viewer role is excluded from administration (403)', () => {
  // Lazily built: viewerToken is empty at collection time, set in beforeAll.
  const asViewer = () => ({ headers: { Authorization: `Bearer ${viewerToken}` } });

  test('viewer cannot list users', async () => {
    expect((await api.get('/api/admin/users', asViewer())).status()).toBe(403);
  });

  test('viewer cannot register users (super_admin only)', async () => {
    const res = await api.post('/api/auth/register', {
      ...asViewer(),
      data: { email: 'injected@ecclesia.local', password: 'Evil#Pass123', name: 'Injected', role: 'super_admin' },
    });
    expect(res.status()).toBe(403);
  });

  test('viewer cannot change user permissions', async () => {
    const res = await api.put('/api/admin/users/00000000-0000-0000-0000-0000000000ff/permissions', {
      ...asViewer(),
      data: { panels: { christian: false } },
    });
    expect(res.status()).toBe(403);
  });
});

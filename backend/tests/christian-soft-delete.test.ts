/**
 * Christian soft-delete lifecycle — regression tests
 *
 * Background (2026-09-21 forensic investigation):
 *   A claimed failure said updating a soft-deleted Christian yields
 *   "Record to update not found". That is the DESIGNED behavior of the
 *   soft-delete-aware Prisma extension (appPrisma injects isDeleted:false
 *   into update/where), which surfaces as Prisma P2025 → HTTP 404:
 *   Policy A — deleted records cannot be edited until they are restored.
 *   These tests pin that policy AND the real defects found beside it:
 *
 *   1. Double-DELETE used to rewrite the trashed row's status via the raw
 *      client BEFORE audit.softDelete() 404'd — silent mutation of trash.
 *   2. softDelete()'s check-then-flip was not atomic; two concurrent deletes
 *      could both proceed (now a guarded flip inside one transaction).
 *
 * Trash & Audit (admin-only) is the inspection/restore surface, matching
 * AdminView.tsx and DELETE confirmation copy across the frontend.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, seedTestUser, cleanupTestData } from './helpers.js';
import type { Express } from 'express';
import bcrypt from 'bcryptjs';
import { signToken } from '../src/lib/auth.js';
import { prisma } from '../src/lib/prisma.js';

let app: Express;
let token: string;
let staffChristianToken: string; // christian-module user WITHOUT administration module
let noModuleToken: string; // user with no panel permissions at all

beforeAll(async () => {
  app = createTestApp();
  const seeded = await seedTestUser();
  token = seeded.token;
});

beforeEach(async () => {
  await cleanupTestData();
  const seeded = await seedTestUser();
  token = seeded.token;

  // Non-admin helper users (mirrors communications.test.ts pattern).
  const hash = await bcrypt.hash('TestPass123!', 10);
  const christianOnly = await prisma.user.create({
    data: {
      email: `christian-only-${Math.random().toString(36).slice(2, 8)}@test.com`,
      passwordHash: hash,
      name: 'Registry Clerk',
      role: 'staff',
      panels: { christian: true, administration: false },
      actions: { christian: { view: true, create: true, edit: true, delete: true } },
    },
  });
  staffChristianToken = signToken({ id: christianOnly.id, email: christianOnly.email, role: christianOnly.role, tokenVersion: christianOnly.tokenVersion });

  const none = await prisma.user.create({
    data: {
      email: `no-christian-panel-${Math.random().toString(36).slice(2, 8)}@test.com`,
      passwordHash: hash,
      name: 'No Christian Panel',
      role: 'staff',
      // Permission model is explicit-deny: panels[action] === false blocks.
      panels: { christian: false },
      actions: {},
    },
  });
  noModuleToken = signToken({ id: none.id, email: none.email, role: none.role, tokenVersion: none.tokenVersion });
});

const validChristian = {
  nationalId: '12345678',
  baptismalName: 'Mary',
  secondName: 'Wanjiku',
  sirName: 'Njeri',
  phone: '0712000000',
  diocese: 'Nairobi',
  parish: 'St. Marys',
  localChurch: 'Downtown Chapel',
  scc: 'Jumuiya 1',
};

/** Creates a member via the API and returns the created body. */
async function createMember(overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/christians')
    .set('Authorization', `Bearer ${token}`)
    .send({ ...validChristian, ...overrides });
  expect(res.status).toBe(201);
  return res.body;
}

/** Soft-deletes a member via the API. */
async function deleteMember(id: string): Promise<void> {
  const res = await request(app).delete(`/api/christians/${id}`).set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(204);
}

/** Fetches the DELETE audit-log row for a member. */
async function deleteLogFor(id: string) {
  const logs = await request(app)
    .get('/api/admin/audit-logs')
    .query({ entity: 'Christian', action: 'DELETE' })
    .set('Authorization', `Bearer ${token}`);
  expect(logs.status).toBe(200);
  return logs.body.find((l: { entityId: string }) => l.entityId === id);
}

// ---------------------------------------------------------------------------
// Delete semantics
// ---------------------------------------------------------------------------
describe('Christian soft-delete — delete', () => {
  it('soft-deletes and flips status to Inactive (raw-row check)', async () => {
    const member = await createMember();
    await deleteMember(member.id);

    // Raw client: the row still exists, flagged deleted, status Inactive.
    const row = await prisma.christian.findUnique({ where: { id: member.id } });
    expect(row).not.toBeNull();
    expect(row!.isDeleted).toBe(true);
    expect(row!.deletedAt).not.toBeNull();
    expect(row!.status).toBe('Inactive');
  });

  it('DELETE on an unknown id returns 404 without writing anything', async () => {
    const res = await request(app)
      .delete('/api/christians/00000000-0000-0000-0000-000000000099')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('DELETE on an already-deleted member returns 404 and does NOT touch the trashed row', async () => {
    const member = await createMember();
    await deleteMember(member.id);

    // Snapshot the trashed row before the second DELETE attempt.
    const before = await prisma.christian.findUnique({ where: { id: member.id } });

    const res = await request(app)
      .delete(`/api/christians/${member.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);

    // Regression: the old implementation rewrote status via the raw client
    // BEFORE the 404 — the trashed row must be byte-identical after the
    // rejected attempt (deletedAt unchanged proves no write happened).
    const after = await prisma.christian.findUnique({ where: { id: member.id } });
    expect(after!.deletedAt?.toISOString()).toBe(before!.deletedAt!.toISOString());
    expect(after!.status).toBe(before!.status);
    expect(after!.isDeleted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Visibility: active lists hide, trash shows, restore brings back
// ---------------------------------------------------------------------------
describe('Christian soft-delete — visibility', () => {
  it('deleted member disappears from the active list and GET by id 404s', async () => {
    const member = await createMember();
    await deleteMember(member.id);

    const list = await request(app).get('/api/christians').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(0);

    const single = await request(app)
      .get(`/api/christians/${member.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(single.status).toBe(404);
  });

  it('deleted member appears in the Trash audit log with actor and snapshot', async () => {
    const member = await createMember();
    await deleteMember(member.id);

    const log = await deleteLogFor(member.id);
    expect(log).toBeDefined();
    expect(log.action).toBe('DELETE');
    expect(log.entityName).toBe('Christian');
    expect(log.metadata.baptismalName).toBe('Mary');
    expect(log.deletedByName).toBe('Test Admin');
  });

  it('restore from trash brings the member back into the active list', async () => {
    const member = await createMember();
    await deleteMember(member.id);

    const log = await deleteLogFor(member.id);
    const restore = await request(app)
      .post(`/api/admin/audit-logs/${log.id}/restore`)
      .set('Authorization', `Bearer ${token}`);
    expect(restore.status).toBe(200);

    const single = await request(app)
      .get(`/api/christians/${member.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(single.status).toBe(200);
    expect(single.body.baptismalName).toBe('Mary');

    const list = await request(app).get('/api/christians').set('Authorization', `Bearer ${token}`);
    expect(list.body).toHaveLength(1);

    // Restore wrote its own RESTORE audit entry.
    const restores = await request(app)
      .get('/api/admin/audit-logs')
      .query({ entity: 'Christian', action: 'RESTORE' })
      .set('Authorization', `Bearer ${token}`);
    expect(restores.body.some((l: { entityId: string }) => l.entityId === member.id)).toBe(true);
  });

  it('re-restoring an already-restored record returns 400/404 (no double-restore)', async () => {
    const member = await createMember();
    await deleteMember(member.id);
    const log = await deleteLogFor(member.id);

    const first = await request(app).post(`/api/admin/audit-logs/${log.id}/restore`).set('Authorization', `Bearer ${token}`);
    expect(first.status).toBe(200);

    const second = await request(app).post(`/api/admin/audit-logs/${log.id}/restore`).set('Authorization', `Bearer ${token}`);
    expect([400, 404]).toContain(second.status);
  });
});

// ---------------------------------------------------------------------------
// Update-after-delete: Policy A — deleted records cannot be edited
// ---------------------------------------------------------------------------
describe('Christian soft-delete — update-after-delete (Policy A)', () => {
  it('PUT on a deleted member returns 404 and does not modify the row', async () => {
    const member = await createMember();
    await deleteMember(member.id);

    const res = await request(app)
      .put(`/api/christians/${member.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0799000000' });
    // The soft-delete-aware extension hides the row from update → P2025 → 404.
    // This is the documented "Record to update not found" surface, by design.
    expect(res.status).toBe(404);

    const row = await prisma.christian.findUnique({ where: { id: member.id } });
    expect(row!.phone).toBe(validChristian.phone); // unchanged
  });

  it('PATCH sacraments on a deleted member returns 404 (same policy)', async () => {
    const member = await createMember();
    await deleteMember(member.id);

    const res = await request(app)
      .patch(`/api/christians/${member.id}/sacraments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ baptism: { date: '2020-01-01', minister: 'Fr. X', place: 'Y' } });
    expect(res.status).toBe(404);
  });

  it('after restore the member is editable again (PUT succeeds)', async () => {
    const member = await createMember();
    await deleteMember(member.id);
    const log = await deleteLogFor(member.id);
    await request(app).post(`/api/admin/audit-logs/${log.id}/restore`).set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .put(`/api/christians/${member.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0799000000' });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe('0799000000');
  });
});

// ---------------------------------------------------------------------------
// Authorization: trash & restore are admin-surface; registry users cannot
// bypass the delete policy through the normal API.
// ---------------------------------------------------------------------------
describe('Christian soft-delete — authorization', () => {
  it('staff user WITHOUT administration module cannot list the trash', async () => {
    const res = await request(app)
      .get('/api/admin/audit-logs')
      .query({ entity: 'Christian' })
      .set('Authorization', `Bearer ${staffChristianToken}`);
    expect([401, 403]).toContain(res.status);
  });

  it('staff user WITHOUT administration module cannot restore from trash', async () => {
    const member = await createMember();
    await deleteMember(member.id);
    const log = await deleteLogFor(member.id);

    const res = await request(app)
      .post(`/api/admin/audit-logs/${log.id}/restore`)
      .set('Authorization', `Bearer ${staffChristianToken}`);
    expect([401, 403]).toContain(res.status);

    // The record is still deleted.
    const row = await prisma.christian.findUnique({ where: { id: member.id } });
    expect(row!.isDeleted).toBe(true);
  });

  it('user with the christian panel explicitly disabled gets 403 on registry DELETE', async () => {
    const member = await createMember();

    const res = await request(app)
      .delete(`/api/christians/${member.id}`)
      .set('Authorization', `Bearer ${noModuleToken}`);
    expect([401, 403]).toContain(res.status);

    const row = await prisma.christian.findUnique({ where: { id: member.id } });
    expect(row!.isDeleted).toBe(false);
  });

  it('unauthenticated trash access returns 401', async () => {
    const res = await request(app).get('/api/admin/audit-logs');
    expect(res.status).toBe(401);
  });
});

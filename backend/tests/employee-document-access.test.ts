import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { appPrisma } from '../src/lib/prisma.js';
import { signToken } from '../src/lib/auth.js';
import { createTestApp, cleanupTestData, seedTestUser } from './helpers.js';

describe('HR employee document access', () => {
  let app: Express;
  let employeeId: string;
  let documentId: string;
  let documentPath: string;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(async () => {
    await cleanupTestData();
    await seedTestUser();
    const employee = await appPrisma.employee.create({
      data: {
        code: 'EMP-0001',
        name: 'Test Employee',
        role: 'Administrator',
        phone: '0700000000',
        email: 'employee@test.com',
        hireDate: new Date('2026-01-01'),
      },
    });
    const document = await appPrisma.employeeDocument.create({
      data: {
        employeeId: employee.id,
        originalName: 'cv.pdf',
        storedName: 'stored-cv.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 4,
        storagePath: documentPath = 'missing-test-file.pdf',
      },
    });
    employeeId = employee.id;
    documentId = document.id;
  });

  it('rejects a user whose HR view permission is disabled', async () => {
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await appPrisma.user.create({
      data: {
        email: 'viewer@test.com',
        passwordHash,
        name: 'HR Viewer',
        role: 'staff',
        isActive: true,
        panels: { hr: true },
        actions: { view: false, edit: true, delete: true },
      },
    });
    const token = signToken({ id: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion });

    const response = await request(app)
      .get(`/api/hr/employees/${employeeId}/documents/${documentId}/download`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/permission to view/i);
    expect(documentPath).toBe('missing-test-file.pdf');
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createTestApp, seedTestUser } from './helpers.js';
import { hashPassword, verifyPassword, signToken, verifyToken, generateResetToken, hashResetToken } from '../src/lib/auth.js';
import { toCsv, exportAllData } from '../src/lib/export.js';
import type { Express } from 'express';

let app: Express;

beforeAll(async () => {
  app = createTestApp();
  await seedTestUser();
});

describe('Auth utilities', () => {
  it('hashPassword produces bcrypt hash', async () => {
    const hash = await hashPassword('mypassword');
    expect(hash).toMatch(/^\$2[aby]?\$\d{2}\$/);
  });

  it('verifyPassword returns true for correct password', async () => {
    const hash = await hashPassword('secret123');
    expect(await verifyPassword('secret123', hash)).toBe(true);
  });

  it('verifyPassword returns false for wrong password', async () => {
    const hash = await hashPassword('secret123');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('signToken produces a JWT string', () => {
    const token = signToken({ id: '123', email: 'test@test.com', role: 'staff' });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('verifyToken decodes a signed token', () => {
    const payload = { id: '123', email: 'test@test.com', role: 'admin' };
    const token = signToken(payload);
    const decoded = verifyToken(token);
    expect(decoded.id).toBe('123');
    expect(decoded.email).toBe('test@test.com');
    expect(decoded.role).toBe('admin');
  });

  it('verifyToken throws on invalid token', () => {
    expect(() => verifyToken('invalid.token.here')).toThrow();
  });

  it('generateResetToken returns a string', () => {
    const token = generateResetToken();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('hashResetToken returns SHA-256 hex', () => {
    const hash = hashResetToken('mytoken');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('Export utility', () => {
  it('toCsv handles empty array', () => {
    expect(toCsv([])).toBe('');
  });

  it('toCsv handles simple objects', () => {
    const csv = toCsv([{ name: 'John', age: 30 }, { name: 'Jane', age: 25 }]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('name,age');
    expect(lines[1]).toBe('John,30');
    expect(lines[2]).toBe('Jane,25');
  });

  it('toCsv escapes commas in values', () => {
    const csv = toCsv([{ note: 'hello, world' }]);
    expect(csv).toContain('"hello, world"');
  });

  it('toCsv escapes quotes in values', () => {
    const csv = toCsv([{ note: 'say "hi"' }]);
    expect(csv).toContain('"say ""hi"""');
  });
});

describe('Export all data', () => {
  it('exportAllData returns a valid bundle', async () => {
    const bundle = await exportAllData();
    expect(bundle.exportedAt).toBeDefined();
    expect(bundle.tables).toBeDefined();
    expect(typeof bundle.tables).toBe('object');
  });
});

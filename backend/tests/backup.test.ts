/**
 * Backup engine regression tests — Ecclesia Church Management System
 *
 * Forensic context (2026-09-21 investigation):
 *   Two production bugs were proven by live drill:
 *     1. parsePgUrl split the URL on "/" so Prisma's "?schema=public" suffix
 *        leaked into the database name — pg_dump failed with
 *        `invalid connection option "ecclesia?schema"` on the exact URL
 *        format the repo's own .env.example ships. Every backup failed.
 *     2. restore.ts passed pg_dump-only flags (--no-owner --no-privileges)
 *        to psql, which exits with "illegal option" — no restore could ever
 *        succeed. A backup that cannot be restored is not a backup.
 *
 * These tests lock in the corrected behavior. The live-drill block runs only
 * when a real PostgreSQL (pg_dump/psql on PATH) is reachable — it is the
 * automated restore drill the pre-release audit asked for.
 *
 * Environment variables:
 *   BACKUP_TEST_URL — PostgreSQL URL for the live drill
 *                     (defaults to the DATABASE_URL set by tests/setup.ts).
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { parsePgUrl, buildPsqlRestoreArgs, backupDatabase, backupDirPath } from '../src/lib/backup.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Environment probe (top-level, so skip decisions are made before collection).
// ---------------------------------------------------------------------------
async function probeHost(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host, port }, () => {
      sock.end();
      resolve(true);
    });
    sock.setTimeout(2000);
    sock.once('error', () => resolve(false));
    sock.once('timeout', () => {
      sock.destroy();
      resolve(false);
    });
  });
}

async function pgToolOnPath(tool: string): Promise<boolean> {
  try {
    await execFileAsync(tool, ['--version']);
    return true;
  } catch {
    return false;
  }
}

const drillUrl = process.env.BACKUP_TEST_URL || process.env.DATABASE_URL || '';
const pgParsed = (() => {
  try {
    return drillUrl ? parsePgUrl(drillUrl) : null;
  } catch {
    return null;
  }
})();

const hostReachable = pgParsed
  ? await probeHost(pgParsed.host, Number(pgParsed.port))
  : false;
const hasPgTools = (await pgToolOnPath('psql')) && (await pgToolOnPath('pg_dump'));

/** Live-drill tests run only against a real, reachable PostgreSQL with client tools. */
const describeDb = pgParsed && hostReachable && hasPgTools ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Helpers: throwaway backup dir per test, always cleaned up.
// ---------------------------------------------------------------------------
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecclesia-backup-test-'));
  process.env.BACKUP_DIR = tmpDir;
});

afterAll(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. parsePgUrl — root cause of every failed backup
// ---------------------------------------------------------------------------
describe('parsePgUrl', () => {
  it('strips the Prisma ?schema=public suffix from the database name', () => {
    const pg = parsePgUrl('postgresql://postgres:ecclesia@localhost:5432/ecclesia?schema=public');
    expect(pg.database).toBe('ecclesia');
    expect(pg.database).not.toContain('?');
    expect(pg.host).toBe('localhost');
    expect(pg.port).toBe('5432');
    expect(pg.user).toBe('postgres');
    expect(pg.password).toBe('ecclesia');
  });

  it('parses a plain postgres:// URL without a query string', () => {
    const pg = parsePgUrl('postgres://bob:s3cret@db.internal:6543/church');
    expect(pg).toEqual({
      host: 'db.internal',
      port: '6543',
      database: 'church',
      user: 'bob',
      password: 's3cret',
    });
  });

  it('decodes percent-encoded credentials', () => {
    const pg = parsePgUrl('postgresql://user:p%40ss%3Aw0rd@localhost:5432/dbname');
    expect(pg.user).toBe('user');
    expect(pg.password).toBe('p@ss:w0rd');
  });

  it('applies defaults for missing port and user', () => {
    const pg = parsePgUrl('postgresql://localhost/ecclesia');
    expect(pg.port).toBe('5432');
    expect(pg.user).toBe('postgres');
    expect(pg.password).toBe('');
  });

  it('rejects a non-postgres URL scheme instead of mangling it', () => {
    expect(() => parsePgUrl('mysql://root@localhost/db')).toThrow(/expected a postgresql/);
  });

  it('rejects garbage without leaking a raw URL syntax error', () => {
    expect(() => parsePgUrl('not-a-url')).toThrow(/Invalid DATABASE_URL/);
  });

  it('never exposes the password in thrown error messages', () => {
    try {
      parsePgUrl('postgresql://alice:super-secret@no-such-host.invalid/db');
      expect.unreachable('should have thrown');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).not.toContain('super-secret');
    }
  });
});

// ---------------------------------------------------------------------------
// 2. buildPsqlRestoreArgs — root cause of every failed restore
// ---------------------------------------------------------------------------
describe('buildPsqlRestoreArgs', () => {
  it('never passes pg_dump-only flags to psql', () => {
    const args = buildPsqlRestoreArgs(
      { host: 'h', port: '5432', database: 'd', user: 'u', password: '' },
      '/tmp/dump.sql',
    );
    expect(args).not.toContain('--no-owner');
    expect(args).not.toContain('--no-privileges');
  });

  it('targets the parsed host/port/user/database and dump file', () => {
    const args = buildPsqlRestoreArgs(
      { host: 'dbhost', port: '6543', database: 'church', user: 'admin', password: 'x' },
      '/tmp/dump.sql',
    );
    expect(args).toEqual([
      '-w', '-h', 'dbhost', '-p', '6543', '-U', 'admin', '-d', 'church',
      '-v', 'ON_ERROR_STOP=1', '-f', '/tmp/dump.sql',
    ]);
  });

  it('includes ON_ERROR_STOP so a failed restore aborts loudly', () => {
    const args = buildPsqlRestoreArgs(
      { host: 'h', port: '5432', database: 'd', user: 'u', password: '' },
      '/tmp/dump.sql',
    );
    expect(args).toContain('ON_ERROR_STOP=1');
  });
});

// ---------------------------------------------------------------------------
// 3. Live drill — real pg_dump/psql round-trip against reachable PostgreSQL
// ---------------------------------------------------------------------------
describeDb('backupDatabase (live PostgreSQL drill)', () => {
  /** Filename sorting before today's timestamps, so pruning removes these first. */
  function seedFakeBackups(count: number): void {
    for (let i = 0; i < count; i++) {
      const name = `ecclesia-backup-2020-01-01T00-00-${String(i).padStart(2, '0')}-000Z.sql`;
      fs.writeFileSync(path.join(backupDirPath(), name), '-- fake old snapshot\n');
    }
  }

  function sqlFileCount(): number {
    return fs.readdirSync(backupDirPath()).filter((f) => f.endsWith('.sql')).length;
  }

  function pgsqlEnv(password: string): NodeJS.ProcessEnv {
    return { ...process.env, PGPASSWORD: password };
  }

  it('creates a non-empty SQL dump via the production code path', async () => {
    const info = await backupDatabase();
    expect(fs.existsSync(info.file)).toBe(true);
    expect(info.size).toBeGreaterThan(0);
    const head = fs.readFileSync(info.file, 'utf8').slice(0, 400);
    expect(head).toMatch(/PostgreSQL database dump/i);
  });

  it('prunes old backups down to the retention limit (BACKUP_KEEP=14)', async () => {
    // BACKUP_KEEP is read once at module load (default 14); seeding 20 old
    // fake snapshots proves rotation runs on every backup without depending
    // on env mutations the module constant cannot see.
    seedFakeBackups(20);
    const info = await backupDatabase();
    expect(sqlFileCount()).toBe(14);
    // The oldest fakes must be gone; the fresh dump must survive.
    expect(fs.existsSync(path.join(backupDirPath(), 'ecclesia-backup-2020-01-01T00-00-00-000Z.sql'))).toBe(false);
    expect(fs.existsSync(info.file)).toBe(true);
  });

  it('restores a real dump into a scratch database with identical row counts', async () => {
    const base = pgParsed!;
    const drillDb = 'ecclesia_drill_test';

    // 1. Create a clean scratch database.
    await execFileAsync(
      'psql',
      ['-w', '-h', base.host, '-p', base.port, '-U', base.user, '-d', 'postgres',
       '-c', `DROP DATABASE IF EXISTS ${drillDb}`, '-c', `CREATE DATABASE ${drillDb}`],
      { env: pgsqlEnv(base.password) },
    );

    try {
      // 2. Dump the test database through the production code path.
      const info = await backupDatabase();
      expect(info.size).toBeGreaterThan(0);

      // 3. Restore it with exactly the flags the production restore path uses.
      const target = parsePgUrl(`postgresql://${encodeURIComponent(base.user)}:${encodeURIComponent(base.password)}@${base.host}:${base.port}/${drillDb}`);
      await execFileAsync('psql', buildPsqlRestoreArgs(target, info.file), { env: pgsqlEnv(target.password) });

      // 4. Compare exact row counts on every table: source vs restored.
      const tables = (await execFileAsync(
        'psql',
        ['-w', '-h', base.host, '-p', base.port, '-U', base.user, '-d', base.database,
         '-tAc', "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"],
        { env: pgsqlEnv(base.password) },
      )).stdout.split('\n').map((s) => s.trim()).filter(Boolean);

      expect(tables.length).toBeGreaterThan(0);
      for (const t of tables) {
        const src = await execFileAsync(
          'psql',
          ['-w', '-h', base.host, '-p', base.port, '-U', base.user, '-d', base.database, '-tAc', `SELECT count(*) FROM "${t}"`],
          { env: pgsqlEnv(base.password) },
        );
        const dst = await execFileAsync(
          'psql',
          ['-w', '-h', target.host, '-p', target.port, '-U', target.user, '-d', target.database, '-tAc', `SELECT count(*) FROM "${t}"`],
          { env: pgsqlEnv(target.password) },
        );
        expect(Number(dst.stdout.trim()), `table ${t} row count after restore`).toBe(Number(src.stdout.trim()));
      }
    } finally {
      await execFileAsync(
        'psql',
        ['-w', '-h', base.host, '-p', base.port, '-U', base.user, '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${drillDb}`],
        { env: pgsqlEnv(base.password) },
      ).catch(() => undefined);
    }
  }, 120000);
});

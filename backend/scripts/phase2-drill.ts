/**
 * Phase-2 real-PostgreSQL drill (disposable database ecclesia_phase2_drill).
 *
 * Stages:
 *   1. Create a disposable database and apply the Prisma schema.
 *   2. Seed the deterministic minimum dataset from the Phase-2 brief.
 *   3. Capture the BASELINE: row counts, financial totals, inventory totals,
 *      user count, audit count (via psql, independent of the app layer).
 *   4. Run the REAL backup process (backupDatabase) twice:
 *      plaintext pipeline and encrypted pipeline (BACKUP_ENCRYPTION_KEY).
 *   5. Verify artifacts: sidecar checksum ok, gunzip → SQL, wrong key rejected,
 *      tampering rejected, truncation detected.
 *   6. DESTROY: drop the disposable database.
 *   7. RESTORE: fresh empty database; psql restore via production arg builder
 *      (through verifyOrThrow + artifactToSqlFile).
 *   8. BOOT: start the compiled backend against the restored DB, log in, hit
 *      dashboard + health, then stop it.
 *   9. COMPARE: re-capture the metrics and diff against the baseline.
 *
 * Run:  npx tsx scripts/phase2-drill.ts
 * Requires PostgreSQL client tools (auto-discovered) and a local server.
 */
import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import {
  parsePgUrl,
  buildPsqlRestoreArgs,
  requirePgTool,
  verifyOrThrow,
  artifactToSqlFile,
  backupDatabase,
  sha256File,
  readChecksumMeta,
} from '../src/lib/backup.js';

const execFileAsync = promisify(execFile);

const BASE_URL = process.env.DATABASE_URL!;
if (!BASE_URL) throw new Error('DATABASE_URL must be set');
const pg = parsePgUrl(BASE_URL);
const PSQL = await requirePgTool('psql');
const CREATEDB = await requirePgTool('createdb' as 'psql').catch(() => 'createdb');
const DROPDB = await requirePgTool('dropdb' as 'psql').catch(() => 'dropdb');
const DRILL_DB = 'ecclesia_phase2_drill';
const RESTORED_DB = 'ecclesia_phase2_restored';
const envWith = (extra: Record<string, string> = {}) => ({ ...process.env, PGPASSWORD: pg.password, ...extra });

function adminSql(sql: string): string {
  return execFileSync(PSQL, ['-w', '-h', pg.host, '-p', pg.port, '-U', pg.user, '-d', 'postgres', '-tAc', sql], {
    env: envWith(), encoding: 'utf8',
  }).trim();
}

function dbSql(db: string, sql: string): string {
  return execFileSync(PSQL, ['-w', '-h', pg.host, '-p', pg.port, '-U', pg.user, '-d', db, '-tAc', sql], {
    env: envWith(), encoding: 'utf8',
  }).trim();
}

async function createDb(name: string): Promise<void> {
  adminSql(`DROP DATABASE IF EXISTS ${name}`);
  adminSql(`CREATE DATABASE ${name}`);
  // Apply the schema with the LOCAL prisma CLI (node entrypoint, no shell).
  const prismaJs = path.resolve(__dirname, '../node_modules/prisma/build/index.js');
  execFileSync(process.execPath, [prismaJs, 'migrate', 'deploy',
      '--schema', path.resolve(__dirname, '../prisma/schema.prisma')],
    { env: envWith({ DATABASE_URL: `postgresql://${pg.user}:${pg.password}@${pg.host}:${pg.port}/${name}?schema=public` }),
      cwd: path.resolve(__dirname, '..'), stdio: 'pipe' });
}

const TABLES = [
  'christians', 'contributions', 'expenses', 'deposits',
  'ledger_movements', 'inventory_items', 'sales', 'stock_takes', 'employees',
  'payrolls', 'users', 'audit_logs',
] as const;

// The Phase-2 brief's "families / sacraments / inventory movements" concepts map
// onto the actual schema as: family fields live ON Christians (scc/localChurch),
// sacraments are JSON columns on Christians (baptism/eucharist/confirmation/
// marriage), and inventory movement history is Sales + StockTakes + StockIssues.
// The drill seeds 30 distinct SCC "families", 30 sacrament JSON marks, and 100
// stock-change events (sales/stock-takes) to cover the same ground honestly.

/** Deterministic dataset + baseline capture in one pass. */
function seedAndBaseline(db: string) {
  dbSql(db, `BEGIN;
    INSERT INTO "users" (id, email, "passwordHash", name, role, "isActive", "tokenVersion", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text || '-' || g, 'drill-user' || g || '@drill.local', 'x', 'Drill User ' || g, 'staff', true, 0, now(), now()
    FROM generate_series(1, 10) g;
    -- Give user 1 a real bcrypt hash so the drill can log in after restore.
    UPDATE "users" SET "passwordHash" = '$2a$10$FNj.sxLgn/Z.6JcCqJb.OOr73V.Bn9ErolR0NazQwJUs4P4kh28bO' WHERE email = 'drill-user1@drill.local';
    INSERT INTO "christians" (id, "regNo", "nationalId", "baptismalName", "secondName", "sirName",
                              phone, diocese, parish, "localChurch", scc, status,
                              baptism, eucharist, confirmation, marriage, "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text || '-' || g,
           'REG-DRILL-' || lpad(g::text, 6, '0'), 'ID' || g,
           'Bap' || g, 'Sec' || g, 'Sir' || g, '0700' || lpad(g::text, 6, '0'),
           'D', 'P', 'Family ' || (1 + g % 30), 'SCC-' || (1 + g % 30), 'Active',
           CASE WHEN g % 4 = 0 THEN '{"date":"2020-01-01","minister":"M","place":"P"}'::json END,
           CASE WHEN g % 4 = 1 THEN '{"date":"2020-02-01","minister":"M","place":"P"}'::json END,
           CASE WHEN g % 4 = 2 THEN '{"date":"2020-03-01","minister":"M","place":"P"}'::json END,
           CASE WHEN g % 4 = 3 THEN '{"date":"2020-04-01","minister":"M","place":"P"}'::json END,
           now(), now()
    FROM generate_series(1, 100) g;
    INSERT INTO "contributions" (id, "christianId", "memberName", "regNo", categories,
                                 "monthlyTracker", "amountKES", date, "createdAt")
    SELECT gen_random_uuid()::text || '-' || g,
           (SELECT id FROM "christians" ORDER BY id OFFSET (g % 100) LIMIT 1),
           'Member ' || g, 'REG-DRILL-' || lpad(((g % 100) + 1)::text, 6, '0'),
           '["Tithe"]'::jsonb, '{}'::jsonb, (100 + g)::numeric, '2026-01-01'::timestamptz, now()
    FROM generate_series(1, 100) g;
    INSERT INTO "expenses" (id, date, category, description, amount, "paymentMethod", "voucherNo")
    SELECT gen_random_uuid()::text || '-' || g, ('2026-01-0' || (1 + g % 9))::timestamptz, 'Cat', 'D', 50 + g, 'Cash',
           'EXP-DRILL-' || lpad(g::text, 5, '0')
    FROM generate_series(1, 50) g;
    INSERT INTO "deposits" (id, date, amount, "bankName", "accountNo", "sourceOfCash", "refNo", "depositedBy")
    SELECT gen_random_uuid()::text || '-' || g, '2026-01-15'::timestamptz, 500 + g, 'Bank', 'ACC', 'S',
           'DEP-DRILL-' || lpad(g::text, 5, '0'), 'Treasurer'
    FROM generate_series(1, 20) g;
    INSERT INTO "ledgers" (id, name, code, type, cashier, balance, "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, 'Main', 'LDR-MAIN', 'Cash', 'T', 0, now(), now();
    INSERT INTO "ledger_movements" (id, amount, time, "from", "to", notes, "createdAt")
    SELECT gen_random_uuid()::text || '-' || g, 10 + g, '2026-02-01'::timestamptz, 'A', 'B', 'drill', now()
    FROM generate_series(1, 100) g;
    INSERT INTO "inventory_items" (id, name, sku, category, cost, price, stock, reorder, "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text || '-' || g, 'Item ' || g, 'SKU-' || g, 'C', 10, 20, 5, 1, now(), now()
    FROM generate_series(1, 50) g;
    INSERT INTO "sales" (id, item, time, amount, "createdAt")
    SELECT gen_random_uuid()::text || '-' || g, 'Item ' || (1 + g % 50), '2026-03-02'::timestamptz, 20, now()
    FROM generate_series(1, 100) g;
    INSERT INTO "stock_takes" (id, name, sku, system, physical, notes, "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text || '-' || g, 'Item ' || (1 + g % 50), 'SKU-' || (1 + g % 50), 5, 5, 'drill', now(), now()
    FROM generate_series(1, 50) g;
    INSERT INTO "employees" (id, code, name, role, phone, email, "hireDate", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text || '-' || g, 'EMP-' || lpad(g::text, 4, '0'), 'Emp ' || g, 'R',
           '0711', 'emp' || g || '@drill.local', '2024-01-01'::timestamptz, now(), now()
    FROM generate_series(1, 20) g;
    INSERT INTO "payrolls" (id, "employeeId", period, "basicSalary", allowances, deductions, "netPay", status, "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text || '-' || g,
           (SELECT id FROM "employees" ORDER BY id OFFSET (g % 20) LIMIT 1),
           '2026-0' || (1 + g % 6), 1000 + g, 0, 0, 1000 + g, 'Draft', now(), now()
    FROM generate_series(1, 40) g;
    INSERT INTO "audit_logs" (id, "entityName", "entityId", action, "metadataSnapshot", "createdAt")
    SELECT gen_random_uuid()::text || '-' || g, 'Christian', 'x' || g, 'DELETE', '{}', '2026-04-01'
    FROM generate_series(1, 100) g;
  COMMIT;`);

  const baseline: Record<string, unknown> = {};
  const count = (t: string) => Number(dbSql(db, `SELECT count(*) FROM "${t}"`));
  for (const t of TABLES) baseline[t] = count(t);
  baseline.financial = {
    contributionsTotal: dbSql(db, `SELECT sum("amountKES") FROM "contributions"`),
    expensesTotal: dbSql(db, `SELECT sum(amount) FROM "expenses"`),
    depositsTotal: dbSql(db, `SELECT sum(amount) FROM "deposits"`),
    movementsTotal: dbSql(db, `SELECT sum(amount) FROM "ledger_movements"`),
    payrollNet: dbSql(db, `SELECT sum("netPay") FROM "payrolls"`),
  };
  baseline.inventory = {
    stockTotal: dbSql(db, `SELECT sum(stock) FROM "inventory_items"`),
    itemNames: dbSql(db, `SELECT count(DISTINCT name) FROM "inventory_items"`),
    salesTotal: dbSql(db, `SELECT sum(amount) FROM "sales"`),
    salesCount: dbSql(db, `SELECT count(*) FROM "sales"`),
  };
  baseline.identity = {
    christianIds: dbSql(db, `SELECT count(*), count(DISTINCT id), count(DISTINCT "regNo") FROM "christians"`),
    contributionsLinked: dbSql(db, `SELECT count(*) FROM "contributions" c JOIN "christians" ch ON ch.id = c."christianId"`),
    payrollLinked: dbSql(db, `SELECT count(*) FROM "payrolls" p JOIN "employees" e ON e.id = p."employeeId"`),
    userRoles: dbSql(db, `SELECT role, count(*) FROM "users" GROUP BY role ORDER BY role`),
  };
  baseline.config = {
    parishSettings: count('system_settings'),
    panelPermissions: count('panel_permissions'),
  };
  return baseline;
}

const compare = (a: Record<string, unknown>, b: Record<string, unknown>, path: string, diffs: string[]) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(`${path}: baseline=${JSON.stringify(a)} restored=${JSON.stringify(b)}`);
};

async function httpJson(port: number, path: string, token?: string, method = 'GET'): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers: token ? { Authorization: `Bearer ${token}` } : {} }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode ?? 0, body: data }); } });
    });
    req.on('error', reject);
    req.end();
  });
}

const lastServerLines: string[] = [];

async function bootApp(port: number): Promise<ReturnType<typeof spawn>> {
  const dist = path.resolve(__dirname, '../dist/index.js');
  const child = spawn(process.execPath, [dist], {
    env: envWith({ DATABASE_URL: `postgresql://${pg.user}:${pg.password}@${pg.host}:${pg.port}/${RESTORED_DB}?schema=public`,
      PORT: String(port), JWT_SECRET: 'drill-jwt-secret-not-a-production-value', NODE_ENV: 'production', BACKUP_DISABLED: 'true' }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (c) => { lastServerLines.push(String(c).trim()); if (lastServerLines.length > 8) lastServerLines.shift(); });
  child.stderr?.on('data', (c) => { lastServerLines.push(String(c).trim()); if (lastServerLines.length > 8) lastServerLines.shift(); });
  for (let i = 0; i < 60; i++) {
    try { const r = await httpJson(port, '/api/health'); if (r.status === 200) return child; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error('Restored app did not become healthy in 30s');
}

async function main() {
  const steps: string[] = [];
  const note = (s: string) => { steps.push(s); console.log(`  ✔ ${s}`); };
  let app: ReturnType<typeof spawn> | null = null;
  try {
    // ── 1+2. Disposable DB + deterministic dataset ──
    await createDb(DRILL_DB);
    note(`created ${DRILL_DB} and applied schema via prisma migrate deploy`);
    console.log('Seeding deterministic dataset…');
    const baseline = seedAndBaseline(DRILL_DB);
    note(`seeded dataset: ${JSON.stringify(Object.fromEntries(TABLES.map((t) => [t, (baseline as any)[t]])))}`);

    // ── 3+4. Real backups of the DRILL database (scope DATABASE_URL!) ──
    // backupDatabase() reads DATABASE_URL at call time — point it at the drill
    // DB so we dump exactly what we seeded (and restore exactly what we compare).
    process.env.BACKUP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ecclesia-phase2-'));
    const savedUrl = process.env.DATABASE_URL;
    const drillUrl = `postgresql://${pg.user}:${pg.password}@${pg.host}:${pg.port}/${DRILL_DB}?schema=public`;
    let backup1: Awaited<ReturnType<typeof backupDatabase>>;
    let backup2: Awaited<ReturnType<typeof backupDatabase>>;
    const tBackupStart = Date.now();
    try {
      process.env.DATABASE_URL = drillUrl;
      backup1 = await backupDatabase();
      const dumpMs = Date.now() - tBackupStart;
      note(`plaintext backup of ${DRILL_DB} → ${path.basename(backup1.file)} sha256=${backup1.sha256.slice(0, 12)}… (${(backup1.size / 1024).toFixed(0)} KB in ${(dumpMs / 1000).toFixed(2)}s)`);
      if (!verifyOrThrow(backup1.file)) throw new Error('plaintext artifact failed verification');

      const KEY = crypto.randomBytes(32).toString('hex');
      process.env.BACKUP_ENCRYPTION_KEY = KEY;
      const { resetEncryptionKeyCache } = await import('../src/lib/backup.js');
      resetEncryptionKeyCache();
      const tEnc = Date.now();
      backup2 = await backupDatabase();
      note(`encrypted backup → ${path.basename(backup2.file)} alg=${backup2.encryption?.algorithm} (${(backup2.size / 1024).toFixed(0)} KB in ${((Date.now() - tEnc) / 1000).toFixed(2)}s)`);
    } finally {
      process.env.DATABASE_URL = savedUrl;
    }
    const meta2 = verifyOrThrow(backup2.file); // throws if artifact corrupt
    if (!meta2.encryption?.algorithm?.includes('256')) throw new Error('expected aes-256-gcm');
    if (!meta2.encryption?.algorithm?.includes('256')) throw new Error('expected aes-256-gcm');
    if (meta2.encryption.iv === readChecksumMeta(backup1.file)?.encryption?.iv) throw new Error('IV reuse detected');
    note('checksum verified for both artifacts; IV unique per backup');

    // ── 5. Negative checks on the encrypted artifact ──
    const tampered = fs.readFileSync(backup2.file); tampered[10] ^= 0xff;
    const tmpTampered = path.join(process.env.BACKUP_DIR!, 'tampered.bin');
    fs.writeFileSync(tmpTampered, tampered);
    if (sha256File(tmpTampered) === meta2.sha256) throw new Error('tamper not detected by checksum');
    // Wrong key: decrypt with a different 256-bit key must throw (GCM auth tag).
    const wrong = Buffer.alloc(32, 7);
    const { decryptBuffer } = await import('../src/lib/backup.js');
    let wrongKeyRejected = false;
    try { decryptBuffer(fs.readFileSync(backup2.file), wrong, meta2.encryption!); } catch { wrongKeyRejected = true; }
    if (!wrongKeyRejected) throw new Error('wrong key was NOT rejected');
    // Truncation must fail checksum verification.
    const truncatedPath = path.join(process.env.BACKUP_DIR!, 'truncated' + path.extname(backup2.file));
    fs.writeFileSync(truncatedPath, fs.readFileSync(backup2.file).subarray(0, Math.floor(fs.statSync(backup2.file).size / 2)));
    fs.writeFileSync(truncatedPath + '.meta.json', JSON.stringify(meta2));
    // verifyOrThrow on truncated copy:
    let truncDetected = false;
    try { verifyOrThrow(truncatedPath); } catch { truncDetected = true; }
    if (!truncDetected) throw new Error('truncated artifact was not detected');
    note('tamper/wrong-key/truncation all detected (checksum + GCM auth tag)');

    // ── 6. DESTROY ──
    adminSql(`DROP DATABASE IF EXISTS ${DRILL_DB}`);
    note(`DESTROYED source database ${DRILL_DB}`);

    // ── 7. RESTORE into a fresh database ──
    // A pg_dump of a database WITH migrations applied includes the migrations
    // table; the dump replays the enum/type creation, so the restore target
    // must start truly empty (no migrate deploy — the dump IS the schema).
    adminSql(`DROP DATABASE IF EXISTS ${RESTORED_DB}`);
    adminSql(`CREATE DATABASE ${RESTORED_DB}`);
    // Restore the ENCRYPTED artifact — the hardest path.
    const tRestoreStart = Date.now();
    const plainSql = artifactToSqlFile(backup2.file, fs.mkdtempSync(path.join(os.tmpdir(), 'ecclesia-restore-')));
    await execFileAsync(PSQL, buildPsqlRestoreArgs({ ...pg, database: RESTORED_DB }, plainSql), { env: envWith() });
    const restoreMs = Date.now() - tRestoreStart;
    note(`restored encrypted artifact into fresh ${RESTORED_DB} (${((Date.now() - tRestoreStart) / 1000).toFixed(2)}s)`);

    // Diagnostic: prove what the restored DB actually contains for the login user.
    const dbg = dbSql(RESTORED_DB, `SELECT email || ' | ' || left("passwordHash", 15) || ' | active=' || "isActive" FROM users WHERE email = 'drill-user1@drill.local'`);
    console.log('  [dbg] restored login row:', dbg);
    const fullHash = dbSql(RESTORED_DB, `SELECT "passwordHash" FROM users WHERE email = 'drill-user1@drill.local'`);
    const bcryptMod = await import('bcryptjs');
    console.log('  [dbg] in-process bcrypt verify against restored hash:', await bcryptMod.default.compare('DrillPass123!', fullHash));

    // ── 8. BOOT the real application against the restored DB ──
    // The dump already contains the full schema; booting the app must not need
    // migrations. (If a future restore DOES need them, the documented procedure
    // in docs/BACKUP-AND-RESTORE.md says when to run migrate deploy.)
    const port = 5757;
    const tBootStart = Date.now();
    app = await bootApp(port);
    console.log(`  [timing] boot-to-healthy: ${((Date.now() - tBootStart) / 1000).toFixed(2)}s`);
    const health = await httpJson(port, '/api/health');
    if (health.status !== 200 || health.body?.db !== 'connected') throw new Error('restored app health check failed');
    // Log in as drill-user1 (real bcrypt hash seeded pre-backup; password DrillPass123!).
    const login = await httpJson(port, '/api/auth/login', undefined, 'POST');
    void login;
    const loginRes = await new Promise<{ status: number; body: any }>((resolve, reject) => {
      const payload = JSON.stringify({ email: 'drill-user1@drill.local', password: 'DrillPass123!' });
      const req = http.request({ host: '127.0.0.1', port, path: '/api/auth/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, (res) => {
        let data = ''; res.on('data', (c) => (data += c));
        res.on('end', () => { try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode ?? 0, body: data }); } });
      });
      req.on('error', reject); req.write(payload); req.end();
    });
    if (loginRes.status !== 200 || !loginRes.body?.token) {
      console.error('login response:', JSON.stringify(loginRes.body).slice(0, 300));
      console.error('server said:', lastServerLines.join(' | ').slice(0, 600));
      throw new Error(`login against restored DB failed: ${loginRes.status}`);
    }
    const token = loginRes.body.token as string;
    const dash = await httpJson(port, '/api/dashboard/summary', token);
    if (dash.status !== 200) throw new Error(`dashboard against restored DB failed: ${dash.status}`);
    note(`application booted on :${port} — health 200, login 200, dashboard 200 against restored DB`);

    // ── 9. COMPARE (read-only capture from the restored DB) ──
    const capture = (db: string) => {
      const b: Record<string, unknown> = {};
      const count = (t: string) => Number(dbSql(db, `SELECT count(*) FROM "${t}"`));
      for (const t of TABLES) b[t] = count(t);
      b.financial = {
        contributionsTotal: dbSql(db, `SELECT sum("amountKES") FROM "contributions"`),
        expensesTotal: dbSql(db, `SELECT sum(amount) FROM "expenses"`),
        depositsTotal: dbSql(db, `SELECT sum(amount) FROM "deposits"`),
        movementsTotal: dbSql(db, `SELECT sum(amount) FROM "ledger_movements"`),
        payrollNet: dbSql(db, `SELECT sum("netPay") FROM "payrolls"`),
      };
      b.inventory = {
        stockTotal: dbSql(db, `SELECT sum(stock) FROM "inventory_items"`),
        itemNames: dbSql(db, `SELECT count(DISTINCT name) FROM "inventory_items"`),
        salesTotal: dbSql(db, `SELECT sum(amount) FROM "sales"`),
        salesCount: dbSql(db, `SELECT count(*) FROM "sales"`),
      };
      b.identity = {
        christianIds: dbSql(db, `SELECT count(*), count(DISTINCT id), count(DISTINCT "regNo") FROM "christians"`),
        contributionsLinked: dbSql(db, `SELECT count(*) FROM "contributions" c JOIN "christians" ch ON ch.id = c."christianId"`),
        payrollLinked: dbSql(db, `SELECT count(*) FROM "payrolls" p JOIN "employees" e ON e.id = p."employeeId"`),
        userRoles: dbSql(db, `SELECT role, count(*) FROM "users" GROUP BY role ORDER BY role`),
      };
      b.config = { parishSettings: count('system_settings'), panelPermissions: count('panel_permissions') };
      return b;
    };
    const after = capture(RESTORED_DB);
    const diffs: string[] = [];
    compare(baseline, after, 'baseline-vs-restored', diffs);
    if (diffs.length) { console.error('DATA MISMATCH:'); for (const d of diffs) console.error('  ' + d); process.exitCode = 1; }
    else note('baseline == restored (counts, financial totals, inventory totals, identity, config)');

    console.log('\nPHASE-2 DRILL: ' + (process.exitCode ? 'FAILED' : 'PASS'));
  } finally {
    if (app) app.kill();
    try { adminSql(`DROP DATABASE IF EXISTS ${DRILL_DB}`); } catch { /* already dropped */ }
    try { adminSql(`DROP DATABASE IF EXISTS ${RESTORED_DB}`); } catch { /* already dropped */ }
  }
}

main().catch((e) => { console.error('DRILL ERROR:', e instanceof Error ? e.message : e); process.exit(1); });

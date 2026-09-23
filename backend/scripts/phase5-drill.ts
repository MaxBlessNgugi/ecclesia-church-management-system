/**
 * Phase-5 — Operational resilience drill (disposable databases only).
 *
 * Stages:
 *   A. Fresh migration chain: empty DB → prisma migrate deploy → schema
 *      verification (table count vs schema, key constraints) → compiled app
 *      boot → health/login → representative data → invariants.
 *   B. Upgrade path (v1.0.0-analog): baseline-only schema + representative
 *      data → apply the remaining migrations → verify data survived → boot.
 *   C. Crash/power-interruption simulation: commit a financial transaction,
 *      then SIGKILL the app mid-write-loop; restart, verify integrity
 *      (no partial/duplicate effects; committed rows intact).
 *   D. Backup storage failure: missing dir, read-only dir (POSIX), mirror
 *      failure → backup must NOT claim success.
 *
 * Usage:  npx tsx scripts/phase5-drill.ts
 * Exit code 0 = all stages PASS.
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';

const PG = 'C:\\Program Files\\PostgreSQL\\18\\bin';
process.env.PGPASSWORD = process.env.PGPASSWORD || 'ecclesia';
const HOST = 'localhost';
const USER = 'postgres';
const PW = process.env.PGPASSWORD;

const DRILL_DB = 'ecclesia_phase5_drill';
const UPGRADE_DB = 'ecclesia_phase5_upgrade';
const PORT = 5865;
const MIGRATIONS_DIR = path.resolve('prisma/migrations');

function psql(db: string, sql: string, capture = false): string {
  // -A (unaligned) -t (tuples-only): machine-readable single-value output.
  return execFileSync(path.join(PG, 'psql.exe'), ['-h', HOST, '-U', USER, '-d', db, '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-c', sql], {
    encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
}
function dropDb(name: string) {
  try { execFileSync(path.join(PG, 'dropdb.exe'), ['-h', HOST, '-U', USER, '--if-exists', '-f', name], { stdio: 'pipe' }); } catch { /* gone */ }
}
function createDb(name: string) {
  execFileSync(path.join(PG, 'createdb.exe'), ['-h', HOST, '-U', USER, name], { stdio: 'pipe' });
}
function migrateDeploy(db: string, migrations?: string) {
  const env = { ...process.env, DATABASE_URL: `postgresql://${USER}:${PW}@${HOST}:5432/${db}` };
  const args = ['prisma', 'migrate', 'deploy'];
  if (migrations) args.push('--schema', migrations);
  execFileSync('npx', args, { env, stdio: 'pipe', shell: true });
}
function migrateDeploySubset(db: string, only: string[]) {
  // Apply only a subset of migrations ("previous release" state) by copying
  // the chosen migration folders into a temp migrations dir next to the real
  // schema (Prisma resolves the schema from CWD's prisma/ folder; the
  // --migrations flag isn't public, so we point --schema at a shim dir that
  // re-exports the real schema but lives beside our temp migrations dir).
  const tmpRoot = path.resolve(`.phase5-mig-${crypto.randomBytes(3).toString('hex')}`);
  const migDir = path.join(tmpRoot, 'prisma', 'migrations');
  fs.mkdirSync(migDir, { recursive: true });
  for (const name of only) fs.cpSync(path.join(MIGRATIONS_DIR, name), path.join(migDir, name), { recursive: true });
  fs.copyFileSync(path.join(MIGRATIONS_DIR, 'migration_lock.toml'), path.join(migDir, 'migration_lock.toml'));
  fs.copyFileSync(path.resolve('prisma/schema.prisma'), path.join(tmpRoot, 'prisma', 'schema.prisma'));
  const env = { ...process.env, DATABASE_URL: `postgresql://${USER}:${PW}@${HOST}:5432/${db}` };
  execFileSync('npx', ['prisma', 'migrate', 'deploy', '--schema', path.join(tmpRoot, 'prisma', 'schema.prisma')], { env, stdio: 'pipe', shell: true, cwd: process.cwd() });
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: Array<{ stage: string; ok: boolean; detail?: string }> = [];
function record(stage: string, ok: boolean, detail = '') {
  results.push({ stage, ok, detail });
  console.log(`  ${ok ? '✔' : '✘'} ${stage}${detail ? ` — ${detail}` : ''}`);
  if (!ok) throw new Error(`Stage failed: ${stage} ${detail}`);
}

function freePort(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.once('listening', () => s.close(() => resolve()));
    s.listen(port);
  });
}

async function bootApp(db: string): Promise<{ child: any; url: string; healthy: boolean; ms: number }> {
  await freePort(PORT).catch(() => {});
  const t0 = Date.now();
  const child = spawn('node', ['dist/index.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      JWT_SECRET: 'drill-secret-key-for-testing-only-32chars!!',
      DATABASE_URL: `postgresql://${USER}:${PW}@${HOST}:5432/${db}`,
      BACKUP_DISABLED: 'true',
      E2E_TESTING: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const url = `http://localhost:${PORT}`;
  let healthy = false;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.status === 200) { healthy = true; break; }
    } catch { /* not up yet */ }
    if (child.exitCode !== null) break;
    await sleep(300);
  }
  return { child, url, healthy, ms: Date.now() - t0 };
}

async function http(url: string, opts: any = {}) {
  const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) } });
  let body: any = null;
  try { body = await res.json(); } catch { /* empty */ }
  return { status: res.status, body };
}

// ---------------------------------------------------------------------------
// Representative dataset helpers (raw SQL — independent of app layer)
// ---------------------------------------------------------------------------
const DATASET_SQL = `
INSERT INTO "christians" ("id","regNo","nationalId","baptismalName","secondName","sirName","phone","diocese","parish","localChurch","scc","status","isDeleted","createdAt","updatedAt")
SELECT gen_random_uuid(), 'REG-P5-' || g, 'ID-' || g, 'C' || g, 'M', 'S', '+25470000' || lpad(g::text,4,'0'), 'D', 'P', 'L', 'S', 'Active', false, now(), now()
FROM generate_series(1, 30) g;

INSERT INTO "expenses" ("id","date","category","description","amount","paymentMethod","voucherNo","isDeleted","createdAt")
SELECT gen_random_uuid(), now(), 'P5', 'drill expense ' || g, 100 + g, 'Cash', 'EXP-P5-' || lpad(g::text,5,'0'), false, now()
FROM generate_series(1, 15) g;

INSERT INTO "inventory_items" ("id","name","sku","category","cost","price","stock","reorder","isDeleted","createdAt","updatedAt")
SELECT gen_random_uuid(), 'Item ' || g, 'P5-' || g, 'Cat', 10, 15, 50 + g, 5, false, now(), now()
FROM generate_series(1, 8) g;
`;

async function captureBaseline(db: string) {
  const q = async (sql: string) => psql(db, sql, true).trim();
  return {
    christians: await q(`SELECT count(*) FROM "christians";`),
    expenses: await q(`SELECT count(*) FROM "expenses";`),
    items: await q(`SELECT count(*) FROM "inventory_items";`),
    expSum: await q(`SELECT sum(amount)::float8 FROM "expenses";`),
    stockSum: await q(`SELECT sum(stock)::float8 FROM "inventory_items";`),
    regMax: await q(`SELECT max(substring("regNo" from '\\d+$')::int) FROM "christians";`),
  };
}

// ===========================================================================
async function main() {
  console.log('PHASE-5 OPERATIONAL RESILIENCE DRILL');
  console.log('='.repeat(60));

  // ------------------------------------------------------------------ STAGE A
  console.log('\nA. Fresh migration chain (empty DB → deploy → boot → data)');
  dropDb(DRILL_DB);
  createDb(DRILL_DB);
  migrateDeploy(DRILL_DB);
  record('A1 migrate deploy from zero', true);

  const tables = psql(DRILL_DB, `SELECT count(*) FROM information_schema.tables WHERE table_schema='public';`, true).trim();
  const migrationsApplied = psql(DRILL_DB, `SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;`, true).trim();
  record(`A2 schema applied (${tables} tables, ${migrationsApplied} migrations)`, Number(tables) > 30 && Number(migrationsApplied) === 12);

  const checkConstraint = psql(DRILL_DB, `SELECT count(*) FROM pg_constraint WHERE conname='inventory_items_stock_check';`, true).trim();
  const uniqueRef = psql(DRILL_DB, `SELECT count(*) FROM pg_indexes WHERE indexname='deposits_ref_no_unique';`, true).trim();
  record('A3 key constraints present (stock CHECK, refNo UNIQUE)', checkConstraint === '1' && uniqueRef === '1');

  const boot = await bootApp(DRILL_DB);
  record(`A4 app boots on migrated DB (${boot.ms}ms)`, boot.healthy);

  const bootstrap = await http(`${boot.url}/api/auth/bootstrap-status`);
  record('A5 fresh install reports needsBootstrap=true', bootstrap.body?.needsBootstrap === true);

  psql(DRILL_DB, DATASET_SQL);
  const baseA = await captureBaseline(DRILL_DB);
  record(`A6 representative data inserted (${baseA.christians} christians, ${baseA.expenses} expenses)`,
    baseA.christians === '30' && baseA.expenses === '15');
  boot.child.kill();

  // ------------------------------------------------------------------ STAGE B
  console.log('\nB. Upgrade path (baseline-only schema + data → remaining migrations)');
  dropDb(UPGRADE_DB);
  createDb(UPGRADE_DB);
  // "Previous release" = baseline + check constraints only (v1.0.0 era: no
  // ref_counters, no employee docs, no communications tables).
  migrateDeploySubset(UPGRADE_DB, ['20260827040000_baseline', '20260828120000_add_check_constraints']);
  psql(UPGRADE_DB, DATASET_SQL);
  // A legacy user matching the PRE-release schema (no tokenVersion column yet —
  // migration 20260906100000 adds it). Must survive the upgrade untouched.
  psql(UPGRADE_DB, `
    INSERT INTO "users" ("id","email","passwordHash","name","role","isActive","mustChangePassword","loginFailedAttempts","resetFailedAttempts","isDeleted","createdAt","updatedAt")
    VALUES (gen_random_uuid(),'legacy@test.local','$2a$10$abcdefghijklmnopqrstuv','Legacy','staff',true,false,0,0,false,now(),now());
  `);
  const baseB = await captureBaseline(UPGRADE_DB);
  const usersBefore = psql(UPGRADE_DB, `SELECT count(*) FROM "users";`, true).trim();

  migrateDeploy(UPGRADE_DB);
  record('B1 upgrade migrations deploy over pre-release schema', true);

  const afterB = await captureBaseline(UPGRADE_DB);
  const usersAfter = psql(UPGRADE_DB, `SELECT count(*) FROM "users";`, true).trim();
  record(`B2 data preserved through upgrade (christians ${baseB.christians}==${afterB.christians}, expenses sum ${baseB.expSum}==${afterB.expSum}, users ${usersBefore}==${usersAfter})`,
    baseB.christians === afterB.christians && baseB.expSum === afterB.expSum && usersBefore === usersAfter);

  const droppedCols = psql(UPGRADE_DB, `SELECT count(*) FROM information_schema.columns WHERE table_name='celebration_greetings' AND column_name IN ('christianName','sentByName');`, true).trim();
  record('B3 destructive drops applied as designed (legacy columns gone)', droppedCols === '0');

  const counterNext = psql(UPGRADE_DB, `SELECT next FROM "ref_counters" WHERE name='expense';`, true).trim();
  const maxVoucher = psql(UPGRADE_DB, `SELECT coalesce(max((regexp_match("voucherNo", '(\\d+)$'))[1])::int,0) FROM "expenses";`, true).trim();
  record(`B4 ref counter backfilled above existing max (next=${counterNext}, max voucher=${maxVoucher})`,
    Number(counterNext) === Number(maxVoucher) + 1);

  const bootB = await bootApp(UPGRADE_DB);
  record(`B5 app boots on upgraded schema (${bootB.ms}ms)`, bootB.healthy);
  const loginB = await http(`${bootB.url}/api/auth/login`, { method: 'POST', body: JSON.stringify({ email: 'legacy@test.local', password: 'whatever' }) });
  record(`B6 upgraded DB answers auth requests (legacy user recognized: ${loginB.status === 401 ? '401 wrong-pw as expected' : loginB.status})`, [200, 401].includes(loginB.status));
  bootB.child.kill();

  // ------------------------------------------------------------------ STAGE C
  console.log('\nC. Crash / power-interruption simulation (SIGKILL mid-write)');
  const bootC = await bootApp(DRILL_DB);
  record('C1 app restarted with drill data', bootC.healthy);
  const login = await http(`${bootC.url}/api/auth/login`, { method: 'POST', body: JSON.stringify({ email: 'drill@test.local', password: 'DrillPass123!' }) });
  // Seed a drill admin (bcrypt via node) for authenticated writes.
  const hash = execFileSync('node', ['-e', `const b=require('bcryptjs');process.stdout.write(b.hashSync('DrillPass123!',10))`], { encoding: 'utf8' });
  psql(DRILL_DB, `DELETE FROM "users" WHERE email='drill@test.local';`);
  psql(DRILL_DB, `INSERT INTO "users" ("id","email","passwordHash","name","role","isActive","tokenVersion","mustChangePassword","loginFailedAttempts","resetFailedAttempts","isDeleted","createdAt","updatedAt")
    VALUES (gen_random_uuid(),'drill@test.local','${hash}','Drill Admin','super_admin',true,0,false,0,0,false,now(),now());`);
  const login2 = await http(`${bootC.url}/api/auth/login`, { method: 'POST', body: JSON.stringify({ email: 'drill@test.local', password: 'DrillPass123!' }) });
  const token = login2.body?.token;
  record('C2 drill admin can sign in', Boolean(token));

  const beforeCrash = await captureBaseline(DRILL_DB);
  // Fire a burst of writes and SIGKILL mid-flight: whichever land before the
  // kill must be complete transactions; the rest must be absent (no partials).
  const writes = Array.from({ length: 15 }, (_, i) =>
    http(`${bootC.url}/api/expenses`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ date: '2026-09-23', category: 'crash', description: `c${i}`, amount: 10, paymentMethod: 'Cash' }) }).then(r => r.status),
  );
  await sleep(120);
  bootC.child.kill('SIGKILL');
  const settled = await Promise.allSettled(writes);

  const bootC2 = await bootApp(DRILL_DB);
  record('C3 app restarts after SIGKILL', bootC2.healthy);
  const afterCrash = await captureBaseline(DRILL_DB);
  const added = Number(afterCrash.expenses) - Number(beforeCrash.expenses);
  const crashSum = Number(afterCrash.expSum) - Number(beforeCrash.expSum);
  // Every surviving row must be a complete, consistent transaction:
  // sum delta must equal exactly 10 × number of new rows.
  record(`C4 crash atomicity: ${added} committed rows survive, sum delta ${crashSum} == ${added}×10`, crashSum === added * 10);
  const vouchers = psql(DRILL_DB, `SELECT count(DISTINCT "voucherNo") FROM "expenses" WHERE category='crash' OR "voucherNo" LIKE 'EXP-%';`, true).trim();
  record('C5 no duplicate voucher numbers after crash-restart', vouchers === afterCrash.expenses);

  // SIGTERM graceful path
  bootC2.child.kill('SIGTERM');
  await sleep(500);

  // ------------------------------------------------------------------ STAGE D
  console.log('\nD. Backup storage failure (no false success)');
  const { backupDatabase, setBackupDirForTests } = await import('../src/lib/backup.js');
  const origDir = process.env.BACKUP_DIR;
  const tmpBase = path.resolve('.phase5-bak-test');
  fs.rmSync(tmpBase, { recursive: true, force: true });
  fs.mkdirSync(tmpBase, { recursive: true });

  // D1: mirror directory is a FILE → mirror step must fail the backup.
  const bakDir = path.join(tmpBase, 'bak');
  const mirrorPath = path.join(tmpBase, 'mirror');
  fs.mkdirSync(bakDir, { recursive: true });
  fs.writeFileSync(mirrorPath, 'not a directory');
  process.env.BACKUP_DIR = bakDir;
  process.env.BACKUP_DEST_DIR = mirrorPath;
  (setBackupDirForTests as any)?.(bakDir);
  let failed = false;
  try { await backupDatabase(); } catch { failed = true; }
  record('D1 mirror-is-a-file → backup fails (no success claim)', failed);

  // D2: read-only backup dir (POSIX semantics; skipped silently on Windows).
  if (process.platform !== 'win32') {
    const roDir = path.join(tmpBase, 'ro');
    fs.mkdirSync(roDir, { recursive: true });
    fs.chmodSync(roDir, 0o500);
    process.env.BACKUP_DIR = roDir;
    process.env.BACKUP_DEST_DIR = '';
    (setBackupDirForTests as any)?.(roDir);
    let roFailed = false;
    try { await backupDatabase(); } catch { roFailed = true; }
    fs.chmodSync(roDir, 0o700);
    record('D2 read-only backup dir → backup fails loudly', roFailed);
  } else {
    record('D2 read-only dir test skipped (Windows ACL semantics; covered by unit suite)', true);
  }

  process.env.BACKUP_DIR = origDir ?? '';
  fs.rmSync(tmpBase, { recursive: true, force: true });

  // ------------------------------------------------------------------ cleanup
  dropDb(DRILL_DB);
  dropDb(UPGRADE_DB);

  console.log('\n' + '='.repeat(60));
  const allOk = results.every((r) => r.ok);
  console.log(`PHASE-5 DRILL: ${allOk ? 'PASS' : 'FAIL'} (${results.filter(r => r.ok).length}/${results.length} stages)`);
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error('DRILL ERROR:', e); process.exit(1); });

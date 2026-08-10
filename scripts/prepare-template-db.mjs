// =============================================================================
// prepare-template-db.mjs — generate backend/template.db
// -----------------------------------------------------------------------------
// The packaged app has no Node.js runtime and cannot run `prisma db push` on
// the parish PC, so the EMPTY database schema is prepared here at build time
// and shipped as `backend/template.db`. On first launch, Electron copies it to
// the user-data directory (userData/ecclesia.db); the first-run setup screen
// then creates the parish administrator via POST /api/auth/bootstrap.
//
// The template contains ONLY the schema plus the two default singleton rows
// (panel_permissions, push_payment_settings) — no users, no parish data.
//
// Run: `npm run prepare:template` (uses the backend's own prisma CLI + client).
// =============================================================================
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = path.join(root, 'backend');
const tmpDb = path.join(backendDir, '.template.tmp.db');
const outDb = path.join(backendDir, 'template.db');

function run(cmd, env = {}) {
  execSync(cmd, {
    cwd: backendDir,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...env },
  });
}

// Remove any stale temp file
if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);

try {
  // 1. Create the schema in a fresh SQLite file (skip generating the client —
  //    the packaged backend ships the generated client already).
  //    NOTE: use an absolute file: URL — Prisma resolves relative SQLite paths
  //    against the schema file's directory (backend/prisma), not the cwd.
  const dbUrl = `file:${tmpDb.replace(/\\/g, '/')}`;
  console.log('[template-db] Pushing Prisma schema...');
  run('npx prisma db push --skip-generate --schema prisma/schema.prisma', {
    DATABASE_URL: dbUrl,
  });

  // 2. Insert the two default singleton rows (no admin — created at first run).
  console.log('[template-db] Seeding singletons...');
  run('npx tsx prisma/seed-singletons.ts', {
    DATABASE_URL: dbUrl,
  });

  // 3. Move into place.
  fs.renameSync(tmpDb, outDb);
  const size = fs.statSync(outDb).size;
  console.log(`[template-db] Wrote ${outDb} (${(size / 1024).toFixed(1)} KB)`);
} finally {
  if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
}

import fs from 'fs';
import { resolve } from 'path';

// CRITICAL: Set env vars BEFORE any Prisma or route imports
const DB_PATH = resolve(__dirname, '../test.db');
process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32chars!!';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';
process.env.BACKUP_DISABLED = 'true';

// Clean up any leftover test DB
for (const ext of ['', '-wal', '-shm', '-journal']) {
  const p = DB_PATH + ext;
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// Push schema to fresh test DB
import { execSync } from 'child_process';
const schemaPath = resolve(__dirname, '../prisma/schema.prisma');
execSync(`npx prisma db push --skip-generate --accept-data-loss --schema=${schemaPath}`, {
  env: { ...process.env, DATABASE_URL: 'file:./test.db' },
  cwd: resolve(__dirname, '..'),
  stdio: 'pipe',
});

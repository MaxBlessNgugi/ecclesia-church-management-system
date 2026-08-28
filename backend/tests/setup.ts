import { resolve } from 'path';

// CRITICAL: Set env vars BEFORE any Prisma or route imports
// Uses the PostgreSQL DATABASE_URL from the environment (set by CI or local .env).
// Falls back to a local dev defaults for developer convenience.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:ecclesia@localhost:5432/ecclesia_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-testing-only-32chars!!';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES || '1h';
process.env.NODE_ENV = 'test';
process.env.BACKUP_DISABLED = 'true';

// Push schema to the ephemeral test database.
// Tests use `db push` (not `migrate deploy`) because the test database is
// recreated on every run — migration history is unnecessary overhead.
// Production and install flows use `migrate deploy` with the baseline migration.
import { execSync } from 'child_process';
const schemaPath = resolve(__dirname, '../prisma/schema.prisma');
execSync(`npx prisma db push --skip-generate --accept-data-loss --schema=${schemaPath}`, {
  env: { ...process.env },
  cwd: resolve(__dirname, '..'),
  stdio: 'pipe',
});

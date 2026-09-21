// Database restore: `npm run restore -- --file=path/to/backup.sql [--yes]`
// Restores a PostgreSQL dump file into the live database using psql.
// The server MUST be stopped before running this.
import 'dotenv/config';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parsePgUrl, buildPsqlRestoreArgs } from '../src/lib/backup.js';

const execFileAsync = promisify(execFile);

async function main() {
  const fileArg = process.argv.find((a) => a.startsWith('--file='));
  const file = fileArg ? fileArg.split('=')[1] : process.argv[2];

  if (!file || !fs.existsSync(file)) {
    console.error('Usage: npm run restore -- --file=path/to/backup.sql --yes');
    process.exit(1);
  }
  if (!process.argv.includes('--yes')) {
    console.error('Refusing to restore without --yes (this overwrites the live database).');
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set — cannot restore');
    process.exit(1);
  }

  // Shared parser — strips Prisma's "?schema=public" and decodes credentials.
  const pg = parsePgUrl(url);
  const env = { ...process.env, PGPASSWORD: pg.password };

  console.log(`Restoring ${file} into PostgreSQL (${pg.database}@${pg.host}:${pg.port})...`);
  // psql flags come from the shared builder: -w (never prompt) and
  // ON_ERROR_STOP=1 (abort on the first error). pg_dump-only flags such as
  // --no-owner are NOT valid psql options and made every restore fail.
  await execFileAsync('psql', buildPsqlRestoreArgs(pg, file), { env });

  console.log('Restore complete. Start the server again to use the restored data.');
}

main().catch((err) => {
  console.error('Restore failed:', err);
  process.exit(1);
});

// Database restore: `npm run restore -- --file=path/to/backup.sql [--yes]`
// Restores a PostgreSQL dump file into the live database using psql.
// The server MUST be stopped before running this.
import 'dotenv/config';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function parsePgUrl(url: string) {
  const withoutScheme = url.replace(/^postgresql:\/\//, '');
  const [authAndHost, database] = withoutScheme.split('/');
  const [auth, hostPort] = authAndHost.split('@');
  const [user, password] = auth.split(':');
  const [host, port] = hostPort.split(':');
  return {
    host: host || 'localhost',
    port: port || '5432',
    database: database || 'ecclesia',
    user: user || 'postgres',
    password: password || '',
  };
}

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

  const pg = parsePgUrl(url);
  const env = { ...process.env, PGPASSWORD: pg.password };

  console.log(`Restoring ${file} into PostgreSQL (${pg.database}@${pg.host}:${pg.port})...`);
  await execFileAsync('psql', [
    '-h', pg.host,
    '-p', pg.port,
    '-U', pg.user,
    '-d', pg.database,
    '-f', file,
    '--no-owner',
    '--no-privileges',
  ], { env });

  console.log('Restore complete. Start the server again to use the restored data.');
}

main().catch((err) => {
  console.error('Restore failed:', err);
  process.exit(1);
});

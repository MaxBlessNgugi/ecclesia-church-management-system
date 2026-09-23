// Restore CLI: `npm run restore -- --file=path/to/backup.sql[.gz|.gz.enc] [--yes]`
//
// PROCEDURE (documented in docs/BACKUP-AND-RESTORE.md):
//   1. Stop the ECCLESIA server (psql needs exclusive use of the schema).
//   2. Run this script with the artifact path. It will:
//        a. verify the artifact checksum against its sidecar (refuses on mismatch)
//        b. decrypt (if encrypted) and decompress into a temporary plain .sql
//        c. restore into DATABASE_URL with psql -v ON_ERROR_STOP=1
//        d. clean up the temporary file
//   3. Start the ECCLESIA server again.
//
// Non-destructive by default: refuses without --yes; never touches DATABASE_URL
// itself beyond executing the restore into it.

import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  parsePgUrl,
  buildPsqlRestoreArgs,
  requirePgTool,
  verifyOrThrow,
  artifactToSqlFile,
} from '../src/lib/backup.js';

const execFileAsync = promisify(execFile);

async function main() {
  const fileArg = process.argv.find((a) => a.startsWith('--file='));
  const file = fileArg ? fileArg.split('=')[1] : process.argv[2];

  if (!file || !fs.existsSync(file)) {
    console.error('Usage: npm run restore -- --file=path/to/ecclesia-backup-<ts>.sql.gz[.enc] --yes');
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

  // Stage 1: integrity verification — refuse a corrupt/truncated artifact.
  let meta;
  try {
    meta = verifyOrThrow(file);
  } catch (err) {
    console.error(`Refusing to restore: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Stage 2: decrypt (if needed) + decompress into a temp plain-SQL file.
  const plainFile = artifactToSqlFile(file, os.tmpdir());
  try {
    const pg = parsePgUrl(url);
    const env = { ...process.env, PGPASSWORD: pg.password };
    const psql = await requirePgTool('psql');

    console.log(
      `Restoring ${path.basename(file)} → ${meta?.database ?? pg.database}@${pg.host}:${pg.port}` +
        `${meta?.encryption ? ` (encrypted: ${meta.encryption.algorithm})` : ''}...`,
    );
    await execFileAsync(psql, buildPsqlRestoreArgs(pg, plainFile), { env });
    console.log('Restore complete. Start the server again to use the restored data.');
  } finally {
    // Never leave decrypted parish data in the temp directory.
    try { fs.unlinkSync(plainFile); } catch { /* best-effort */ }
  }
}

main().catch((err) => {
  console.error('Restore failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

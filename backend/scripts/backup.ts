// Manual backup trigger: `npm run backup` (tsx scripts/backup.ts)
// Pipeline: pg_dump → gzip → optional AES-256-GCM (BACKUP_ENCRYPTION_KEY)
//   → SHA-256 sidecar (.meta.json) → retention → optional BACKUP_DEST_DIR mirror.
// The command exits non-zero when ANY stage fails — it never reports success
// for an unverified artifact. Safe to run while the server is up.
import 'dotenv/config';
import { backupDatabase } from '../src/lib/backup.js';

backupDatabase()
  .then((info) => {
    console.log(`Backup created: ${info.file} (${(info.size / 1024).toFixed(0)} KB)`);
    console.log(`SHA-256: ${info.sha256}`);
    console.log(`Checksum sidecar: ${info.checksumFile}`);
    if (info.encryption) console.log(`Encryption: ${info.encryption.algorithm}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Backup failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });

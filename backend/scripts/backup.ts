// Manual backup trigger: `npm run backup` (tsx scripts/backup.ts)
// Creates a consistent SQLite snapshot in BACKUP_DIR and mirrors it to
// BACKUP_DEST_DIR when configured. Safe to run while the server is up.
import 'dotenv/config';
import { backupDatabase } from '../src/lib/backup.js';

backupDatabase()
  .then((info) => {
    console.log(`Backup created: ${info.file} (${(info.size / 1024).toFixed(0)} KB)`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Backup failed:', err);
    process.exit(1);
  });

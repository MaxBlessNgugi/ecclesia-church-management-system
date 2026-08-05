// Database restore: `npm run restore -- --file=path/to/backup.db [--yes]`
// Overwrites the live SQLite file with a snapshot produced by a backup.
// The server MUST be stopped before running this.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { dbFilePath } from '../src/lib/backup.js';

function main() {
  const fileArg = process.argv.find((a) => a.startsWith('--file='));
  const file = fileArg ? fileArg.split('=')[1] : process.argv[2];

  if (!file || !fs.existsSync(file)) {
    console.error('Usage: npm run restore -- --file=path/to/backup.db --yes');
    process.exit(1);
  }
  if (!process.argv.includes('--yes')) {
    console.error('Refusing to restore without --yes (this overwrites the live database).');
    process.exit(1);
  }

  const dbPath = dbFilePath();
  if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  fs.copyFileSync(file, dbPath);
  console.log(`Restored ${file} -> ${dbPath}`);
  console.log('Start the server again to use the restored data.');
}

main();

// =============================================================================
// PostgreSQL backup engine
// -----------------------------------------------------------------------------
// Backs up the live database using pg_dump, which produces a consistent SQL
// dump even while the server is running. Responsibilities:
//   - Parse DATABASE_URL to extract connection parameters for pg_dump
//   - Write timestamped snapshots into BACKUP_DIR (default ./backups)
//   - Rotate old snapshots, keeping BACKUP_KEEP (default 14)
//   - Optionally mirror the newest snapshot to BACKUP_DEST_DIR (network share /
//     cloud-synced folder) for off-site resilience
// The scheduler (startBackupScheduler) runs a backup on boot if one is due and
// re-checks periodically; callers can also trigger one with backupDatabase().
//
// Environment variables:
//   BACKUP_DIR           — Directory for local backups (default: ./backups)
//   BACKUP_KEEP          — Number of snapshots to retain (default: 14)
//   BACKUP_INTERVAL_HOURS — Hours between backups (default: 24)
//   BACKUP_DISABLED      — Set to 'true' to disable automatic backups
//   BACKUP_DEST_DIR      — Optional off-site mirror directory
//   DATABASE_URL         — PostgreSQL connection URL
// =============================================================================
// Node.js built-in: fs module for file system operations
import fs from 'node:fs';
// Node.js built-in: path module for resolving and joining file paths
import path from 'node:path';
// Node.js built-in: child_process for running pg_dump
import { execFile } from 'node:child_process';
// Node.js built-in: util for promisifying execFile
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Directory where backup snapshots are stored.
 * Defaults to ./backups relative to the project root.
 */
const BACKUP_DIR = process.env.BACKUP_DIR || path.resolve(process.cwd(), 'backups');

/**
 * Maximum number of backup snapshots to retain.
 * Oldest snapshots are deleted when this limit is exceeded.
 */
const BACKUP_KEEP = Number(process.env.BACKUP_KEEP) || 14;

/**
 * Interval in milliseconds between automatic backups.
 * Calculated from BACKUP_INTERVAL_HOURS env var (default: 24 hours).
 */
const BACKUP_INTERVAL_MS =
  (Number(process.env.BACKUP_INTERVAL_HOURS) || 24) * 60 * 60 * 1000;

/**
 * How often (in ms) the scheduler checks if a backup is due.
 * Set to 6 hours — frequent enough to catch missed backups without excessive I/O.
 */
const BACKUP_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Parses a PostgreSQL connection URL into its component parts.
 * Format: postgresql://user:password@host:port/database
 *
 * @returns Object with host, port, database, user, password
 */
function parsePgUrl(url: string): { host: string; port: string; database: string; user: string; password: string } {
  // Strip the scheme prefix
  const withoutScheme = url.replace(/^postgresql:\/\//, '');
  // Extract auth, host:port, and database
  const [authAndHost, database] = withoutScheme.split('/');
  const [auth, hostPort] = authAndHost.split('@');
  const [user, password] = auth.split(':');
  const [host, port] = hostPort.split(':');

  return {
    host: host || 'localhost',
    port: port || '5432',
    database,
    user: user || 'postgres',
    password: password || '',
  };
}

/**
 * Creates an immediate backup of the PostgreSQL database using pg_dump.
 * Produces a SQL dump file that can be restored with psql.
 *
 * @returns An object containing the backup file path, size in bytes, and timestamp.
 */
export async function backupDatabase(): Promise<{ file: string; size: number; at: Date }> {
  // Ensure the backup directory exists
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  // Generate a timestamp for the backup filename
  const at = new Date();
  const stamp = at.toISOString().replace(/[:.]/g, '-');
  const target = path.join(BACKUP_DIR, `ecclesia-backup-${stamp}.sql`);

  // Parse DATABASE_URL for pg_dump connection parameters
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set — cannot create backup');
  }

  const pg = parsePgUrl(url);

  // Set PGPASSWORD environment variable for pg_dump authentication
  const env = { ...process.env, PGPASSWORD: pg.password };

  // Run pg_dump to create a SQL backup
  await execFileAsync('pg_dump', [
    '-h', pg.host,
    '-p', pg.port,
    '-U', pg.user,
    '-d', pg.database,
    '-F', 'p',       // Plain SQL format
    '-f', target,
    '--no-owner',    // Don't output ownership commands
    '--no-privileges', // Don't output privilege commands
  ], { env });

  // Get the size of the newly created backup file
  const size = fs.statSync(target).size;

  // Remove old backups that exceed the retention limit
  pruneBackups();

  // Mirror to off-site directory if BACKUP_DEST_DIR is configured
  copyOffsite(target);

  return { file: target, size, at };
}

/**
 * Deletes oldest backup snapshots when the count exceeds BACKUP_KEEP.
 */
function pruneBackups(): void {
  try {
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    while (files.length > BACKUP_KEEP) {
      const oldest = files.shift()!;
      fs.unlinkSync(path.join(BACKUP_DIR, oldest));
    }
  } catch {
    /* rotation is best-effort — don't crash the server if cleanup fails */
  }
}

/**
 * Copies a backup snapshot to an off-site directory.
 */
function copyOffsite(file: string): void {
  const destDir = process.env.BACKUP_DEST_DIR;
  if (!destDir) return;

  try {
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(file, path.join(destDir, path.basename(file)));
  } catch (err) {
    console.error('[backup] Off-site copy failed:', err);
  }
}

/**
 * Returns the timestamp of the most recent backup snapshot.
 */
export function lastBackupTime(): Date | null {
  try {
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);

    return files.length ? new Date(files[0].t) : null;
  } catch {
    return null;
  }
}

/**
 * Returns the absolute path to the backup directory.
 */
export function backupDirPath(): string {
  return BACKUP_DIR;
}

/** Module-level timer reference for the periodic backup scheduler. */
let timer: NodeJS.Timeout | null = null;

/**
 * Starts the periodic backup scheduler that runs automatic backups.
 * Can be disabled entirely by setting BACKUP_DISABLED=true.
 */
export function startBackupScheduler(): void {
  if (process.env.BACKUP_DISABLED === 'true') return;
  if (timer) return;

  const runIfDue = async () => {
    const last = lastBackupTime();
    if (!last || Date.now() - last.getTime() >= BACKUP_INTERVAL_MS) {
      try {
        const info = await backupDatabase();
        console.log(`[backup] Created ${info.file} (${(info.size / 1024).toFixed(0)} KB)`);
      } catch (err) {
        console.error('[backup] Scheduled backup failed:', err);
      }
    }
  };

  void runIfDue();
  timer = setInterval(() => void runIfDue(), BACKUP_CHECK_INTERVAL_MS);
  timer.unref();
}

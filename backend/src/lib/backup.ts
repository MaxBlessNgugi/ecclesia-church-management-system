// =============================================================================
// SQLite backup engine
// -----------------------------------------------------------------------------
// Backs up the live database using SQLite's online snapshot command
// `VACUUM INTO 'file'`, which produces a consistent copy even while the server
// is writing. Responsibilities:
//   - locate the real .db file from DATABASE_URL (relative to the schema dir)
//   - write timestamped snapshots into BACKUP_DIR (default ./backups)
//   - rotate old snapshots, keeping BACKUP_KEEP (default 14)
//   - optionally mirror the newest snapshot to BACKUP_DEST_DIR (network share /
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
//   DATABASE_URL         — Prisma database URL (e.g., file:./dev.db)
// =============================================================================
// Node.js built-in: fs module for file system operations (create dirs, read/delete/copy files)
import fs from 'node:fs';
// Node.js built-in: path module for resolving and joining file paths across platforms
import path from 'node:path';
// Prisma client for executing raw SQL commands against the live database
import { prisma } from './prisma.js';

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
 * Resolves the absolute file system path to the SQLite database file.
 * Prisma resolves relative `file:` URLs against the directory containing schema.prisma,
 * so this function replicates that logic to find the actual .db file on disk.
 *
 * @returns Absolute path to the SQLite database file.
 */
export function dbFilePath(): string {
  // Read DATABASE_URL with fallback to default dev database
  const url = process.env.DATABASE_URL || 'file:./dev.db';
  // Strip the 'file:' or 'sqlite://' prefix to get the raw path
  const rel = url.replace(/^file:/, '').replace(/^sqlite:\/\//, '');
  // If the path is already absolute, return it directly
  if (path.isAbsolute(rel)) return rel;
  // Otherwise resolve relative to the prisma schema directory (backend/prisma/)
  const schemaDir = path.resolve(process.cwd(), 'prisma');
  return path.resolve(schemaDir, rel);
}

/**
 * Creates an immediate backup of the live database using VACUUM INTO.
 * VACUUM INTO creates a consistent snapshot even while the database is being written to.
 * After backup, old snapshots are pruned and an off-site copy is made if configured.
 *
 * @returns An object containing the backup file path, size in bytes, and timestamp.
 */
export async function backupDatabase(): Promise<{ file: string; size: number; at: Date }> {
  // Ensure the backup directory exists (creates it recursively if needed)
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  // Generate a timestamp for the backup filename (ISO format with colons/dots replaced)
  const at = new Date();
  const stamp = at.toISOString().replace(/[:.]/g, '-');
  // Construct the full backup file path
  const target = path.join(BACKUP_DIR, `ecclesia-backup-${stamp}.db`);

  // Escape single quotes in the path to prevent SQL injection in the VACUUM INTO command
  const escaped = target.replace(/'/g, "''");
  // Execute VACUUM INTO to create a consistent snapshot of the live database
  await prisma.$executeRawUnsafe(`VACUUM INTO '${escaped}'`);

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
 * Files are sorted alphabetically (which works because timestamps are ISO-formatted).
 * This is a best-effort operation — errors are silently caught and ignored.
 */
function pruneBackups(): void {
  try {
    // List all .db files in the backup directory, sorted oldest-first
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.db'))
      .sort();

    // Delete oldest files until we're within the retention limit
    while (files.length > BACKUP_KEEP) {
      const oldest = files.shift()!;
      fs.unlinkSync(path.join(BACKUP_DIR, oldest));
    }
  } catch {
    /* rotation is best-effort — don't crash the server if cleanup fails */
  }
}

/**
 * Copies a backup snapshot to an off-site directory (e.g., network share, cloud-synced folder).
 * Only runs if BACKUP_DEST_DIR environment variable is set.
 * This provides disaster recovery resilience beyond local backups.
 *
 * @param file - Absolute path to the backup file to copy.
 */
function copyOffsite(file: string): void {
  // Check if off-site backup destination is configured
  const destDir = process.env.BACKUP_DEST_DIR;
  if (!destDir) return;

  try {
    // Create the destination directory if it doesn't exist
    fs.mkdirSync(destDir, { recursive: true });
    // Copy the backup file to the off-site location using the same filename
    fs.copyFileSync(file, path.join(destDir, path.basename(file)));
  } catch (err) {
    // Log the error but don't crash — off-site copy is supplementary
    console.error('[backup] Off-site copy failed:', err);
  }
}

/**
 * Returns the timestamp of the most recent backup snapshot.
 * Used by the scheduler to determine if a new backup is due.
 *
 * @returns Date of the most recent backup, or null if no backups exist.
 */
export function lastBackupTime(): Date | null {
  try {
    // List all .db files, get their modification times, and sort newest-first
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.db'))
      .map((f) => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);

    // Return the modification time of the newest file, or null if none exist
    return files.length ? new Date(files[0].t) : null;
  } catch {
    // If the backup directory doesn't exist or can't be read, return null
    return null;
  }
}

/**
 * Returns the absolute path to the backup directory.
 * Useful for displaying the backup location in the admin panel.
 *
 * @returns The resolved backup directory path.
 */
export function backupDirPath(): string {
  return BACKUP_DIR;
}

/**
 * Module-level timer reference for the periodic backup scheduler.
 * Prevents multiple schedulers from running simultaneously.
 */
let timer: NodeJS.Timeout | null = null;

/**
 * Starts the periodic backup scheduler that runs automatic backups.
 * Idempotent — calling it multiple times won't create duplicate timers.
 * Can be disabled entirely by setting BACKUP_DISABLED=true.
 *
 * On startup, it immediately checks if a backup is due (if the last backup
 * is older than BACKUP_INTERVAL_MS). Then it re-checks every
 * BACKUP_CHECK_INTERVAL_MS (6 hours) to catch any missed intervals.
 */
export function startBackupScheduler(): void {
  // Allow disabling backups entirely via environment variable
  if (process.env.BACKUP_DISABLED === 'true') return;

  // Prevent duplicate schedulers from being started
  if (timer) return;

  /**
   * Checks if a backup is due and creates one if needed.
   * Runs on startup and then every BACKUP_CHECK_INTERVAL_MS.
   */
  const runIfDue = async () => {
    // Get the timestamp of the most recent backup
    const last = lastBackupTime();
    // Create a backup if no backup exists or if enough time has elapsed
    if (!last || Date.now() - last.getTime() >= BACKUP_INTERVAL_MS) {
      try {
        const info = await backupDatabase();
        // Log the backup size in KB for easy reading
        console.log(`[backup] Created ${info.file} (${(info.size / 1024).toFixed(0)} KB)`);
      } catch (err) {
        console.error('[backup] Scheduled backup failed:', err);
      }
    }
  };

  // Run immediately on startup (fire-and-forget with void to avoid unhandled promise rejection)
  void runIfDue();

  // Set up periodic checking; unref() prevents the timer from keeping the Node.js process alive
  timer = setInterval(() => void runIfDue(), BACKUP_CHECK_INTERVAL_MS);
  timer.unref();
}

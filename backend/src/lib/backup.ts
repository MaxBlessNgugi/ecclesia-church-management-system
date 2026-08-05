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
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from './prisma.js';

const BACKUP_DIR = process.env.BACKUP_DIR || path.resolve(process.cwd(), 'backups');
const BACKUP_KEEP = Number(process.env.BACKUP_KEEP) || 14;
const BACKUP_INTERVAL_MS =
  (Number(process.env.BACKUP_INTERVAL_HOURS) || 24) * 60 * 60 * 1000;
const BACKUP_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Resolves the on-disk SQLite file from DATABASE_URL. Prisma resolves relative
 * `file:` URLs against the directory of schema.prisma (backend/prisma).
 */
export function dbFilePath(): string {
  const url = process.env.DATABASE_URL || 'file:./dev.db';
  const rel = url.replace(/^file:/, '').replace(/^sqlite:\/\//, '');
  if (path.isAbsolute(rel)) return rel;
  const schemaDir = path.resolve(process.cwd(), 'prisma');
  return path.resolve(schemaDir, rel);
}

/** Runs one backup now; returns the snapshot path + size. */
export async function backupDatabase(): Promise<{ file: string; size: number; at: Date }> {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const at = new Date();
  const stamp = at.toISOString().replace(/[:.]/g, '-');
  const target = path.join(BACKUP_DIR, `ecclesia-backup-${stamp}.db`);
  const dbPath = dbFilePath();

  // VACUUM INTO requires a literal path; escape any single quotes.
  const escaped = target.replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`VACUUM INTO '${escaped}'`);

  const size = fs.statSync(target).size;
  pruneBackups();
  copyOffsite(target);
  return { file: target, size, at };
}

/** Deletes oldest snapshots beyond BACKUP_KEEP. */
function pruneBackups(): void {
  try {
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.db'))
      .sort();
    while (files.length > BACKUP_KEEP) {
      const oldest = files.shift()!;
      fs.unlinkSync(path.join(BACKUP_DIR, oldest));
    }
  } catch {
    /* rotation is best-effort */
  }
}

/** Mirrors a snapshot to BACKUP_DEST_DIR when configured (off-site copy). */
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

/** Most recent snapshot time (or null if none exist yet). */
export function lastBackupTime(): Date | null {
  try {
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.db'))
      .map((f) => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    return files.length ? new Date(files[0].t) : null;
  } catch {
    return null;
  }
}

export function backupDirPath(): string {
  return BACKUP_DIR;
}

let timer: NodeJS.Timeout | null = null;

/** Starts the periodic backup scheduler (idempotent; disable via BACKUP_DISABLED). */
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

export function stopBackupScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

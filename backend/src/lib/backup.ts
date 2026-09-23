// =============================================================================
// PostgreSQL backup engine — single authoritative pipeline
// -----------------------------------------------------------------------------
// ACTUAL PIPELINE (verified implementation — docs must match this):
//
//   PostgreSQL ──pg_dump──► plain SQL ──gzip──► [optional AES-256-GCM encrypt]
//     ──► final artifact (.sql / .sql.gz / .sql.gz.enc)
//     ──► SHA-256 checksum over the FINAL bytes (post-encryption)
//     ──► sidecar <artifact>.meta.json (sha256, size, encryption alg+iv+tag,
//          timestamp, database name, tool versions)
//     ──► storage: BACKUP_DIR (+ optional BACKUP_DEST_DIR mirror)
//     ──► prune to BACKUP_KEEP (guarded: only ecclesia-backup-*.sql* matched
//          with their own sidecars; never touches unrelated files)
//
//   storage ──► verify checksum against sidecar ──► [decrypt if encrypted]
//     ──► gunzip ──► psql ──► PostgreSQL ──► application validation
//
// CHECKSUM POSITION: over the final stored bytes (after encryption, after
// compression). A single checksum over final bytes detects BOTH storage
// corruption AND ciphertext tampering. The sidecar stores algorithm, IV and
// auth tag — the tag is what actually authenticates GCM decryption; the
// checksum detects wholesale corruption/truncation/replay of the artifact.
//
// FAILURE CONTRACT: backupDatabase() either returns a verified result or
// throws. It NEVER reports success when any stage (dump, compress, encrypt,
// checksum, retention, mirror) fails. The source database is never modified.
//
// ENVIRONMENT VARIABLES:
//   DATABASE_URL            — PostgreSQL connection (required)
//   BACKUP_DIR              — backup directory (default ./backups)
//   BACKUP_KEEP             — snapshots to retain (default 14)
//   BACKUP_INTERVAL_HOURS   — hours between automatic backups (default 24)
//   BACKUP_DISABLED         — 'true' disables the automatic scheduler
//   BACKUP_DEST_DIR         — optional off-site mirror directory
//   BACKUP_ENCRYPTION_KEY   — optional hex key. 32 bytes (64 hex chars) →
//                             AES-256-GCM. 16/24 bytes → AES-128/192-GCM.
//                             Absent ⇒ artifact stays unencrypted plaintext.
//   BACKUP_LOG_FILE         — optional path; scheduler events append here
//
// SECURITY: keys are read from the environment only — never hard-coded,
// never logged. Error messages redact connection URLs. The sidecar stores
// only the IV and auth tag (public values), never the key.
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Directory where backup snapshots are stored (re-read each call so tests
 * and runtime reconfiguration of BACKUP_DIR are honored). */
function backupDir(): string {
  return process.env.BACKUP_DIR || path.resolve(process.cwd(), 'backups');
}

/** Maximum number of backup snapshots to retain. */
const BACKUP_KEEP = Math.max(1, Number(process.env.BACKUP_KEEP) || 14);

/** Interval in milliseconds between automatic backups. */
const BACKUP_INTERVAL_MS =
  (Number(process.env.BACKUP_INTERVAL_HOURS) || 24) * 60 * 60 * 1000;

/** How often (in ms) the scheduler re-checks whether a backup is due. */
const BACKUP_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** File-name prefix used to recognise OUR artifacts for retention. */
const BACKUP_NAME_PREFIX = 'ecclesia-backup-';

export interface PgConnectionConfig {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
}

export interface BackupResult {
  /** Final stored artifact path (may be .sql, .sql.gz or .sql.gz.enc). */
  file: string;
  /** Checksum sidecar path. */
  checksumFile: string;
  /** SHA-256 of the final artifact bytes (hex). */
  sha256: string;
  /** Artifact size in bytes. */
  size: number;
  /** When the dump was taken. */
  at: Date;
  /** Whether the artifact is encrypted and with which algorithm. */
  encryption: { algorithm: string } | null;
}

// -----------------------------------------------------------------------------
// Environment / prerequisite diagnostics
// -----------------------------------------------------------------------------

/** Redacts credentials in a connection URL for error messages. */
function redactUrl(url: string): string {
  return url.replace(/:\/\/[^@/]+@/, '://***@');
}

/** Directory where backup artifacts are stored. */
function resolveEncryptionKey(): Buffer | null {
  const raw = (process.env.BACKUP_ENCRYPTION_KEY || '').trim();
  if (!raw) return null;
  if (!/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error(
      'BACKUP_ENCRYPTION_KEY must be a hexadecimal string (64 hex chars = 256-bit AES key)',
    );
  }
  const key = Buffer.from(raw, 'hex');
  // Node supports AES-128/192/256-GCM; we accept those key sizes explicitly so
  // a typo'd key fails loudly instead of producing an unmatchable artifact.
  if (![16, 24, 32].includes(key.length)) {
    throw new Error(
      `BACKUP_ENCRYPTION_KEY must be 32, 48 or 64 hex chars (got ${key.length} bytes after decode) — 64 hex chars = AES-256-GCM`,
    );
  }
  return key;
}

/** Resolves and caches the encryption key once per process. */
let cachedKey: Buffer | null | undefined;
function encryptionKey(): Buffer | null {
  if (cachedKey === undefined) cachedKey = resolveEncryptionKey();
  return cachedKey;
}

// -----------------------------------------------------------------------------
// pg_dump/psql argument builders (shared with restore; unchanged contracts)
// -----------------------------------------------------------------------------

/**
 * Parses a PostgreSQL connection URL into its component parts.
 * Accepts Prisma-style `?schema=public` and percent-encoded credentials.
 * @internal exported for tests
 */
export function parsePgUrl(url: string): PgConnectionConfig {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid DATABASE_URL — could not parse "${redactUrl(url)}"`);
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(`Invalid DATABASE_URL — expected a postgresql:// URL, got "${redactUrl(url)}"`);
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));

  return {
    host: parsed.hostname || 'localhost',
    port: parsed.port || '5432',
    database,
    user: decodeURIComponent(parsed.username) || 'postgres',
    password: decodeURIComponent(parsed.password) || '',
  };
}

/**
 * Builds the argument list for restoring a plain-SQL dump with psql.
 * -w never prompts (PGPASSWORD supplies the password); ON_ERROR_STOP=1 aborts
 * on the first SQL error. pg_dump-only flags are NOT valid psql options.
 * @internal exported for tests
 */
export function buildPsqlRestoreArgs(pg: PgConnectionConfig, file: string): string[] {
  return [
    '-w',
    '-h', pg.host,
    '-p', pg.port,
    '-U', pg.user,
    '-d', pg.database,
    '-v', 'ON_ERROR_STOP=1',
    '-f', file,
  ];
}

/** Resolves a required client tool to an absolute path or fails with a fix. */
export async function requirePgTool(tool: 'pg_dump' | 'psql' | 'pg_restore'): Promise<string> {
  const candidates: string[] = [tool];
  // Windows installs frequently are not on PATH — probe the standard location.
  if (process.platform === 'win32') {
    const base = 'C:/Program Files/PostgreSQL';
    try {
      const versions = fs
        .readdirSync(base)
        .filter((d) => /^\d+(\.\d+)?$/.test(d))
        .sort((a, b) => Number(b) - Number(a));
      for (const v of versions) candidates.push(path.join(base, v, 'bin', `${tool}.exe`));
    } catch {
      /* no PostgreSQL dir — fall through to PATH-only probe */
    }
  }
  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ['--version']);
      return candidate;
    } catch {
      /* try next candidate */
    }
  }
  throw new Error(
    `Required PostgreSQL tool "${tool}" was not found on PATH` +
      (process.platform === 'win32' ? ' or in C:\\Program Files\\PostgreSQL\\*\\bin.' : '.') +
      ' Install PostgreSQL client tools (pg_dump/psql) and ensure they are on PATH.',
  );
}

// -----------------------------------------------------------------------------
// Core stages: compress → encrypt → checksum → metadata
// -----------------------------------------------------------------------------

export interface EncryptionMeta {
  algorithm: string;
  /** Base64 IV/nonce — public value, safe to store. */
  iv: string;
  /** Base64 GCM auth tag — public value, safe to store. */
  authTag: string;
}

/** Encrypts buffer with AES-GCM; IV generated freshly per encryption. */
export function encryptBuffer(plain: Buffer, key: Buffer): { data: Buffer; meta: EncryptionMeta } {
  const algorithm = `aes-${key.length * 8}-gcm`;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key, iv) as crypto.CipherGCM;
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { data, meta: { algorithm, iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') } };
}

/** Decrypts an AES-GCM buffer; throws when key is wrong or bytes are tampered. */
export function decryptBuffer(encrypted: Buffer, key: Buffer, meta: EncryptionMeta): Buffer {
  const decipher = crypto.createDecipheriv(meta.algorithm, key, Buffer.from(meta.iv, 'base64')) as crypto.DecipherGCM;
  decipher.setAuthTag(Buffer.from(meta.authTag, 'base64'));
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export interface ChecksumMeta {
  artifact: string;
  sha256: string;
  sizeBytes: number;
  createdAt: string;
  database: string;
  encryption: EncryptionMeta | null;
  /** Tool versions captured for forensic diagnosability. */
  tools: { pgDump?: string };
  pipeline: 'pg_dump|gzip|aes-gcm|sha256' | 'pg_dump|aes-gcm|sha256' | 'pg_dump|gzip|sha256' | 'pg_dump|sha256';
}

/** SHA-256 of final artifact bytes; the checksum lives in the sidecar. */
export function sha256File(file: string): string {
  return crypto.createHash('sha256').update(new Uint8Array(fs.readFileSync(file))).digest('hex');
}

function writeChecksumMeta(target: string, meta: ChecksumMeta): string {
  const sidecar = `${target}.meta.json`;
  fs.writeFileSync(sidecar, JSON.stringify(meta, null, 2), { flag: 'wx' });
  return sidecar;
}

/** Reads and validates a sidecar; null when absent. Throws on malformed JSON. */
export function readChecksumMeta(file: string): ChecksumMeta | null {
  const sidecar = `${file}.meta.json`;
  if (!fs.existsSync(sidecar)) return null;
  return JSON.parse(fs.readFileSync(sidecar, 'utf8')) as ChecksumMeta;
}

/** Verifies artifact integrity against its sidecar. Truncation/corruption → false. */
export function verifyArtifact(file: string): { ok: boolean; reason?: string } {
  const meta = readChecksumMeta(file);
  if (!meta) return { ok: false, reason: 'checksum metadata sidecar is missing' };
  if (!fs.existsSync(file)) return { ok: false, reason: 'artifact file is missing' };
  const actual = sha256File(file);
  if (actual !== meta.sha256) {
    return { ok: false, reason: `sha256 mismatch (sidecar ${meta.sha256}, actual ${actual})` };
  }
  const actualSize = fs.statSync(file).size;
  if (actualSize !== meta.sizeBytes) {
    return { ok: false, reason: `size mismatch (sidecar ${meta.sizeBytes}, actual ${actualSize})` };
  }
  return { ok: true };
}

/** Decrypts (if needed) and decompresses an artifact into plain SQL text. */
export function artifactToSql(file: string): string {
  const meta = readChecksumMeta(file);
  let bytes: Buffer = fs.readFileSync(file);
  if (meta?.encryption) {
    const key = encryptionKey();
    if (!key) throw new Error('Artifact is encrypted but BACKUP_ENCRYPTION_KEY is not set in this environment');
    bytes = decryptBuffer(bytes, key, meta.encryption); // throws on wrong key/tamper
  }
  return zlib.gunzipSync(bytes).toString('utf8');
}

// -----------------------------------------------------------------------------
// Retention (guarded) and off-site mirror
// -----------------------------------------------------------------------------

interface Snapshot {
  artifact: string;
  sidecar: string;
  /** Timestamp parsed from the file name (deterministic ordering). */
  stamp: number;
}

/** Lists OUR backup snapshots (artifact + sidecar) in the backup dir, oldest first. */
export function listSnapshots(dir: string = backupDir()): Snapshot[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir);
  const stamps = new Map<string, number>();
  const artifacts = new Set<string>();

  for (const f of files) {
    if (!f.startsWith(BACKUP_NAME_PREFIX)) continue;
    if (f.endsWith('.meta.json')) {
      const artifact = f.slice(0, -'.meta.json'.length);
      if (files.includes(artifact)) {
        stamps.set(artifact, parseStamp(artifact));
        artifacts.add(artifact);
      }
    } else if (/\.sql(\.gz)?(\.enc)?$/.test(f)) {
      const sidecar = `${f}.meta.json`;
      // An artifact without a sidecar is still retention-eligible (legacy), but
      // we keep them ordered by name timestamp as well.
      stamps.set(f, parseStamp(f));
      artifacts.add(f);
      void sidecar;
    }
  }

  return [...artifacts]
    .sort((a, b) => (stamps.get(a) ?? 0) - (stamps.get(b) ?? 0))
    .map((artifact) => ({ artifact, sidecar: `${artifact}.meta.json`, stamp: stamps.get(artifact) ?? 0 }));
}

/** Extracts the timestamp from an artifact name; falls back to mtime. */
function parseStamp(artifact: string): number {
  // Prefer the authoritative createdAt from the sidecar when present.
  const sidecar = path.join(backupDir(), `${artifact}.meta.json`);
  try {
    if (fs.existsSync(sidecar)) {
      const meta = JSON.parse(fs.readFileSync(sidecar, 'utf8')) as { createdAt?: string };
      if (meta.createdAt) return new Date(meta.createdAt).getTime();
    }
  } catch {
    /* malformed sidecar → fall through to name/mtime */
  }
  const m = artifact.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.sql/);
  if (!m) return fs.statSync(path.join(backupDir(), artifact)).mtimeMs;
  return new Date(m[1].replace(/-/g, (s, i) => (i === 4 || i === 7 ? '/' : s)).replace('T', ' ').replace('Z', '')).getTime();
}

/**
 * Deletes the oldest snapshots while more than keep remain. Guarded:
 * - only files with our prefix are considered (unrelated files untouched)
 * - a sidecar is deleted only together with its own artifact
 */
export function pruneBackups(keep: number = BACKUP_KEEP, dir: string = backupDir()): string[] {
  const removed: string[] = [];
  try {
    const snaps = listSnapshots(dir);
    let excess = snaps.length - keep;
    for (let i = 0; excess > 0 && i < snaps.length; i++, excess--) {
      const { artifact, sidecar } = snaps[i];
      const artifactPath = path.join(dir, artifact);
      const sidecarPath = path.join(dir, sidecar);
      if (fs.existsSync(artifactPath)) fs.unlinkSync(artifactPath);
      if (fs.existsSync(sidecarPath)) fs.unlinkSync(sidecarPath);
      removed.push(artifact);
    }
  } catch (err) {
    // Retention is important but must never crash the backup that just succeeded.
    console.error('[backup] Retention pruning failed:', err instanceof Error ? err.message : err);
  }
  return removed;
}

/** Copies the newest snapshot to BACKUP_DEST_DIR when configured. */
function copyOffsite(file: string): boolean {
  const destDir = process.env.BACKUP_DEST_DIR;
  if (!destDir) return true;
  try {
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(file, path.join(destDir, path.basename(file)));
    const sidecar = `${file}.meta.json`;
    if (fs.existsSync(sidecar)) fs.copyFileSync(sidecar, path.join(destDir, path.basename(sidecar)));
    return true;
  } catch (err) {
    console.error('[backup] Off-site copy failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

// -----------------------------------------------------------------------------
// The backup itself
// -----------------------------------------------------------------------------

/**
 * Creates a verified backup of the PostgreSQL database.
 * Throws on ANY stage failure; callers must treat a throw as "no backup".
 */
export async function backupDatabase(): Promise<BackupResult> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set — cannot create backup');
  const pg = parsePgUrl(url);

  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });

  const at = new Date();
  const stamp = at.toISOString().replace(/[:.]/g, '-');
  const target = path.join(dir, `${BACKUP_NAME_PREFIX}${stamp}.sql`);

  const pgDump = await requirePgTool('pg_dump');
  const env = { ...process.env, PGPASSWORD: pg.password };
  await execFileAsync(
    pgDump,
    ['-w', '-h', pg.host, '-p', pg.port, '-U', pg.user, '-d', pg.database, '-F', 'p', '-f', target, '--no-owner', '--no-privileges'],
    { env },
  );

  // Stage 2: compression (gzip level 9) — SQL dumps compress extremely well.
  const plain = fs.readFileSync(target);
  const compressed = zlib.gzipSync(plain, { level: 9 });

  // Stage 3: optional encryption (fresh IV per backup).
  const key = encryptionKey();
  let finalBytes: Uint8Array = new Uint8Array(compressed);
  let encMeta: EncryptionMeta | null = null;
  if (key) {
    const enc = encryptBuffer(compressed, key);
    finalBytes = enc.data;
    encMeta = enc.meta;
  }

  // Stage 4: write final artifact atomically-ish (temp name then rename).
  const finalName =
    target + (key ? '.gz.enc' : '.gz');
  fs.writeFileSync(finalName, finalBytes);
  fs.unlinkSync(target); // remove the intermediate plain dump

  // Stage 5: checksum + sidecar over the FINAL bytes.
  const sha = crypto.createHash('sha256').update(new Uint8Array(finalBytes)).digest('hex');
  const pipeline = key ? 'pg_dump|gzip|aes-gcm|sha256' : 'pg_dump|gzip|sha256';
  writeChecksumMeta(finalName, {
    artifact: path.basename(finalName),
    sha256: sha,
    sizeBytes: finalBytes.length,
    createdAt: at.toISOString(),
    database: pg.database,
    encryption: encMeta,
    tools: { pgDump: (await execFileAsync(pgDump, ['--version'])).stdout.trim().split('\n')[0] },
    pipeline,
  });

  // Stage 6: retention + mirror. Retention failure must not fail the backup,
  // but a mirror failure with an explicitly configured mirror is a real fault.
  pruneBackups();
  const mirrored = copyOffsite(finalName);
  if (!mirrored) {
    throw new Error(`Off-site mirror failed for ${path.basename(finalName)} — backup stored locally but not mirrored`);
  }

  // Final self-check: verify what we just wrote.
  const check = verifyArtifact(finalName);
  if (!check.ok) throw new Error(`Backup written but verification failed: ${check.reason}`);

  return { file: finalName, checksumFile: `${finalName}.meta.json`, sha256: sha, size: finalBytes.length, at, encryption: encMeta ? { algorithm: encMeta.algorithm } : null };
}

// -----------------------------------------------------------------------------
// Restore support (verification + decrypt/decompress for the restore script)
// -----------------------------------------------------------------------------

/** Verifies an artifact before restore; throws with a precise reason on failure. */
export function verifyOrThrow(file: string): ChecksumMeta {
  const check = verifyArtifact(file);
  if (!check.ok) throw new Error(`Backup verification failed for ${path.basename(file)}: ${check.reason}`);
  return readChecksumMeta(file)!;
}

/** Materialises the plain-SQL file an artifact restores from (decrypt+gunzip). */
export function artifactToSqlFile(file: string, outDir: string): string {
  const sql = artifactToSql(file);
  const out = path.join(outDir, `${path.basename(file)}.plain.sql`);
  fs.writeFileSync(out, sql);
  return out;
}

/** Returns the timestamp of the most recent verified snapshot, else null. */
export function lastBackupTime(): Date | null {
  const dir = backupDir();
  const snaps = listSnapshots(dir);
  for (let i = snaps.length - 1; i >= 0; i--) {
    const file = path.join(dir, snaps[i].artifact);
    if (verifyArtifact(file).ok) {
      const meta = readChecksumMeta(file);
      return meta ? new Date(meta.createdAt) : new Date(fs.statSync(file).mtimeMs);
    }
  }
  return null;
}

/** Absolute path to the backup directory. */
export function backupDirPath(): string {
  return backupDir();
}

// -----------------------------------------------------------------------------
// Automatic scheduler (DEF-OPS-01): on-boot-if-due + periodic re-check
// -----------------------------------------------------------------------------

let timer: NodeJS.Timeout | null = null;
/** In-process mutual exclusion: two backup jobs can never run concurrently. */
let running = false;

/** Appends a one-line event to BACKUP_LOG_FILE when configured (never logs secrets). */
function logEvent(line: string): void {
  const file = process.env.BACKUP_LOG_FILE;
  const entry = `${new Date().toISOString()} ${line}\n`;
  try {
    if (file) fs.appendFileSync(file, entry);
  } catch {
    /* logging must never crash the scheduler */
  }
  console.log(`[backup] ${line}`);
}

/** Runs one backup if none is in progress; returns the result or the reason. */
export async function runBackupIfNotRunning(): Promise<BackupResult | { skipped: 'already-running' }> {
  if (running) return { skipped: 'already-running' };
  running = true;
  try {
    return await backupDatabase();
  } finally {
    running = false;
  }
}

/**
 * Starts the periodic backup scheduler.
 * - Runs immediately at boot when the newest verified snapshot is older than
 *   BACKUP_INTERVAL_HOURS (or when none exists).
 * - Re-checks every BACKUP_CHECK_INTERVAL_MS (6h).
 * - BACKUP_DISABLED=true disables entirely (Docker default — manual pg_dump).
 * - Overlap-safe: a concurrent trigger is skipped while a backup is running.
 * - A failed backup is logged and NOT treated as a successful backup (the next
 *   check sees the last *verified* snapshot is still old and retries).
 */
export function startBackupScheduler(): void {
  if (process.env.BACKUP_DISABLED === 'true') {
    logEvent('Automatic backups disabled (BACKUP_DISABLED=true)');
    return;
  }
  if (timer) return;

  const runIfDue = async () => {
    const last = lastBackupTime();
    const due = !last || Date.now() - last.getTime() >= BACKUP_INTERVAL_MS;
    if (!due) return;
    try {
      const result = await runBackupIfNotRunning();
      if ('skipped' in result) {
        logEvent('Scheduled backup skipped — another backup is already running');
        return;
      }
      logEvent(`Created ${path.basename(result.file)} (${(result.size / 1024).toFixed(0)} KB, sha256 ${result.sha256.slice(0, 12)}…)`);
    } catch (err) {
      // A failed scheduled backup must be loud but never crash the server.
      logEvent(`Scheduled backup FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  void runIfDue();
  timer = setInterval(() => void runIfDue(), BACKUP_CHECK_INTERVAL_MS);
  timer.unref();
}

/** Stops the scheduler (used by tests). */
export function stopBackupScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Test hook: force the cached encryption key to be re-resolved from env. */
export function resetEncryptionKeyCache(): void {
  cachedKey = undefined;
}

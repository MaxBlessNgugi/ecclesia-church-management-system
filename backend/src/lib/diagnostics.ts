// =============================================================================
// Support diagnostics
// -----------------------------------------------------------------------------
// One endpoint (`GET /api/admin/diagnostics`) that lets a support engineer see
// the health of a deployment without access to the machine: version, uptime,
// DB file size/location, per-table row counts, last backup, and disk space.
// No secrets are included.
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { appPrisma } from './prisma.js';
import { dbFilePath, lastBackupTime, backupDirPath } from './backup.js';
import { appVersion } from './export.js';

const COUNT_MODELS = [
  'user',
  'christian',
  'contribution',
  'transfer',
  'billedItem',
  'death',
  'deposit',
  'creditor',
  'debtor',
  'expense',
  'ledger',
  'ledgerMovement',
  'inventoryItem',
  'delivery',
  'sale',
  'stockTake',
  'stockIssue',
  'employee',
  'auditLog',
] as const;

export interface DiagnosticsInfo {
  timestamp: string;
  appVersion: string;
  nodeVersion: string;
  platform: string;
  uptimeSeconds: number;
  env: { nodeEnv: string | undefined; port: string | undefined };
  db: {
    path: string;
    exists: boolean;
    sizeBytes: number | null;
    freeBytes: number | null;
  };
  rowCounts: Record<string, number>;
  backups: { dir: string; last: string | null; count: number };
}

export async function collectDiagnostics(): Promise<DiagnosticsInfo> {
  const dbPath = dbFilePath();
  let sizeBytes: number | null = null;
  let exists = false;
  let freeBytes: number | null = null;

  try {
    exists = fs.existsSync(dbPath);
    if (exists) sizeBytes = fs.statSync(dbPath).size;
  } catch {
    /* report as missing */
  }
  try {
    const s = fs.statfsSync(path.dirname(dbPath));
    freeBytes = s.bavail * s.bsize;
  } catch {
    freeBytes = os.freemem();
  }

  const rowCounts: Record<string, number> = {};
  for (const model of COUNT_MODELS) {
    try {
      rowCounts[model] = await (appPrisma as any)[model].count();
    } catch {
      rowCounts[model] = -1;
    }
  }

  let backupCount = 0;
  try {
    backupCount = fs.readdirSync(backupDirPath()).filter((f) => f.endsWith('.db')).length;
  } catch {
    backupCount = 0;
  }

  return {
    timestamp: new Date().toISOString(),
    appVersion: appVersion(),
    nodeVersion: process.version,
    platform: `${os.platform()} ${os.arch()}`,
    uptimeSeconds: Math.round(process.uptime()),
    env: { nodeEnv: process.env.NODE_ENV, port: process.env.PORT },
    db: { path: dbPath, exists, sizeBytes, freeBytes },
    rowCounts,
    backups: {
      dir: backupDirPath(),
      last: lastBackupTime()?.toISOString() ?? null,
      count: backupCount,
    },
  };
}

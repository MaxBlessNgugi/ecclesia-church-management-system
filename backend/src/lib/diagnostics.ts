// =============================================================================
// Support diagnostics
// ---------------------------------------------------------------------------
// One endpoint (`GET /api/admin/diagnostics`) that lets a support engineer see
// the health of a deployment without access to the machine: version, uptime,
// DB connectivity, per-table row counts, last backup, and memory.
// No secrets are included.
// =============================================================================
import fs from 'node:fs';
import os from 'node:os';
import { appPrisma } from './prisma.js';
import { lastBackupTime, backupDirPath } from './backup.js';
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
  'inventoryPriceAuditLog',
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
    connected: boolean;
    provider: string;
    freeBytes: number | null;
  };
  rowCounts: Record<string, number>;
  backups: { dir: string; last: string | null; count: number };
}

export async function collectDiagnostics(): Promise<DiagnosticsInfo> {
  // Check database connectivity
  let connected = false;
  try {
    await appPrisma.$queryRaw`SELECT 1`;
    connected = true;
  } catch {
    /* DB unreachable */
  }

  const freeBytes = os.freemem();

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
    backupCount = fs.readdirSync(backupDirPath()).filter((f) => f.endsWith('.sql')).length;
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
    db: { connected, provider: 'postgresql', freeBytes },
    rowCounts,
    backups: {
      dir: backupDirPath(),
      last: lastBackupTime()?.toISOString() ?? null,
      count: backupCount,
    },
  };
}

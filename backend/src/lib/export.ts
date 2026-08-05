// =============================================================================
// Data export / import (the parish "exit path")
// -----------------------------------------------------------------------------
// exportAllData() serializes every table into one JSON document with secrets
// stripped (password hashes, reset tokens) and M-Pesa credentials masked.
// importAllData() replaces the entire database from such a document inside a
// single transaction — used for restoring a parish's data onto a fresh install.
// toCsv() renders any row set as CSV for spreadsheet-friendly handover.
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from './prisma.js';

export interface ExportBundle {
  exportedAt: string;
  appVersion: string;
  tables: Record<string, unknown[]>;
}

const TABLE_ORDER: readonly string[] = [
  'user',
  'panelPermissions',
  'pushPaymentSettings',
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
];

/** Masks a user row: secrets must never leave the server. */
function safeUser(u: Record<string, unknown>): Record<string, unknown> {
  const { passwordHash, resetTokenHash, ...rest } = u;
  return rest;
}

/** Masks stored gateway credentials on export. */
function safePushSettings(p: Record<string, unknown>): Record<string, unknown> {
  const { consumerKey, consumerSecret, ...rest } = p;
  return {
    ...rest,
    consumerKey: consumerKey ? '***' : '',
    consumerSecret: consumerSecret ? '***' : '',
  };
}

export function appVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Reads every table (including soft-deleted rows) into a JSON bundle. */
export async function exportAllData(): Promise<ExportBundle> {
  const rows = await Promise.all(
    TABLE_ORDER.map(async (table) => [table, await (prisma as any)[table].findMany()] as const),
  );

  const tables: Record<string, unknown[]> = {};
  for (const [table, data] of rows) {
    if (table === 'user') tables[table] = data.map(safeUser);
    else if (table === 'pushPaymentSettings') tables[table] = data.map(safePushSettings);
    else tables[table] = data;
  }

  return {
    exportedAt: new Date().toISOString(),
    appVersion: appVersion(),
    tables,
  };
}

/** Renders an array of objects as CSV (quotes cells containing commas/quotes/newlines). */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const esc = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : String(typeof v === 'object' ? JSON.stringify(v) : v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = keys.join(',');
  const body = rows.map((r) => keys.map((k) => esc(r[k])).join(','));
  return [header, ...body].join('\n');
}

/**
 * Destructive full-database import. Wipes all tables, then re-inserts the
 * bundle's data in FK-safe order inside one transaction. Callers MUST be
 * super_admin and confirm via `{ confirm: true }`.
 */
export async function importAllData(bundle: ExportBundle): Promise<number> {
  const tables = bundle.tables ?? {};
  const insert = async (table: string) => {
    const rows = tables[table];
    if (!Array.isArray(rows) || rows.length === 0) return 0;
    const res = await (prisma as any)[table].createMany({ data: rows });
    return res.count ?? rows.length;
  };

  const total = await prisma.$transaction(async () => {
    let count = 0;
    for (const table of TABLE_ORDER) {
      await (prisma as any)[table].deleteMany();
    }
    for (const table of TABLE_ORDER) {
      count += await insert(table);
    }
    return count;
  });

  return total;
}

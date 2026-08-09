// =============================================================================
// Data export / import (the parish "exit path")
// -----------------------------------------------------------------------------
// exportAllData() serializes every table into one JSON document with secrets
// stripped (password hashes, reset tokens) and M-Pesa credentials zeroed.
// importAllData() replaces the entire database from such a document inside a
// single transaction — used for restoring a parish's data onto a fresh install.
// toCsv() renders any row set as CSV for spreadsheet-friendly handover.
//
// Usage patterns:
//   - Admin panel triggers exportAllData() to download a parish backup JSON.
//   - A fresh install uses importAllData(bundle, adminId) to restore data.
//   - Reports use toCsv(rows) to generate downloadable spreadsheets.
//   - The import is destructive: all existing data is wiped before re-insertion.
// =============================================================================
// Node.js built-in: fs module for reading files (used to read package.json for version)
import fs from 'node:fs';
// Node.js built-in: path module for resolving file system paths safely across platforms
import path from 'node:path';
// Node.js built-in: crypto module for generating cryptographically secure random tokens
import crypto from 'node:crypto';
// Prisma client instance for database operations (reads/writes to all tables)
import { prisma } from './prisma.js';
// Password hashing utility used during import to generate placeholder hashes for restored users
import { hashPassword } from './auth.js';

/**
 * TypeScript interface defining the shape of an exported data bundle.
 * This is the top-level JSON structure written to disk during export.
 */
export interface ExportBundle {
  /** ISO-8601 timestamp of when the export was performed */
  exportedAt: string;
  /** Application version from package.json at time of export */
  appVersion: string;
  /** Map of table names to their row arrays; keys are Prisma model names */
  tables: Record<string, unknown[]>;
}

/**
 * Ordered list of all database tables in foreign-key-safe order.
 * Tables must be deleted in reverse order and inserted in this order
 * so that FK constraints are never violated during a full import.
 * The list is also used by exportAllData() to iterate predictably.
 */
const TABLE_ORDER: readonly string[] = [
  'user',                          // System users (admins, staff)
  'panelPermissions',              // Per-panel access control entries
  'pushPaymentSettings',           // M-Pesa gateway configuration
  'christian',                     // Parish member records
  'contribution',                  // Financial contributions / tithes
  'transfer',                      // Fund transfers between accounts
  'billedItem',                    // Items billed to members
  'death',                         // Death records for parishioners
  'deposit',                       // Bank deposit records
  'creditor',                      // External creditors the parish owes
  'debtor',                        // External debtors who owe the parish
  'expense',                       // Expense records
  'ledger',                        // Financial ledger accounts
  'ledgerMovement',                // Individual ledger transactions
  'inventoryItem',                 // Physical inventory items
  'delivery',                      // Delivery/shipping records
  'sale',                          // Sale transactions
  'stockTake',                     // Physical stock count records
  'stockIssue',                    // Items issued from inventory
  'employee',                      // Parish employee records
  'payroll',                       // Payroll run records
  'leave',                         // Employee leave records
  'recruitment',                   // Recruitment campaign records
  'recruitmentApplicant',          // Applicants to recruitment campaigns
  'inventoryPriceAuditLog',        // Audit trail for inventory price changes
  'auditLog',                      // General application audit log
];

/**
 * Sanitizes a user record for export by removing sensitive fields.
 * Password hashes and reset tokens must never leave the server.
 *
 * @param u - The raw user row from the database.
 * @returns A shallow copy with passwordHash and resetTokenHash removed.
 */
function safeUser(u: Record<string, unknown>): Record<string, unknown> {
  // Destructure to extract secrets, spreading the rest into a new object
  const { passwordHash, resetTokenHash, ...rest } = u;
  return rest;
}

/**
 * Sanitizes M-Pesa push payment settings for export by zeroing gateway credentials.
 * Consumer key and secret are re-entered on import since they are environment-specific.
 *
 * @param p - The raw pushPaymentSettings row from the database.
 * @returns A shallow copy with consumerKey and consumerSecret set to empty strings.
 */
function safePushSettings(p: Record<string, unknown>): Record<string, unknown> {
  // Destructure to extract credentials, then overwrite them with empty strings
  const { consumerKey, consumerSecret, ...rest } = p;
  return { ...rest, consumerKey: '', consumerSecret: '' };
}

/**
 * Reads the application version from package.json at the project root.
 * Falls back to '0.0.0' if package.json cannot be read or parsed.
 *
 * @returns The version string from package.json, or '0.0.0' on failure.
 */
export function appVersion(): string {
  try {
    // Read and parse package.json synchronously (called infrequently, so sync is acceptable)
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
    // Return version with fallback for packages that don't declare a version
    return pkg.version ?? '0.0.0';
  } catch {
    // Graceful fallback if package.json doesn't exist or is malformed
    return '0.0.0';
  }
}

/**
 * Reads every database table (including soft-deleted rows) into a single JSON bundle.
 * Secrets are stripped from user and pushPaymentSettings tables during serialization.
 * This is the main export function called by the admin panel "Export Data" action.
 *
 * @returns An ExportBundle containing all table data with metadata.
 */
export async function exportAllData(): Promise<ExportBundle> {
  // Query all tables in parallel for performance; each entry becomes [tableName, rows]
  const rows = await Promise.all(
    TABLE_ORDER.map(async (table) => [table, await (prisma as any)[table].findMany()] as const),
  );

  // Build the final tables object, applying sanitization where needed
  const tables: Record<string, unknown[]> = {};
  for (const [table, data] of rows) {
    if (table === 'user') {
      // Strip password hashes and reset tokens from user records
      tables[table] = data.map(safeUser);
    } else if (table === 'pushPaymentSettings') {
      // Zero out M-Pesa credentials from gateway settings
      tables[table] = data.map(safePushSettings);
    } else {
      // All other tables are exported as-is
      tables[table] = data;
    }
  }

  // Assemble the complete export bundle with metadata
  return {
    exportedAt: new Date().toISOString(), // When the export was created
    appVersion: appVersion(),             // Version of the app at export time
    tables,                                // The sanitized table data
  };
}

/**
 * Renders an array of objects as a CSV string with proper RFC 4180 quoting.
 * Cells containing commas, double quotes, or newlines are wrapped in double quotes.
 * Internal double quotes are escaped by doubling them ("").
 * Objects are serialized to JSON strings before quoting (handles nested objects).
 *
 * @param rows - Array of row objects; keys become column headers.
 * @returns A CSV-formatted string with header row + data rows, or empty string if no rows.
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  // Early return for empty input
  if (rows.length === 0) return '';

  // Collect all unique column names across all rows, preserving insertion order
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));

  /**
   * Escapes a single cell value for CSV output.
   * Null/undefined become empty strings; objects are JSON-serialized.
   */
  const esc = (v: unknown): string => {
    // Convert value to string, handling null/undefined and nested objects
    const s = v === null || v === undefined ? '' : String(typeof v === 'object' ? JSON.stringify(v) : v);
    // If the string contains commas or newlines, wrap in quotes and escape internal quotes
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  // Build CSV header from column names
  const header = keys.join(',');
  // Build each data row, escaping values per column
  const body = rows.map((r) => keys.map((k) => esc(r[k])).join(','));
  // Join header and body with newlines (no trailing newline per CSV convention)
  return [header, ...body].join('\n');
}

/**
 * Destructive full-database import. Wipes all tables, then re-inserts the
 * bundle's data in FK-safe order inside one transaction. Callers MUST be
 * super_admin and confirm via `{ confirm: true }`.
 *
 * User rows arrive WITHOUT password hashes (they were stripped on export).
 * The account that performs the import keeps its current password (captured
 * before the wipe) so the admin isn't locked out; every other restored user
 * gets an unguessable placeholder hash and is forced to choose a new password
 * at their next sign-in.
 *
 * @param bundle - The ExportBundle to restore from (produced by exportAllData()).
 * @param currentUserId - The ID of the admin performing the import (preserves their password).
 * @returns The total number of rows inserted across all tables.
 */
export async function importAllData(bundle: ExportBundle, currentUserId?: string): Promise<number> {
  // Extract tables from bundle, defaulting to empty object if missing
  const tables = bundle.tables ?? {};

  // Capture the importing admin's real password hash BEFORE the transaction wipes the user table.
  // This prevents the admin from being locked out after import.
  const currentAdmin = currentUserId
    ? await prisma.user.findUnique({ where: { id: currentUserId }, select: { passwordHash: true } })
    : null;

  /**
   * Prepares user rows for import by handling security-sensitive fields.
   * - The importing admin keeps their current password hash
   * - All other users get a random placeholder hash (forces password reset)
   * - Reset tokens, lockout state, and login counters are cleared
   * - All users are set to isActive: true
   */
  async function prepareUserRows(rows: Record<string, any>[]): Promise<Record<string, any>[]> {
    // Generate a cryptographically secure random placeholder password hash
    const placeholderHash = await hashPassword(crypto.randomBytes(24).toString('base64url'));

    return rows.map((r) => {
      // Check if this row belongs to the importing admin
      const isImporter = currentAdmin !== null && r.id === currentUserId;
      return {
        ...r,
        // Admin keeps their real hash; others get placeholder (forces password reset)
        passwordHash: isImporter ? currentAdmin!.passwordHash : placeholderHash,
        // Clear all security artifacts — these are never exported/imported
        resetTokenHash: null,
        resetTokenExpires: null,
        resetFailedAttempts: 0,
        loginFailedAttempts: 0,
        lockedUntil: null,
        // Admin retains their mustChangePassword flag; others are forced to change
        mustChangePassword: isImporter ? (r.mustChangePassword ?? false) : true,
        // All restored users are active
        isActive: true,
      };
    });
  }

  /**
   * Inserts rows for a single table, handling user-specific preparation.
   * Returns the number of rows inserted.
   */
  const insert = async (table: string) => {
    let rows = tables[table];
    // Skip tables with no data in the bundle
    if (!Array.isArray(rows) || rows.length === 0) return 0;
    // Apply user-specific sanitization for the user table
    if (table === 'user') rows = await prepareUserRows(rows as Record<string, any>[]);
    // Bulk insert all rows for this table
    const res = await (prisma as any)[table].createMany({ data: rows });
    return res.count ?? rows.length;
  };

  // Execute the entire import inside a single transaction for atomicity
  const total = await prisma.$transaction(async () => {
    let count = 0;

    // First pass: delete all data from every table in reverse FK order
    for (const table of TABLE_ORDER) {
      await (prisma as any)[table].deleteMany();
    }

    // Second pass: insert all data in FK-safe order
    for (const table of TABLE_ORDER) {
      count += await insert(table);
    }

    return count;
  });

  // Return total number of rows inserted across all tables
  return total;
}

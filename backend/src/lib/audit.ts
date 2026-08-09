// =============================================================================
// Soft-delete + audit logging service
// -----------------------------------------------------------------------------
// Central home for the soft-delete workflow used by route handlers:
//   softDelete()       — mark a row deleted (isDeleted=true, deletedAt=now) and
//                        snapshot the pre-delete record into audit_logs.
//   restore()          — un-delete a row by model + id and log a RESTORE entry.
//   restoreFromLog()   — un-delete a row from the Trash & Audit UI by log id.
//   listAuditLogs()    — feed for the Admin > Trash & Audit screen.
// Also exports HttpError, a small typed error the Express error handler maps to
// proper HTTP status codes (400/403/404/500).
//
// This module uses the RAW `prisma` client deliberately: it must read and mutate
// rows regardless of the `isDeleted` filter that appPrisma applies everywhere
// else, and it must write to AuditLog itself.
// =============================================================================
import { prisma } from './prisma.js';

/**
 * Custom HTTP error class for typed error responses.
 * Maps directly to HTTP status codes in the Express error handler.
 *
 * Usage:
 *   throw new HttpError(404, 'User not found');
 *   throw new HttpError(403, 'Insufficient permissions');
 *   throw new HttpError(400, 'Invalid input data');
 *
 * The Express error handler catches these and returns:
 *   { status: this.status, message: this.message }
 */
export class HttpError extends Error {
  // HTTP status code (400, 403, 404, 500, etc.)
  readonly status: number;

  /**
   * @param status - HTTP status code (e.g., 400, 404, 500)
   * @param message - Human-readable error message sent to client
   */
  constructor(status: number, message: string) {
    // Call parent Error constructor with the message
    super(message);
    // Set the error name for debugging/stack traces
    this.name = 'HttpError';
    // Store the HTTP status code for Express error handler
    this.status = status;
  }
}

/**
 * Models that support soft deletion — PascalCase Prisma delegate names.
 * These correspond to database tables with isDeleted and deletedAt columns.
 * Used by restore() and softDelete() to validate model support.
 */
export const SOFT_DELETABLE_MODELS: string[] = [
  'User', // Church users/administrators with role-based access
  'Christian', // Church members/congregation records
  'Contribution', // Financial contributions/tithes from members
  'Transfer', // Financial transfers between accounts or funds
  'BilledItem', // Items billed to members (e.g., event fees)
  'Death', // Death records for church members
  'Deposit', // Bank deposits and financial deposits
  'Creditor', // Entities owed money by the church
  'Debtor', // Entities that owe money to the church
  'Expense', // Church operational expenses
  'Ledger', // Financial ledger entries
  'LedgerMovement', // Individual ledger transactions/movements
  'InventoryItem', // Physical inventory items (equipment, supplies)
  'Delivery', // Delivery records for inventory items
  'Sale', // Sales transactions
  'StockTake', // Inventory stock-take/audit records
  'StockIssue', // Inventory items issued to departments/staff
  'Employee', // Church employees/staff records
  'Payroll', // Payroll records for employees
  'Leave', // Leave/vacation requests and records
  'Recruitment', // Recruitment campaigns for hiring
  'RecruitmentApplicant', // Applicants for recruitment positions
];

/**
 * Set for O(1) lookup performance when checking if a model supports soft deletion.
 * Used by delegate() and loadCurrentRecord() to validate model names.
 */
const SOFT_DELETABLE: ReadonlySet<string> = new Set(SOFT_DELETABLE_MODELS);

/**
 * Audit actor interface representing the user performing an action.
 * Used in audit logs to track who performed deletions/restores.
 */
export interface AuditActor {
  id: string; // User's unique identifier
  name?: string | null; // User's display name (null if user was deleted)
}

/**
 * Resolves a user id to an actor carrying the display name.
 * Works even if the user was soft-deleted (returns null name in that case).
 *
 * @param id - The user's unique identifier
 * @returns Promise resolving to an AuditActor with id and name
 */
export async function resolveActor(id: string): Promise<AuditActor> {
  // Query the User table to get the user's display name
  // findUnique ensures we get exactly one record by primary key
  const user = await prisma.user.findUnique({ where: { id } });
  // Return actor with name (or null if user doesn't exist or was deleted)
  return { id, name: user?.name ?? null };
}

/**
 * Gets the Prisma delegate (model accessor) for a given model name.
 * Validates that the model exists and supports soft deletion.
 *
 * @param model - PascalCase model name (e.g., 'User', 'Christian')
 * @returns The Prisma model delegate for database operations
 * @throws HttpError(400) if model doesn't support soft deletion
 * @throws HttpError(500) if Prisma delegate not found
 */
function delegate(model: string): any {
  // Check if model is in the soft-deletable list
  if (!SOFT_DELETABLE.has(model)) {
    throw new HttpError(400, `Model ${model} does not support soft deletion`);
  }
  // Access the Prisma delegate using bracket notation (dynamic property access)
  // Cast to Record<string, any> because Prisma's type system doesn't know about dynamic model access
  const d = (prisma as unknown as Record<string, any>)[model];
  // Safety check: ensure the delegate exists in the Prisma client
  if (!d) throw new HttpError(500, `Prisma delegate for ${model} not found`);
  return d;
}

/**
 * Creates a JSON snapshot of a record for audit logging.
 * Strips sensitive fields (password hashes, reset tokens) for security.
 *
 * @param record - The database record to snapshot
 * @returns JSON string of the sanitized record
 */
function snapshot(record: any): string {
  // Create a shallow copy to avoid mutating the original record
  const copy = { ...record };
  // never persist credentials in the audit trail (password hash + reset-token hash)
  // These are bcrypt hashes that could potentially be cracked offline
  delete copy.passwordHash;
  delete copy.resetTokenHash;
  // Convert to JSON string for storage in audit_logs.metadataSnapshot
  return JSON.stringify(copy);
}

/**
 * Writes an entry to the audit_logs table.
 * Records every delete and restore action with full metadata.
 *
 * @param input - Audit log entry data
 * @param input.entityName - Model name (e.g., 'User', 'Christian')
 * @param input.entityId - Record's primary key
 * @param input.action - 'DELETE' or 'RESTORE'
 * @param input.actor - User who performed the action (optional)
 * @param input.snapshotData - JSON snapshot of the record state
 * @param input.createdAt - Timestamp of the action
 */
async function writeAuditLog(input: {
  entityName: string;
  entityId: string;
  action: string;
  actor?: AuditActor;
  snapshotData: string;
  createdAt: Date;
}) {
  // Create a new audit log entry in the database
  await prisma.auditLog.create({
    data: {
      entityName: input.entityName, // Model name (e.g., 'User')
      entityId: input.entityId, // Record's primary key
      action: input.action, // 'DELETE' or 'RESTORE'
      deletedBy: input.actor?.id ?? null, // User ID who performed action (null if system)
      deletedByName: input.actor?.name ?? null, // Display name (null if user was deleted)
      metadataSnapshot: input.snapshotData, // JSON string of record state
      createdAt: input.createdAt, // When the action occurred
    },
  });
}

/**
 * Soft-delete a record: flips isDeleted = true + deletedAt = now, and writes a
 * historical JSON snapshot into audit_logs. The row is never removed from the DB.
 *
 * @param model - PascalCase model name (e.g., 'User', 'Contribution')
 * @param id - Record's primary key
 * @param actor - Optional user performing the deletion
 * @throws HttpError(404) if record not found or already soft-deleted
 */
export async function softDelete(model: string, id: string, actor?: AuditActor): Promise<void> {
  // Get the Prisma delegate for this model (validates it supports soft deletion)
  const d = delegate(model);
  // Find the record by primary key (bypasses appPrisma's isDeleted filter)
  const record = await d.findFirst({ where: { id } });
  // Validate: record must exist and not already be soft-deleted
  if (!record || record.isDeleted) throw new HttpError(404, 'Record not found');

  // Capture current timestamp for consistency between update and audit log
  const now = new Date();
  // Mark the record as soft-deleted (set isDeleted=true and deletedAt=now)
  // This doesn't remove the row from the database — it just flags it
  await d.update({ where: { id }, data: { isDeleted: true, deletedAt: now } });
  // Write an audit log entry capturing the pre-delete state
  await writeAuditLog({
    entityName: model, // Model name for audit trail
    entityId: id, // Record ID for restoration later
    action: 'DELETE', // Action type (DELETE or RESTORE)
    actor, // User who performed the deletion
    snapshotData: snapshot(record), // JSON snapshot of pre-delete state
    createdAt: now, // Timestamp matches the update
  });
}

/**
 * Restore a soft-deleted record by its own model + id, then log the restoration.
 * Used internally by restoreFromLog; routes go through the audit-log workflow.
 *
 * @param model - PascalCase model name
 * @param id - Record's primary key
 * @param actor - Optional user performing the restore
 * @throws HttpError(404) if record not found or not soft-deleted
 */
async function restore(model: string, id: string, actor?: AuditActor): Promise<void> {
  // Get the Prisma delegate for this model
  const d = delegate(model);
  // Find the record by primary key (bypasses appPrisma's isDeleted filter)
  const record = await d.findFirst({ where: { id } });
  // Validate: record must exist AND be soft-deleted (isDeleted=true)
  if (!record || !record.isDeleted) {
    throw new HttpError(404, 'Deleted record not found or not soft-deleted');
  }

  // Clear the soft-delete flags (set isDeleted=false and deletedAt=null)
  await d.update({ where: { id }, data: { isDeleted: false, deletedAt: null } });
  // Write an audit log entry capturing the restored state
  await writeAuditLog({
    entityName: model, // Model name for audit trail
    entityId: id, // Record ID that was restored
    action: 'RESTORE', // Action type (RESTORE)
    actor, // User who performed the restore
    snapshotData: snapshot(record), // JSON snapshot of pre-restore state
    createdAt: new Date(), // New timestamp for the restore action
  });
}

/**
 * Restore a record referenced by an audit log id (the "Trash" workflow).
 * This is the public API for restoring records from the Trash & Audit UI.
 *
 * @param logId - The audit log entry ID (from the Trash UI)
 * @param actor - Optional user performing the restore
 * @throws HttpError(404) if audit log not found
 * @throws HttpError(400) if audit log action is not 'DELETE'
 */
export async function restoreFromLog(logId: string, actor?: AuditActor): Promise<void> {
  // Fetch the audit log entry by primary key
  const log = await prisma.auditLog.findUnique({ where: { id: logId } });
  // Validate: audit log must exist
  if (!log) throw new HttpError(404, 'Audit log not found');
  // Validate: only DELETE actions can be restored (not RESTORE actions)
  // This prevents restoring a record that was already restored
  if (log.action !== 'DELETE') throw new HttpError(400, 'Only deleted records can be restored');
  // Delegate to restore() with the model and entity ID from the audit log
  await restore(log.entityName, log.entityId, actor);
}

/**
 * Parses an audit filter date. Date-only values (YYYY-MM-DD, as produced by
 * <input type="date">) are treated as local calendar days: `from` anchors to
 * local midnight, `to` extends to the end of the day so a same-day range still
 * covers the full 24 hours. Full ISO strings pass through untouched.
 *
 * @param value - Date string (YYYY-MM-DD or full ISO string)
 * @param endOfDay - If true, set time to 23:59:59.999; if false, set to 00:00:00
 * @returns Parsed Date object or null if invalid
 */
function parseFilterDate(value: string, endOfDay: boolean): Date | null {
  // Check if value matches YYYY-MM-DD format (date-only from HTML date input)
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value)
    // For date-only: append appropriate time based on endOfDay flag
    // This ensures full day coverage for date ranges
    ? new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}`)
    // For full ISO strings: parse directly (already has time component)
    : new Date(value);
  // Return null if the date is invalid (NaN timestamp)
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * List audit log entries with the metadata snapshot parsed into an object.
 * Supports entity/action filters plus a createdAt date range and a substring
 * match on the actor name (from/to are ISO or date-only strings).
 *
 * @param opts - Filter options for querying audit logs
 * @param opts.entity - Filter by model name (e.g., 'User')
 * @param opts.action - Filter by action type ('DELETE' or 'RESTORE')
 * @param opts.from - Start of date range (inclusive, YYYY-MM-DD or ISO)
 * @param opts.to - End of date range (inclusive, YYYY-MM-DD or ISO)
 * @param opts.actor - Filter by actor name (substring match)
 * @returns Array of audit log entries with parsed metadata
 */
export async function listAuditLogs(opts: {
  entity?: string;
  action?: string;
  from?: string;
  to?: string;
  actor?: string;
} = {}) {
  // Build the where clause dynamically based on provided filters
  const where: any = {};
  // Filter by entity/model name if provided
  if (opts.entity) where.entityName = opts.entity;
  // Filter by action type if provided
  if (opts.action) where.action = opts.action;
  // Handle date range filtering
  if (opts.from || opts.to) {
    // Initialize createdAt filter object
    where.createdAt = {};
    // Parse and add "from" date filter (inclusive start)
    if (opts.from) {
      const from = parseFilterDate(opts.from, false);
      if (from) where.createdAt.gte = from;
    }
    // Parse and add "to" date filter (inclusive end)
    if (opts.to) {
      const to = parseFilterDate(opts.to, true);
      if (to) where.createdAt.lte = to;
    }
    // Clean up empty createdAt object if no valid dates were added
    if (Object.keys(where.createdAt).length === 0) delete where.createdAt;
  }
  // Filter by actor name using substring match (contains)
  if (opts.actor) where.deletedByName = { contains: opts.actor };

  // Query audit logs with the built where clause, ordered newest first
  const rows = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' } });
  // Transform rows: parse metadataSnapshot JSON into object for easier client use
  return rows.map((r) => ({
    id: r.id, // Audit log primary key
    entityName: r.entityName, // Model name (e.g., 'User')
    entityId: r.entityId, // Record's primary key
    action: r.action, // 'DELETE' or 'RESTORE'
    deletedBy: r.deletedBy, // User ID who performed action
    deletedByName: r.deletedByName, // Display name of actor
    createdAt: r.createdAt, // When the action occurred
    // Parse the metadataSnapshot JSON string into a usable object
    // Use IIFE with try-catch to safely handle malformed JSON
    metadata: (() => {
      try {
        return JSON.parse(r.metadataSnapshot) as Record<string, unknown>;
      } catch {
        // Return null if JSON is malformed (shouldn't happen but defensive coding)
        return null;
      }
    })(),
  }));
}

/**
 * Loads the CURRENT state of a soft-deletable record by entity + id, so the
 * audit UI can diff the pre-delete snapshot against what exists now. Returns
 * null when the record no longer exists.
 *
 * @param entityName - Model name (e.g., 'User', 'Christian')
 * @param entityId - Record's primary key
 * @returns Current record state or null if not found
 * @throws HttpError(400) if model doesn't support soft deletion
 * @throws HttpError(500) if Prisma delegate not found
 */
export async function loadCurrentRecord(entityName: string, entityId: string): Promise<Record<string, unknown> | null> {
  // Validate that the model supports soft deletion
  if (!SOFT_DELETABLE.has(entityName)) {
    throw new HttpError(400, `Model ${entityName} does not support soft deletion`);
  }
  // Get the Prisma delegate using dynamic property access
  const d = (prisma as unknown as Record<string, any>)[entityName];
  // Safety check: ensure the delegate exists
  if (!d) throw new HttpError(500, `Prisma delegate for ${entityName} not found`);
  // Find the record (bypasses appPrisma's isDeleted filter to see all records)
  const record = await d.findFirst({ where: { id: entityId } });
  // Return null if record doesn't exist
  if (!record) return null;
  // This feeds the Trash & Audit diff modal over HTTP — strip credentials so a
  // bcrypt password hash or reset-token hash never leaves the server.
  const copy = { ...record };
  // Remove sensitive fields that shouldn't be exposed to the client
  delete copy.passwordHash;
  delete copy.resetTokenHash;
  // Return sanitized record for diff comparison in the UI
  return copy;
}

/**
 * Restores many deleted records by their audit log ids (the bulk Restore action
 * in Trash & Audit). Each row is attempted independently so one failure never
 * blocks the rest; returns how many succeeded and how many failed.
 *
 * @param ids - Array of audit log entry IDs to restore
 * @param actor - Optional user performing the bulk restore
 * @returns Object with restored and failed counts
 */
export async function restoreMany(ids: string[], actor?: AuditActor): Promise<{ restored: number; failed: number }> {
  // Initialize counters for successful and failed restores
  let restored = 0;
  let failed = 0;
  // Process each ID independently — one failure shouldn't block the rest
  for (const id of ids) {
    try {
      // Attempt to restore the record referenced by this audit log ID
      await restoreFromLog(id, actor);
      restored += 1; // Increment success counter
    } catch {
      // Swallow errors and count as failed (e.g., record already restored, not found)
      failed += 1;
    }
  }
  // Return summary counts for the UI to display
  return { restored, failed };
}
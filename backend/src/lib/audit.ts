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

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * Models that support soft deletion — PascalCase Prisma delegate names.
 */
export const SOFT_DELETABLE_MODELS: string[] = [
  'User',
  'Christian',
  'Contribution',
  'Transfer',
  'BilledItem',
  'Death',
  'Deposit',
  'Creditor',
  'Debtor',
  'Expense',
  'Ledger',
  'LedgerMovement',
  'InventoryItem',
  'Delivery',
  'Sale',
  'StockTake',
  'StockIssue',
  'Employee',
];

const SOFT_DELETABLE: ReadonlySet<string> = new Set(SOFT_DELETABLE_MODELS);

export interface AuditActor {
  id: string;
  name?: string | null;
}

/** Resolves a user id to an actor carrying the display name (works even if the user was deleted). */
export async function resolveActor(id: string): Promise<AuditActor> {
  const user = await prisma.user.findUnique({ where: { id } });
  return { id, name: user?.name ?? null };
}

function delegate(model: string): any {
  if (!SOFT_DELETABLE.has(model)) {
    throw new HttpError(400, `Model ${model} does not support soft deletion`);
  }
  const d = (prisma as unknown as Record<string, any>)[model];
  if (!d) throw new HttpError(500, `Prisma delegate for ${model} not found`);
  return d;
}

function snapshot(record: any): string {
  const copy = { ...record };
  delete copy.passwordHash; // never persist credentials in the audit trail
  return JSON.stringify(copy);
}

async function writeAuditLog(input: {
  entityName: string;
  entityId: string;
  action: string;
  actor?: AuditActor;
  snapshotData: string;
  createdAt: Date;
}) {
  await prisma.auditLog.create({
    data: {
      entityName: input.entityName,
      entityId: input.entityId,
      action: input.action,
      deletedBy: input.actor?.id ?? null,
      deletedByName: input.actor?.name ?? null,
      metadataSnapshot: input.snapshotData,
      createdAt: input.createdAt,
    },
  });
}

/**
 * Soft-delete a record: flips isDeleted = true + deletedAt = now, and writes a
 * historical JSON snapshot into audit_logs. The row is never removed from the DB.
 */
export async function softDelete(model: string, id: string, actor?: AuditActor): Promise<void> {
  const d = delegate(model);
  const record = await d.findFirst({ where: { id } });
  if (!record || record.isDeleted) throw new HttpError(404, 'Record not found');

  const now = new Date();
  await d.update({ where: { id }, data: { isDeleted: true, deletedAt: now } });
  await writeAuditLog({
    entityName: model,
    entityId: id,
    action: 'DELETE',
    actor,
    snapshotData: snapshot(record),
    createdAt: now,
  });
}

/**
 * Restore a soft-deleted record by its own model + id, then log the restoration.
 */
export async function restore(model: string, id: string, actor?: AuditActor): Promise<void> {
  const d = delegate(model);
  const record = await d.findFirst({ where: { id } });
  if (!record || !record.isDeleted) {
    throw new HttpError(404, 'Deleted record not found or not soft-deleted');
  }

  await d.update({ where: { id }, data: { isDeleted: false, deletedAt: null } });
  await writeAuditLog({
    entityName: model,
    entityId: id,
    action: 'RESTORE',
    actor,
    snapshotData: snapshot(record),
    createdAt: new Date(),
  });
}

/**
 * Restore a record referenced by an audit log id (the "Trash" workflow).
 */
export async function restoreFromLog(logId: string, actor?: AuditActor): Promise<void> {
  const log = await prisma.auditLog.findUnique({ where: { id: logId } });
  if (!log) throw new HttpError(404, 'Audit log not found');
  if (log.action !== 'DELETE') throw new HttpError(400, 'Only deleted records can be restored');
  await restore(log.entityName, log.entityId, actor);
}

/**
 * Parses an audit filter date. Date-only values (YYYY-MM-DD, as produced by
 * <input type="date">) are treated as local calendar days: `from` anchors to
 * local midnight, `to` extends to the end of the day so a same-day range still
 * covers the full 24 hours. Full ISO strings pass through untouched.
 */
function parseFilterDate(value: string, endOfDay: boolean): Date | null {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}`)
    : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * List audit log entries with the metadata snapshot parsed into an object.
 * Supports entity/action filters plus a createdAt date range and a substring
 * match on the actor name (from/to are ISO or date-only strings).
 */
export async function listAuditLogs(opts: {
  entity?: string;
  action?: string;
  from?: string;
  to?: string;
  actor?: string;
} = {}) {
  const where: any = {};
  if (opts.entity) where.entityName = opts.entity;
  if (opts.action) where.action = opts.action;
  if (opts.from || opts.to) {
    where.createdAt = {};
    if (opts.from) {
      const from = parseFilterDate(opts.from, false);
      if (from) where.createdAt.gte = from;
    }
    if (opts.to) {
      const to = parseFilterDate(opts.to, true);
      if (to) where.createdAt.lte = to;
    }
    if (Object.keys(where.createdAt).length === 0) delete where.createdAt;
  }
  if (opts.actor) where.deletedByName = { contains: opts.actor };

  const rows = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' } });
  return rows.map((r) => ({
    id: r.id,
    entityName: r.entityName,
    entityId: r.entityId,
    action: r.action,
    deletedBy: r.deletedBy,
    deletedByName: r.deletedByName,
    createdAt: r.createdAt,
    metadata: (() => {
      try {
        return JSON.parse(r.metadataSnapshot) as Record<string, unknown>;
      } catch {
        return null;
      }
    })(),
  }));
}

/**
 * Loads the CURRENT state of a soft-deletable record by entity + id, so the
 * audit UI can diff the pre-delete snapshot against what exists now. Returns
 * null when the record no longer exists.
 */
export async function loadCurrentRecord(entityName: string, entityId: string): Promise<Record<string, unknown> | null> {
  if (!SOFT_DELETABLE.has(entityName)) {
    throw new HttpError(400, `Model ${entityName} does not support soft deletion`);
  }
  const d = (prisma as unknown as Record<string, any>)[entityName];
  if (!d) throw new HttpError(500, `Prisma delegate for ${entityName} not found`);
  const record = await d.findFirst({ where: { id: entityId } });
  return record ? { ...record } : null;
}

/**
 * Restores many deleted records by their audit log ids (the bulk Restore action
 * in Trash & Audit). Each row is attempted independently so one failure never
 * blocks the rest; returns how many succeeded and how many failed.
 */
export async function restoreMany(ids: string[], actor?: AuditActor): Promise<{ restored: number; failed: number }> {
  let restored = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      await restoreFromLog(id, actor);
      restored += 1;
    } catch {
      failed += 1;
    }
  }
  return { restored, failed };
}

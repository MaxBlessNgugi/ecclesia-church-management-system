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
 * List audit log entries with the metadata snapshot parsed into an object.
 */
export async function listAuditLogs(opts: { entity?: string; action?: string } = {}) {
  const where: any = {};
  if (opts.entity) where.entityName = opts.entity;
  if (opts.action) where.action = opts.action;

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

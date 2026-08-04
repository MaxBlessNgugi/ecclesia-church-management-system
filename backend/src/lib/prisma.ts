import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Models that support soft deletion (added `isDeleted` + `deletedAt`).
 * PascalCase names match the Prisma client model delegates.
 * Settings singletons (PanelPermissions, PushPaymentSettings) and AuditLog are excluded.
 */
const SOFT_DELETABLE: ReadonlySet<string> = new Set([
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
]);

function injectSoftDeleteFilter(model: string, args: any): any {
  if (!SOFT_DELETABLE.has(model)) return args;
  const where = args?.where ?? {};
  return { ...args, where: { ...where, isDeleted: false } };
}

/**
 * Application-facing Prisma client.
 * - Every read/update automatically filters out soft-deleted rows (isDeleted = false),
 *   so deleted records stay hidden from all normal views, counts and reports.
 * - Hard `delete` / `deleteMany` are blocked — use `softDelete()` from lib/audit.ts.
 *
 * The base `prisma` client above is unfiltered and reserved for the audit/restore logic.
 */
export const appPrisma = prisma.$extends({
  query: {
    $allModels: {
      async findUnique({ model, args, query }) {
        return query(injectSoftDeleteFilter(model, args));
      },
      async findUniqueOrThrow({ model, args, query }) {
        return query(injectSoftDeleteFilter(model, args));
      },
      async findFirst({ model, args, query }) {
        return query(injectSoftDeleteFilter(model, args));
      },
      async findFirstOrThrow({ model, args, query }) {
        return query(injectSoftDeleteFilter(model, args));
      },
      async findMany({ model, args, query }) {
        return query(injectSoftDeleteFilter(model, args));
      },
      async count({ model, args, query }) {
        return query(injectSoftDeleteFilter(model, args));
      },
      async aggregate({ model, args, query }) {
        return query(injectSoftDeleteFilter(model, args));
      },
      async groupBy({ model, args, query }) {
        return query(injectSoftDeleteFilter(model, args));
      },
      async update({ model, args, query }) {
        return query(injectSoftDeleteFilter(model, args));
      },
      async updateMany({ model, args, query }) {
        return query(injectSoftDeleteFilter(model, args));
      },
      async delete() {
        throw new Error('Hard delete is disabled. Use softDelete() from lib/audit instead.');
      },
      async deleteMany() {
        throw new Error('Hard delete is disabled. Use softDelete() from lib/audit instead.');
      },
    },
  },
});

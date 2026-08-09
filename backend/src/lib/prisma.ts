// =============================================================================
// Prisma client singleton + soft-delete guard layer
// -----------------------------------------------------------------------------
// Exports two clients:
//   prisma    — the raw, UNFILTERED PrismaClient. Reserved for audit/restore
//               logic and uniqueness checks that must see soft-deleted rows.
//   appPrisma — a $extends()-augmented client used by every route handler. It
//               transparently injects `isDeleted: false` into all read/update
//               queries (so deleted records vanish from the UI, counts and
//               reports) and throws on hard delete/deleteMany.
//
// The singleton pattern (globalForPrisma) prevents duplicate connection pools
// during `tsx watch` / hot reload in development.
// =============================================================================
import { PrismaClient } from '@prisma/client';

// Type augmentation for globalThis to store the Prisma singleton.
// In development, Next.js/tsx watch hot-reloads modules, which would
// create a new PrismaClient each time, exhausting database connections.
// Storing the client on globalThis prevents this.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * Raw PrismaClient singleton — unfiltered, sees ALL rows including soft-deleted.
 *
 * Usage:
 *   - Use `appPrisma` for all application reads/writes (auto-filters soft-deletes).
 *   - Use this raw `prisma` only when you NEED to see soft-deleted rows:
 *       • Audit/restore logic (reading snapshots, restoring records)
 *       • Uniqueness validation (checking for duplicates even among deleted rows)
 *       • Administrative views that show deleted records explicitly
 *
 * Connection pooling: This singleton ensures only one PrismaClient instance
 * exists across the entire Node.js process, preventing connection exhaustion.
 */
export const prisma =
  // Reuse existing singleton if it already exists on globalThis (hot reload case)
  globalForPrisma.prisma ||
  // Otherwise create a new PrismaClient with environment-appropriate logging
  new PrismaClient({
    // In development: log errors AND warnings to help debug query issues
    // In production: log only errors to reduce noise and improve performance
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

// Store the singleton on globalThis in non-production environments only.
// This persists the client across module reloads during development hot-reload.
// In production, module caching already prevents duplicate instantiation.
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Models that support soft deletion (added `isDeleted` + `deletedAt`).
 * PascalCase names match the Prisma client model delegates.
 * Settings singletons (PanelPermissions, PushPaymentSettings) and AuditLog are excluded.
 */
const SOFT_DELETABLE: ReadonlySet<string> = new Set([
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
]);

/**
 * Injects a soft-delete filter (`isDeleted: false`) into the query arguments.
 *
 * This function modifies the `where` clause of any Prisma query to exclude
 * soft-deleted records. It only applies to models listed in SOFT_DELETABLE.
 *
 * @param model - The Prisma model name (e.g., 'User', 'Christian')
 * @param args - The original Prisma query arguments
 * @returns Modified arguments with `isDeleted: false` added to where clause
 */
function injectSoftDeleteFilter(model: string, args: any): any {
  // Skip filtering for models that don't support soft deletion (e.g., AuditLog)
  if (!SOFT_DELETABLE.has(model)) return args;
  // Get existing where clause or create empty object if none exists
  const where = args?.where ?? {};
  // Merge the soft-delete filter into the existing where clause.
  // The spread operator ensures we don't mutate the original args object.
  return { ...args, where: { ...where, isDeleted: false } };
}

/**
 * Application-facing Prisma client with automatic soft-delete filtering.
 *
 * This extended PrismaClient intercepts ALL query methods across ALL models
 * and injects the soft-delete filter. This means:
 * - All reads (findUnique, findFirst, findMany, count, aggregate, groupBy)
 *   automatically exclude soft-deleted records from results.
 * - All updates (update, updateMany) only affect non-deleted records.
 * - Hard deletes (delete, deleteMany) are BLOCKED and throw errors.
 *
 * Usage in route handlers:
 *   import { appPrisma } from '~/lib/prisma.server';
 *   const users = await appPrisma.user.findMany(); // Never returns soft-deleted users
 *
 * The base `prisma` client above is unfiltered and reserved for the audit/restore logic.
 */
export const appPrisma = prisma.$extends({
  query: {
    $allModels: {
      // Intercept findUnique to exclude soft-deleted records
      async findUnique({ model, args, query }) {
        return query(injectSoftDeleteFilter(model, args));
      },
      // Intercept findUniqueOrThrow to exclude soft-deleted records
      async findUniqueOrThrow({ model, args, query }) {
        return query(injectSoftDeleteFilter(model, args));
      },
      // Intercept findFirst to exclude soft-deleted records
      async findFirst({ model, args, query }) {
        return query(injectSoftDeleteFilter(model, args));
      },
      // Intercept findFirstOrThrow to exclude soft-deleted records
      async findFirstOrThrow({ model, args, query }) {
        return query(injectSoftDeleteFilter(model, args));
      },
      // Intercept findMany to exclude soft-deleted records
      async findMany({ model, args, query }) {
        return query(injectSoftDeleteFilter(model, args));
      },
      // Intercept count to exclude soft-deleted records from counts
      async count({ model, args, query }) {
        return query(injectSoftDeleteFilter(model, args));
      },
      // Intercept aggregate to exclude soft-deleted records from aggregates
      async aggregate({ model, args, query }) {
        return query(injectSoftDeleteFilter(model, args));
      },
      // Intercept groupBy to exclude soft-deleted records from groupings
      async groupBy({ model, args, query }) {
        return query(injectSoftDeleteFilter(model, args));
      },
      // Intercept update to only update non-deleted records
      async update({ model, args, query }) {
        return query(injectSoftDeleteFilter(model, args));
      },
      // Intercept updateMany to only update non-deleted records
      async updateMany({ model, args, query }) {
        return query(injectSoftDeleteFilter(model, args));
      },
      // BLOCK hard delete operations — force use of softDelete() instead
      // This prevents accidental permanent data loss
      async delete() {
        throw new Error('Hard delete is disabled. Use softDelete() from lib/audit instead.');
      },
      // BLOCK hard deleteMany operations — force use of softDelete() instead
      async deleteMany() {
        throw new Error('Hard delete is disabled. Use softDelete() from lib/audit instead.');
      },
    },
  },
});
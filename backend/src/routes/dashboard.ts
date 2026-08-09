// =============================================================================
// Dashboard routes — mounted at /api/dashboard (require JWT auth)
// =============================================================================
//
// ENDPOINT MAP
//   ┌──────────────┬──────────┬─────────────────────────────────────────────────┐
//   │ Path         │ Method   │ Purpose                                         │
//   ├──────────────┼──────────┼─────────────────────────────────────────────────┤
//   │ /summary     │ GET      │ Dashboard statistics and recent activity lists  │
//   └──────────────┴──────────┴─────────────────────────────────────────────────┘
//
// MOUNTED MIDDLEWARE CHAIN
//   router.use(requireAuth)        → Validates JWT, attaches req.user
//
// ENDPOINT DETAILS
//   GET /summary
//     - Returns aggregated statistics for dashboard cards
//     - Runs multiple independent queries in parallel via Promise.all
//     - Derives low-stock count in JavaScript (not SQL)
//     - Relies on appPrisma to exclude soft-deleted rows from every count
//     - Response includes:
//       • activeMembers: count of members with status='Active'
//       • totalChristians: total count of all Christian members
//       • totalDeposits: sum of all deposit amounts
//       • totalExpenses: sum of all expense amounts
//       • pendingCreditors: count of creditors with Pending/Overdue/Scheduled status
//       • outstandingDebtors: count of debtors with Outstanding/Partially Paid status
//       • lowStockItems: count of inventory items at or below reorder level
//       • totalEmployees: total count of employees
//       • recentDeposits: last 5 deposits (newest first)
//       • recentExpenses: last 5 expenses (newest first)
//
// PERFORMANCE CONSIDERATIONS
//   - All queries run in parallel for minimal response time
//   - Aggregations use SQL SUM/COUNT (database-level, not in-memory)
//   - Low-stock calculation done in JS after fetching all inventory items
//   - Recent lists limited to 5 records each (small data transfer)
//
// RELATED FILES
//   - backend/prisma/schema.prisma     → Christian, Deposit, Expense, Creditor, Debtor, Employee, InventoryItem models
//   - backend/src/middleware/auth.ts   → requireAuth middleware
//   - src/services/api.ts (dashboardApi) → Frontend typed client
//   - src/components/views/DashboardView.tsx → Dashboard UI
// =============================================================================

// Express Router constructor — creates a modular, mountable router instance
import { Router } from 'express';

// Prisma client with soft-delete filtering (excludes deleted records automatically)
import { appPrisma } from '../lib/prisma.js';

// Auth middleware: validates JWT token and attaches user to request
import { requireAuth } from '../middleware/auth.js';

// Create a new Express Router instance for dashboard endpoints
const router = Router();

// Middleware chain: requireAuth validates JWT token and attaches user to request
router.use(requireAuth);

// GET /summary — Dashboard statistics endpoint: returns aggregated data for all dashboard components
router.get('/summary', async (_req, res, next) => {
  try {
    // Execute all independent database queries in parallel for optimal performance
    const [
      activeMembers,        // Count of members with status='Active'
      totalChristians,      // Total count of all Christian members
      depositsAgg,          // Aggregate sum of all deposit amounts
      expensesAgg,          // Aggregate sum of all expense amounts
      pendingCreditors,     // Count of creditors with pending/overdue status
      outstandingDebtors,   // Count of debtors with outstanding/partial status
      totalEmployees,       // Total count of employees
      recentDeposits,       // Last 5 deposits (newest first)
      recentExpenses,       // Last 5 expenses (newest first)
      allItems,             // All inventory items (for low-stock calculation)
    ] = await Promise.all([
      // Count active members (status equals 'Active')
      appPrisma.christian.count({ where: { status: 'Active' } }),
      // Count all Christian members (regardless of status)
      appPrisma.christian.count(),
      // Sum all deposit amounts (returns _sum.amount or null)
      appPrisma.deposit.aggregate({ _sum: { amount: true } }),
      // Sum all expense amounts (returns _sum.amount or null)
      appPrisma.expense.aggregate({ _sum: { amount: true } }),
      // Count creditors with pending, overdue, or scheduled status
      appPrisma.creditor.count({ where: { status: { in: ['Pending', 'Overdue', 'Scheduled'] } } }),
      // Count debtors with outstanding or partially paid status
      appPrisma.debtor.count({ where: { status: { in: ['Outstanding', 'Partially Paid'] } } }),
      // Count all employees
      appPrisma.employee.count(),
      // Fetch last 5 deposits ordered by creation date (newest first)
      appPrisma.deposit.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
      // Fetch last 5 expenses ordered by creation date (newest first)
      appPrisma.expense.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
      // Fetch all inventory items (needed for low-stock calculation in JS)
      appPrisma.inventoryItem.findMany(),
    ]);

    // Calculate low-stock items: count items where current stock <= reorder level
    // This is done in JavaScript because Prisma doesn't support column comparisons
    const lowStockItems = allItems.filter((i) => i.stock <= i.reorder).length;

    // Return aggregated dashboard data as JSON response
    res.json({
      activeMembers,                    // Number of active members
      totalChristians,                  // Total number of Christian members
      totalDeposits: depositsAgg._sum.amount ?? 0, // Total deposits (0 if no deposits)
      totalExpenses: expensesAgg._sum.amount ?? 0, // Total expenses (0 if no expenses)
      pendingCreditors,                 // Number of pending/overdue creditors
      outstandingDebtors,               // Number of outstanding debtors
      lowStockItems,                    // Number of inventory items at or below reorder level
      totalEmployees,                   // Total number of employees
      recentDeposits,                   // Array of last 5 deposit records
      recentExpenses,                   // Array of last 5 expense records
    });
  } catch (e) {
    // Pass any errors to Express error handler middleware
    next(e);
  }
});

// Export the configured router for mounting in the main Express app
export default router;
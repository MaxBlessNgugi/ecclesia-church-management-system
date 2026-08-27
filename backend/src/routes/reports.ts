// =============================================================================
// Ecclesia Backend — Reports Routes (/api/reports)
// =============================================================================
//
// MOUNTED MIDDLEWARE CHAIN
//   router.use(requireAuth)        → Validates JWT, attaches req.user
//   router.use(requireModule('reports'))
//                                    → Enforces panel+action rights for 'reports'
//
// ENDPOINT MAP
//   ┌──────────────────┬──────────┬──────────────────────────────────────────────┐
//   │ Path             │ Method   │ Purpose                                       │
//   ├──────────────────┼──────────┼──────────────────────────────────────────────┤
//   │ /sacraments      │ GET      │ Sacramental register filtered by type/church │
//   │ /contributions   │ GET      │ Giving report filtered by category/month     │
//   │ /sales           │ GET      │ Sales list filtered by item/date             │
//   │ /cashiers        │ GET      │ Ledger summary (balance = collected)         │
//   └──────────────────┴──────────┴──────────────────────────────────────────────┘
//
// QUERY PARAMETERS & FILTERING
//   /sacraments?sacramentType=baptism|eucharist|confirmation|marriage
//                    &localChurch=<string>&scc=<string>
//      - Excludes Inactive members (status !== 'Inactive')
//      - Pulls date from Christian's JSON sacrament fields (baptism, eucharist, etc.)
//
//   /contributions?category=<string>&month=<MMM>
//      - Flattens Contribution records; monthlyTracker JSON determines 'Paid'/'Pending'
//      - Category filter is case-insensitive substring match on joined categories
//
//   /sales?item=<string>&date=<YYYY-MM-DD>
//      - item: substring match (Prisma contains)
//      - date: prefix match on time string (startsWith)
//
//   /cashiers (no params)
//      - One row per Ledger; balance treated as both collected & reconciled
//      - Status hardcoded to 'OK' — placeholder for future reconciliation logic
//
// IMPLEMENTATION NOTES
//   - All endpoints do IN-MEMORY aggregation over full table reads (JS map/filter)
//   - This is INTENTIONAL at parish scale (hundreds to low thousands of rows)
//   - Avoids complex Prisma groupBy/raw SQL at parish scale
//   - If data grows, migrate to SQL views or materialized tables
//
// DATA SHAPES (match src/types.ts report row interfaces)
//   SacramentReportRow:    { name, dob, date, scc, status }
//   ContributionReportRow: { memberName, category, month, amount, status }
//   SalesReportRow:        { item, quantity, amount, date }
//   CashierReportRow:      { cashier, sessions, collected, reconciled, status }
//
// RELATED FILES
//   - backend/prisma/schema.prisma     → Christian, Contribution, Sale, Ledger models
//   - backend/src/middleware/perms.ts  → requireModule('reports')
//   - src/services/api.ts (reportsApi) → Frontend typed client
//   - src/components/views/ReportsView.tsx → Reports UI (4 sub-tabs)
//   - src/types.ts                     → *ReportRow interfaces
// =============================================================================

// Express Router constructor — creates a modular, mountable router instance
import { Router } from 'express';

// Prisma client with soft-delete filtering (excludes deleted records automatically)
import { appPrisma } from '../lib/prisma.js';

// Auth middleware: validates JWT token and attaches user to request
import { requireAuth } from '../middleware/auth.js';

// Permission middleware: checks panel-specific access rights for the reports module
import { requireModule } from '../middleware/perms.js';

// Decimal helper: converts Prisma Decimal to plain numbers for API responses
import { toNum } from '../lib/decimal.js';

// Create a new Express Router instance for reports endpoints
const router = Router();

// Middleware chain: requireAuth validates JWT token and attaches user to request
router.use(requireAuth);

// Middleware chain: requireModule ensures user has access to reports panel
router.use(requireModule('reports'));

// Helper function to safely parse optional JSON values with type casting
function parseOptionalJson<T>(value: string | null | undefined): T | undefined {
  if (!value) return undefined; // Return undefined for null/undefined/empty values
  try {
    // Parse JSON string or return value as-is if already an object
    return typeof value === 'string' ? JSON.parse(value) as T : value as T;
  } catch {
    return undefined; // Return undefined if JSON parsing fails
  }
}

// GET /sacraments — Sacramental register report with filtering by type, local church, and SCC
router.get('/sacraments', async (req, res, next) => {
  try {
    // Extract optional query parameters for filtering
    const { sacramentType, localChurch, scc } = req.query as Record<string, string | undefined>;
    // Build where clause: exclude inactive members by default
    const where: any = { status: { not: 'Inactive' } };
    // Add localChurch filter if provided (exact match)
    if (localChurch) where.localChurch = localChurch;
    // Add scc filter if provided (exact match)
    if (scc) where.scc = scc;

    // Fetch all Christian members matching filters (full table read for in-memory aggregation)
    const rows = await appPrisma.christian.findMany({ where });
    // Transform each member into sacrament report row
    const result = rows.map((c) => {
      let date = ''; // Default empty date
      // Parse each sacrament's JSON data (may be null/undefined)
      const baptism = parseOptionalJson<any>(c.baptism);
      const eucharist = parseOptionalJson<any>(c.eucharist);
      const confirmation = parseOptionalJson<any>(c.confirmation);
      const marriage = parseOptionalJson<any>(c.marriage);
      // Extract date based on requested sacrament type
      if (sacramentType === 'baptism' && baptism) date = baptism.date ?? '';
      else if (sacramentType === 'eucharist' && eucharist) date = eucharist.date ?? '';
      else if (sacramentType === 'confirmation' && confirmation) date = confirmation.date ?? '';
      else if (sacramentType === 'marriage' && marriage) date = marriage.date ?? '';
      // Return formatted report row
      return {
        name: `${c.baptismalName} ${c.secondName} ${c.sirName}`.trim(), // Full name from components
        dob: '', // Date of birth (empty in current implementation)
        date, // Sacrament date (extracted above)
        scc: c.scc, // Small Christian Community
        status: c.status, // Member status (Active, Inactive, etc.)
      };
    });
    // Return transformed report data as JSON
    res.json(result);
  } catch (e) { next(e); } // Pass errors to Express error handler
});

// GET /contributions — Giving report with filtering by category and month
router.get('/contributions', async (req, res, next) => {
  try {
    // Extract optional query parameters for filtering
    const { category, month } = req.query as Record<string, string | undefined>;
    // Fetch all contributions ordered by creation date (newest first)
    const rows = await appPrisma.contribution.findMany({ orderBy: { createdAt: 'desc' } });
    // Transform each contribution into report row with parsed JSON
    let result = rows.map((r) => {
      let categories: string[] = []; // Default empty categories array
      let tracker: Record<string, boolean> = {}; // Default empty monthly tracker
      try { categories = JSON.parse(r.categories); } catch { } // Parse categories JSON (may be malformed)
      try { tracker = JSON.parse(r.monthlyTracker); } catch { } // Parse monthly tracker JSON
      return {
        memberName: r.memberName, // Contributor's name
        category: categories.join(', '), // Joined categories string
        month: month ?? '', // Requested month filter (empty if not provided)
        amount: toNum(r.amountKES), // Contribution amount in Kenyan Shillings
        // Payment status: 'Paid' if month specified and tracked as paid, otherwise 'Pending'
        status: month && tracker[month] ? 'Paid' : 'Pending',
      };
    });
    // Apply category filter if provided (case-insensitive substring match)
    if (category) {
      result = result.filter((r) => r.category.toLowerCase().includes(category.toLowerCase()));
    }
    // Return filtered report data as JSON
    res.json(result);
  } catch (e) { next(e); } // Pass errors to Express error handler
});

// GET /sales — Sales report with filtering by item name and date
router.get('/sales', async (req, res, next) => {
  try {
    // Extract optional query parameters for filtering
    const { item, date } = req.query as Record<string, string | undefined>;
    // Build where clause for Prisma query
    const where: any = {};
    // Add item filter if provided (substring match using contains)
    if (item) where.item = { contains: item };
    // Add date filter if provided (range match using gte/lte on DateTime)
    if (date) {
      const dayStart = new Date(`${date}T00:00:00Z`);
      const dayEnd = new Date(`${date}T23:59:59.999Z`);
      where.time = { gte: dayStart, lte: dayEnd };
    }
    // Fetch all sales matching filters, ordered by creation date (newest first)
    const rows = await appPrisma.sale.findMany({ where, orderBy: { createdAt: 'desc' } });
    // Transform each sale into report row (quantity always 1 in current schema)
    res.json(rows.map((r) => ({
      item: r.item, // Item name/description
      quantity: 1, // Quantity (hardcoded to 1 in current implementation)
      amount: toNum(r.amount), // Sale amount
      date: r.time?.toISOString() ?? null, // Sale timestamp (ISO string)
    })));
  } catch (e) { next(e); } // Pass errors to Express error handler
});

// GET /cashiers — Ledger/cashier summary report (no filtering parameters)
router.get('/cashiers', async (_req, res, next) => {
  try {
    // Fetch all ledger records (one per cashier/session)
    const ledgers = await appPrisma.ledger.findMany();
    // Transform each ledger into cashier report row
    const result = ledgers.map((l) => ({
      cashier: l.cashier, // Cashier name/identifier
      sessions: 1, // Number of sessions (hardcoded to 1 per ledger in current schema)
      collected: toNum(l.balance), // Amount collected (balance treated as collected total)
      reconciled: toNum(l.balance), // Amount reconciled (same as collected in current implementation)
      status: 'OK', // Reconciliation status (hardcoded placeholder for future logic)
    }));
    // Return cashier report data as JSON
    res.json(result);
  } catch (e) { next(e); } // Pass errors to Express error handler
});

// Export the configured router for mounting in the main Express app
export default router;
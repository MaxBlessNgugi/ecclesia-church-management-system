// =============================================================================
// Activities routes — mounted at /api (all require JWT auth)
// =============================================================================
//
// PURPOSE
//   Manages parish activity records: member contributions (giving), inter-parish
//   transfers, and billed services (paid items). All endpoints require JWT
//   authentication and 'activities' module permissions.
//
// ENDPOINT MAP
//   ┌──────────────────┬────────┬──────────────────────────────────────────────┐
//   │ Endpoint         │ Method │ Purpose                                      │
//   ├──────────────────┼────────┼──────────────────────────────────────────────┤
//   │ /contributions   │ GET    │ List all contribution records (newest first) │
//   │ /contributions   │ POST   │ Record a member's contribution (categories,  │
//   │                  │        │   monthly tracker, amount in KES)            │
//   │ /transfers       │ GET    │ List all parish transfers (newest first)     │
//   │ /transfers       │ POST   │ Record transfer + update member's status     │
//   │                  │        │   to 'Transferred' (transactional)           │
//   │ /billed-items    │ GET    │ List all billed items (newest first)         │
//   │ /billed-items    │ POST   │ Record a paid service (walk-in or member)    │
//   └──────────────────┴────────┴──────────────────────────────────────────────┘
//
// CONTRIBUTIONS
//   - Stores member giving records with category tags (e.g., Tithe, Offertory)
//     and a monthly tracker (JSON object mapping month→boolean for 12 months).
//   - categories and monthlyTracker are stored as JSON strings in PostgreSQL.
//   - amountKES is in Kenyan Shillings.
//
// TRANSFERS
//   - Records a member transferring to a new parish/diocese.
//   - POST also updates the linked Christian's status to 'Transferred' and
//     rewrites their parish details — all inside a single database transaction.
//   - If the Christian record is missing or soft-deleted, the transaction rolls back.
//
// BILLED ITEMS
//   - Paid services: funerals, weddings,Mass requests, etc.
//   - Walk-in records (isWalkIn=true) have no christianId (non-member customers).
//   - unitFee × quantity = totalAmount (computed by client, stored as-is).
//
// MIDDLEWARE CHAIN
//   requireAuth            → Validates JWT, attaches req.user
//   requireModule('activities') → Enforces panel+action rights for 'activities'
//
// RELATED FILES
//   - backend/src/middleware/auth.ts     → requireAuth, AuthRequest
//   - backend/src/middleware/perms.ts    → requireModule
//   - backend/src/lib/prisma.ts         → appPrisma
//   - backend/prisma/schema.prisma      → Contribution, Transfer, BilledItem models
//   - src/services/api.ts (activitiesApi) → Frontend typed client
//   - src/components/views/ActivitiesView.tsx → Activities UI
// =============================================================================
import { Router } from 'express';
import { z } from 'zod';
import { appPrisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireModule } from '../middleware/perms.js';
import { emitChange } from '../lib/events.js';

// Create a new Express router for all activity-related routes.
const router = Router();

// Apply JWT authentication to all routes in this router.
router.use(requireAuth);

// Apply module-level permission check for the 'activities' module.
router.use(requireModule('activities'));

// ── Helper functions ───────────────────────────────────────────────────────

// Safe JSON parse for `categories`/`monthlyTracker` columns (stored as TEXT).
// Returns the fallback value if parsing fails or input is empty.
function parseJson<T>(raw: string, fallback: T): T {
  try {
    // Attempt to parse the raw JSON string into the expected type.
    return JSON.parse(raw) as T;
  } catch {
    // Return fallback on parse failure (malformed JSON, empty string, etc.).
    return fallback;
  }
}

// ── Contributions ──────────────────────────────────────────────────────────

// GET /api/contributions — List all contribution records
// Response: 200 with array of contribution objects, newest first.
// categories and monthlyTracker are deserialized from JSON TEXT.
router.get('/contributions', async (_req, res, next) => {
  try {
    // Fetch all contribution records ordered by createdAt descending.
    const rows = await appPrisma.contribution.findMany({ orderBy: { createdAt: 'desc' } });

    // Map raw Prisma records to API response shape.
    res.json(
      rows.map((r) => ({
        id: r.id,                                              // UUID primary key
        christianId: r.christianId,                            // Linked Christian record ID
        memberName: r.memberName,                              // Display name of the member
        regNo: r.regNo,                                        // Member's registration number
        categories: parseJson<string[]>(r.categories, []),     // Deserialize category array from JSON TEXT
        otherCategory: r.otherCategory ?? undefined,           // Custom category name (if 'Other' selected)
        monthlyTracker: parseJson<Record<string, boolean>>(r.monthlyTracker, {}), // Deserialize monthly tracker from JSON TEXT
        amountKES: r.amountKES,                                // Total contribution amount in KES
        date: r.date,                                          // Date of contribution (ISO string)
      }))
    );
  } catch (e) {
    // Pass errors to centralized error handler.
    next(e);
  }
});

// POST /api/contributions — Record a new contribution
// Body: validated inline with Zod schema.
// Response: 201 with the newly created contribution object.
router.post('/contributions', async (req, res, next) => {
  try {
    // Validate request body against the contribution schema.
    const data = z
      .object({
        // ID of the linked Christian record (foreign key).
        christianId: z.string(),
        // Display name of the contributing member.
        memberName: z.string(),
        // Registration number of the member (REG-YYYY-NNNNNN).
        regNo: z.string(),
        // Array of contribution categories (e.g., ["Tithe", "Offertory"]).
        categories: z.array(z.string()),
        // Custom category name when 'Other' is selected (optional).
        otherCategory: z.string().optional(),
        // Monthly tracker: maps month keys to booleans (e.g., { "Jan": true, "Feb": false }).
        monthlyTracker: z.record(z.boolean()),
        // Contribution amount in Kenyan Shillings.
        amountKES: z.number(),
        // Date of the contribution (ISO date string).
        date: z.string(),
      })
      .parse(req.body);

    // Create the contribution record, serializing JSON fields for storage.
    const created = await appPrisma.contribution.create({
      data: {
        christianId: data.christianId,
        memberName: data.memberName,
        regNo: data.regNo,
        categories: JSON.stringify(data.categories),       // Serialize array → JSON TEXT
        otherCategory: data.otherCategory ?? null,         // Store null if not provided
        monthlyTracker: JSON.stringify(data.monthlyTracker), // Serialize object → JSON TEXT
        amountKES: data.amountKES,
        date: data.date,
      },
    });

    // Return 201 Created with the response (JSON fields already parsed by client).
    const contributionResponse = {
      id: created.id,
      christianId: created.christianId,
      memberName: created.memberName,
      regNo: created.regNo,
      categories: data.categories,             // Return parsed array, not raw JSON
      otherCategory: data.otherCategory,       // Return original optional value
      monthlyTracker: data.monthlyTracker,     // Return parsed object, not raw JSON
      amountKES: created.amountKES,
      date: created.date,
    };
    res.status(201).json(contributionResponse);

    // Broadcast real-time event to all connected clients.
    emitChange('contributions', 'created', contributionResponse);
  } catch (e) {
    next(e);
  }
});

// ── Transfers ──────────────────────────────────────────────────────────────

// GET /api/transfers — List all parish transfer records
// Response: 200 with array of transfer objects, newest first.
router.get('/transfers', async (_req, res, next) => {
  try {
    // Fetch all transfer records ordered by createdAt descending.
    const rows = await appPrisma.transfer.findMany({ orderBy: { createdAt: 'desc' } });

    // Return raw Prisma objects (no JSON fields to deserialize).
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// POST /api/transfers — Record a parish transfer and update the member's status
// Body: validated inline with Zod schema.
// Response: 201 with the newly created transfer object.
// Side effect: Updates the linked Christian's status to 'Transferred' and
// rewrites their parish details — all inside a single transaction.
router.post('/transfers', async (req, res, next) => {
  try {
    // Validate request body against the transfer schema.
    const data = z
      .object({
        // ID of the Christian being transferred (foreign key).
        christianId: z.string(),
        // Display name of the transferring member.
        memberName: z.string(),
        // New diocese the member is transferring to.
        diocese: z.string(),
        // New parish the member is transferring to.
        parish: z.string(),
        // New local church the member is transferring to.
        localChurch: z.string(),
        // New Small Christian Community.
        scc: z.string(),
        // Date of the transfer (ISO date string).
        date: z.string(),
      })
      .parse(req.body);

    // Single logical operation: record the transfer AND flip the member's
    // registry status + parish details. Done in one transaction so a missing or
    // soft-deleted Christian rolls the transfer back instead of leaving an
    // orphaned record behind.
    const created = await appPrisma.$transaction(async (tx) => {
      // Step 1: Create the transfer record in the database.
      const transfer = await tx.transfer.create({ data });

      // Step 2: Update the linked Christian's status and parish details.
      // If the Christian ID is invalid or deleted, the transaction rolls back.
      await tx.christian.update({
        where: { id: data.christianId },
        data: {
          status: 'Transferred',              // Mark member as transferred
          diocese: data.diocese,               // Update to new diocese
          parish: data.parish,                 // Update to new parish
          localChurch: data.localChurch,       // Update to new local church
          scc: data.scc,                       // Update to new SCC
        },
      });

      return transfer;
    });

    // Return 201 Created with the transfer record.
    res.status(201).json(created);

    // Broadcast real-time event to all connected clients.
    emitChange('transfers', 'created', created);
  } catch (e) {
    next(e);
  }
});

// ── Billed Items ───────────────────────────────────────────────────────────

// GET /api/billed-items — List all billed items (paid services)
// Response: 200 with array of billed item objects, newest first.
router.get('/billed-items', async (_req, res, next) => {
  try {
    // Fetch all billed items ordered by createdAt descending.
    const rows = await appPrisma.billedItem.findMany({ orderBy: { createdAt: 'desc' } });

    // Map raw Prisma records to API response shape.
    res.json(
      rows.map((r) => ({
        id: r.id,                                              // UUID primary key
        christianId: r.christianId ?? undefined,               // Linked Christian ID (null for walk-ins)
        memberName: r.memberName,                              // Customer/member name
        isWalkIn: r.isWalkIn,                                  // True if non-member (walk-in customer)
        category: r.category,                                  // Service category (e.g., "Funeral", "Wedding")
        item: r.item,                                          // Specific item/service name
        unitFee: r.unitFee,                                    // Price per unit in KES
        quantity: r.quantity,                                  // Number of units
        totalAmount: r.totalAmount,                            // Total: unitFee × quantity
        date: r.date,                                          // Date of the service (ISO string)
      }))
    );
  } catch (e) {
    next(e);
  }
});

// POST /api/billed-items — Record a new billed item (paid service)
// Body: validated inline with Zod schema.
// Response: 201 with the newly created billed item object.
router.post('/billed-items', async (req, res, next) => {
  try {
    // Validate request body against the billed item schema.
    const data = z
      .object({
        // ID of the linked Christian record (null for walk-in customers).
        christianId: z.string().optional(),
        // Display name of the customer/member.
        memberName: z.string(),
        // Whether this is a walk-in (non-member) customer. Defaults to false.
        isWalkIn: z.boolean().default(false),
        // Service category (e.g., "Funeral", "Wedding", "Mass Request").
        category: z.string(),
        // Specific item or service name.
        item: z.string(),
        // Price per unit in KES.
        unitFee: z.number(),
        // Number of units (must be a positive integer).
        quantity: z.number().int().positive(),
        // Total amount: unitFee × quantity (computed by client).
        totalAmount: z.number(),
        // Date of the service (ISO date string).
        date: z.string(),
      })
      .parse(req.body);

    // Ensure totalAmount is rounded to 2 decimal places to avoid floating point issues.
    const calculatedTotal = Math.round((data.unitFee * data.quantity) * 100) / 100;
    const totalAmount = data.totalAmount ? Math.round(data.totalAmount * 100) / 100 : calculatedTotal;

    // Create the billed item record, storing null for walk-in customer IDs.
    const created = await appPrisma.billedItem.create({
      data: {
        christianId: data.christianId ?? null,   // Store null for walk-ins
        memberName: data.memberName,
        isWalkIn: data.isWalkIn,
        category: data.category,
        item: data.item,
        unitFee: data.unitFee,
        quantity: data.quantity,
        totalAmount,
        date: data.date,
      },
    });

    // Return 201 Created with the response object.
    const billedResponse = {
      id: created.id,
      christianId: created.christianId ?? undefined,  // Map null → undefined for client
      memberName: created.memberName,
      isWalkIn: created.isWalkIn,
      category: created.category,
      item: created.item,
      unitFee: created.unitFee,
      quantity: created.quantity,
      totalAmount: created.totalAmount,
      date: created.date,
    };
    res.status(201).json(billedResponse);

    // Broadcast real-time event to all connected clients.
    emitChange('billed-items', 'created', billedResponse);
  } catch (e) {
    next(e);
  }
});

// Export the router for mounting in index.ts at /api (root level).
export default router;

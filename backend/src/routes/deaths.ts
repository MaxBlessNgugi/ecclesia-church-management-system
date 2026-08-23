// =============================================================================
// Death records routes — mounted at /api/deaths (require JWT auth)
// =============================================================================
//
// PURPOSE
//   Manages death records for deceased church members. Each death record is
//   linked to a Christian member and automatically updates their status to
//   'Deceased' in the registry — ensuring the member list stays accurate.
//
// ENDPOINT MAP
//   ┌──────────┬────────┬────────────────────────────────────────────────────┐
//   │ Endpoint │ Method │ Purpose                                            │
//   ├──────────┼────────┼────────────────────────────────────────────────────┤
//   │ /        │ GET    │ List all death records (newest first)              │
//   │ /        │ POST   │ Record a death + mark linked Christian as Deceased │
//   └──────────┴────────┴────────────────────────────────────────────────────┘
//
// TRANSACTIONAL SAFETY
//   POST /api/deaths creates the death record AND updates the Christian's
//   status to 'Deceased' inside a single database transaction. If the
//   Christian record is missing or soft-deleted, the entire operation rolls
//   back — no orphaned death records are left behind.
//
// MIDDLEWARE CHAIN
//   requireAuth              → Validates JWT, attaches req.user
//   requireModule('sacraments') → Enforces panel+action rights for sacraments
//
// RELATED FILES
//   - backend/src/middleware/auth.ts     → requireAuth
//   - backend/src/middleware/perms.ts    → requireModule
//   - backend/src/lib/prisma.ts         → appPrisma
//   - backend/prisma/schema.prisma      → Death, Christian models
//   - src/services/api.ts (deathsApi)   → Frontend typed client
//   - src/components/views/DeathsView.tsx → Deaths UI
// =============================================================================
import { Router } from 'express';
import { z } from 'zod';
import { appPrisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireModule } from '../middleware/perms.js';
import { emitChange } from '../lib/events.js';

// Create a new Express router for all death-record routes.
const router = Router();

// Apply JWT authentication to all routes in this router.
// Rejects requests without a valid Bearer token (401 Unauthorized).
router.use(requireAuth);

// Apply module-level permission check for the 'sacraments' module.
// Death records are managed under sacraments permissions.
router.use(requireModule('sacraments'));

// ── Route handlers ─────────────────────────────────────────────────────────

// GET /api/deaths — List all death records
// Response: 200 with array of death objects, newest first.
router.get('/', async (_req, res, next) => {
  try {
    // Fetch all death records ordered by createdAt descending (newest deaths first).
    const rows = await appPrisma.death.findMany({ orderBy: { createdAt: 'desc' } });

    // Return raw Prisma objects (no JSON fields to deserialize).
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/deaths — Record a new death
// Body: validated inline with Zod schema.
// Response: 201 with the newly created death record.
// Side effect: Updates the linked Christian's status to 'Deceased'.
// All done inside a single database transaction for atomicity.
router.post('/', async (req, res, next) => {
  try {
    // Validate request body against the death record schema.
    const data = z.object({
      // ID of the Christian who has died (foreign key to christian table).
      christianId: z.string(),
      // Display name of the deceased member.
      memberName: z.string(),
      // Location where the death occurred (e.g., hospital name, home).
      placeOfDeath: z.string(),
      // Date of death (ISO date string, e.g., "2026-05-20").
      dateOfDeath: z.string(),
      // Date of burial (ISO date string, e.g., "2026-05-25").
      dateOfBurial: z.string(),
      // Name of the minister/priest who officiated the burial.
      ministerName: z.string(),
      // Additional notes or remarks about the death/burial. Defaults to empty string.
      remarks: z.string().default(''),
    }).parse(req.body);

    // Single logical operation: record the death AND flip the linked member to
    // "Deceased". Transactional so a missing/soft-deleted Christian rolls the
    // death record back instead of leaving an orphaned row.
    const created = await appPrisma.$transaction(async (tx) => {
      // Step 1: Create the death record in the database.
      const death = await tx.death.create({ data });

      // Step 2: Update the linked Christian's status to 'Deceased'.
      // If the Christian ID is invalid or the record is soft-deleted,
      // this throws and the entire transaction rolls back.
      await tx.christian.update({
        where: { id: data.christianId },
        data: { status: 'Deceased' },
      });

      return death;
    });

    // Return 201 Created with the death record.
    res.status(201).json(created);

    // Broadcast real-time event to all connected clients.
    emitChange('deaths', 'created', created);
    emitChange('christians', 'updated', { id: data.christianId, status: 'Deceased' });
  } catch (e) { next(e); }
});

// Export the router for mounting in index.ts at /api/deaths.
export default router;

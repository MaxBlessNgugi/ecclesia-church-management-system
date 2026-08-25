// =============================================================================
// Christian registry routes — /api/christians (all require JWT auth)
// =============================================================================
//
// PURPOSE
//   Manages the church member registry (christian table). Provides full CRUD
//   for member records plus sacrament-specific updates. Supports soft-delete
//   via the audit system (Admin → Trash & Audit UI).
//
// ENDPOINT MAP
//   ┌──────────────────────┬────────┬────────────────────────────────────────┐
//   │ Endpoint             │ Method │ Purpose                                │
//   ├──────────────────────┼────────┼────────────────────────────────────────┤
//   │ /                    │ GET    │ List members (optional ?status=, ?q=)  │
//   │ /                    │ POST   │ Create member (server-assigned regNo)  │
//   │ /:id                 │ GET    │ Fetch single member by ID              │
//   │ /:id                 │ PUT    │ Full/partial update of member fields   │
//   │ /:id/sacraments      │ PATCH  │ Update sacrament objects only          │
//   │ /:id                 │ DELETE │ Soft-delete (sets Inactive + audit)    │
//   └──────────────────────┴────────┴────────────────────────────────────────┘
//
// SACRAMENT FIELDS
//   Stored as JSON strings in PostgreSQL (via serializeOptionalJson) and re-parsed
//   on the way out (parseOptionalJson) so the API contract uses plain JS
//   objects: { date, minister, place } — not raw JSON strings.
//
// REGISTRATION NUMBER (regNo)
//   Format: REG-<YYYY>-<NNNNNN> (e.g., REG-2026-001043).
//   Auto-generated server-side by nextRegNo() which queries the highest regNo
//   across ALL records (including soft-deleted) to prevent collisions.
//
// SOFT DELETE
//   1. Sets status = 'Inactive' on the member row
//   2. Calls audit.softDelete() to mark isDeleted=true, deletedAt=now
//   3. Returns 204 No Content
//   4. Restorable via Admin → Trash & Audit UI
//
// MIDDLEWARE CHAIN
//   requireAuth       → Validates JWT, attaches req.user (id, role)
//   requireModule('christian') → Enforces panel+action rights for 'christian' module
//
// RELATED FILES
//   - backend/src/middleware/auth.ts    → requireAuth, AuthRequest type
//   - backend/src/middleware/perms.ts   → requireModule
//   - backend/src/lib/audit.ts          → softDelete, resolveActor
//   - backend/src/lib/prisma.ts         → appPrisma (soft-delete aware), prisma (raw)
//   - backend/prisma/schema.prisma      → Christian model definition
// =============================================================================
import { Router } from 'express';
import { z } from 'zod';
import { appPrisma, prisma } from '../lib/prisma.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { requireModule } from '../middleware/perms.js';
import { softDelete, resolveActor } from '../lib/audit.js';
import { emitChange } from '../lib/events.js';

// Create a new Express router instance for all Christian-related routes.
const router = Router();

// Apply JWT authentication middleware to ALL routes in this router.
// Rejects requests without a valid Bearer token (401 Unauthorized).
router.use(requireAuth);

// Apply module-level permission check for the 'christian' module.
// Checks that the authenticated user's role has access to this module.
router.use(requireModule('christian'));

// ── Zod validation schemas ─────────────────────────────────────────────────

// Sacrament schema: validates individual sacrament records (baptism, eucharist,
// confirmation, marriage). All fields optional — partial updates allowed.
// The entire sacrament object is optional (can be omitted in requests).
const sacramentSchema = z.object({
  // Date the sacrament was performed (ISO string, e.g., "2026-03-15").
  date: z.string().optional(),
  // Name of the minister/priest who performed the sacrament.
  minister: z.string().optional(),
  // Location/church where the sacrament was performed.
  place: z.string().optional(),
}).optional();

// ── JSON serialization helpers ─────────────────────────────────────────────

// Parses a JSON TEXT column value from PostgreSQL into a typed JS object.
// Returns undefined for null/empty/malformed values (graceful fallback).
function parseOptionalJson<T>(value: string | null | undefined): T | undefined {
  // Guard: null, undefined, or empty string → return undefined.
  if (!value) return undefined;
  try {
    // If already an object, cast directly; otherwise parse the JSON string.
    return typeof value === 'string' ? JSON.parse(value) as T : value as T;
  } catch {
    // Malformed JSON → return undefined instead of crashing.
    return undefined;
  }
}

// Serializes a JS object to JSON TEXT for storage in PostgreSQL columns.
// Returns undefined for null/undefined values (don't write empty JSON).
function serializeOptionalJson<T>(value: T | undefined): string | undefined {
  // Guard: undefined or null → don't serialize, return undefined.
  if (value === undefined || value === null) return undefined;
  // If already a string (raw JSON), return as-is; otherwise stringify.
  return typeof value === 'string' ? value : JSON.stringify(value);
}

// Main Christian record validation schema.
// Used for POST (create) and PUT (update) requests.
const christianSchema = z.object({
  // Registration number — optional on create (server auto-generates).
  regNo: z.string().optional(),
  // National ID number — required, must be at least 1 character.
  nationalId: z.string().min(1),
  // Baptismal name — required, must be at least 1 character.
  baptismalName: z.string().min(1),
  // Second name (given name) — required, must be at least 1 character.
  secondName: z.string().min(1),
  // Surname (family name) — required, must be at least 1 character.
  sirName: z.string().min(1),
  // Phone number — required, must be at least 1 character.
  phone: z.string().min(1),
  // Diocese — required, must be at least 1 character.
  diocese: z.string().min(1),
  // Parish — required, must be at least 1 character.
  parish: z.string().min(1),
  // Local church — required, must be at least 1 character.
  localChurch: z.string().min(1),
  // Small Christian Community (SCC) — required, must be at least 1 character.
  scc: z.string().min(1),
  // Membership status — optional on create, defaults to 'Active'.
  // Valid values: 'Active', 'Transferred', 'Deceased', 'Inactive'.
  status: z.enum(['Active', 'Transferred', 'Deceased', 'Inactive']).optional(),
  // Baptism sacrament details (optional object or null).
  baptism: sacramentSchema,
  // Eucharist sacrament details (optional object or null).
  eucharist: sacramentSchema,
  // Confirmation sacrament details (optional object or null).
  confirmation: sacramentSchema,
  // Marriage sacrament details (optional object or null).
  marriage: sacramentSchema,
});

// ── Response mapping ───────────────────────────────────────────────────────

// Maps a raw Prisma Christian record to the API response shape.
// Deserializes JSON TEXT columns (baptism, eucharist, confirmation, marriage)
// into plain JS objects for the client.
function mapChristian(c: any) {
  return {
    id: c.id,                          // UUID primary key
    regNo: c.regNo,                    // Registration number (REG-YYYY-NNNNNN)
    nationalId: c.nationalId,          // National ID number
    baptismalName: c.baptismalName,    // Baptismal name
    secondName: c.secondName,          // Second/given name
    sirName: c.sirName,                // Surname
    phone: c.phone,                    // Phone number
    diocese: c.diocese,                // Diocese name
    parish: c.parish,                  // Parish name
    localChurch: c.localChurch,        // Local church name
    scc: c.scc,                        // Small Christian Community
    status: c.status,                  // Membership status
    baptism: parseOptionalJson(c.baptism) ?? undefined,        // Parsed baptism JSON
    eucharist: parseOptionalJson(c.eucharist) ?? undefined,    // Parsed eucharist JSON
    confirmation: parseOptionalJson(c.confirmation) ?? undefined, // Parsed confirmation JSON
    marriage: parseOptionalJson(c.marriage) ?? undefined,       // Parsed marriage JSON
  };
}

// ── Registration number generator ──────────────────────────────────────────

// Generates the next sequential registration number server-side (guarantees
// uniqueness). Uses the RAW prisma client so soft-deleted members still occupy
// their regNo — otherwise deleting the highest-numbered member would make the
// next create collide with the reserved value.
async function nextRegNo(): Promise<string> {
  // Query the highest existing regNo across ALL records (including soft-deleted).
  const last = await prisma.christian.findFirst({ orderBy: { regNo: 'desc' } });

  // Extract the numeric suffix from the last regNo (e.g., "REG-2026-001043" → 1043).
  const match = last?.regNo?.match(/(\d+)$/);

  // Increment the numeric part, or start at 1043 if no records exist.
  const next = match ? parseInt(match[1], 10) + 1 : 1043;

  // Format as REG-<current year>-<6-digit zero-padded number>.
  return `REG-${new Date().getFullYear()}-${String(next).padStart(6, '0')}`;
}

// ── Route handlers ─────────────────────────────────────────────────────────

// GET /api/christians — List all Christian records
// Query params: ?status= (filter by status) and ?q= (search across name/regNo fields)
// Response: 200 with array of mapped Christian objects, newest first.
router.get('/', async (req, res, next) => {
  try {
    // Extract optional status filter from query string.
    const status = req.query.status as string | undefined;

    // Extract optional search query, trim whitespace.
    const q = (req.query.q as string | undefined)?.trim();

    // Build Prisma where clause — only add status filter if provided.
    const where: any = {};
    if (status) where.status = status;

    // Filter in memory for case-insensitive search
    // Fetch all matching records ordered by createdAt descending (newest first).
    const rows = await appPrisma.christian.findMany({ where, orderBy: { createdAt: 'desc' } });

    let result = rows;

    // Apply client-side search filter if query string is provided.
    if (q) {
      // Lowercase the search query for case-insensitive matching.
      const lower = q.toLowerCase();

      // Filter rows: match against regNo, baptismalName, secondName, sirName,
      // nationalId, or scc — case-insensitive substring match.
      result = rows.filter((c) =>
        [c.regNo, c.baptismalName, c.secondName, c.sirName, c.nationalId, c.scc]
          .some((v) => v.toLowerCase().includes(lower))
      );
    }

    // Map raw Prisma records to API response shape (deserialize JSON fields).
    res.json(result.map(mapChristian));
  } catch (e) {
    // Pass any error to Express centralized error handler.
    next(e);
  }
});

// GET /api/christians/:id — Fetch a single Christian record by ID
// Response: 200 with mapped Christian object, or 404 if not found.
router.get('/:id', async (req, res, next) => {
  try {
    // Look up the Christian by UUID primary key.
    const c = await appPrisma.christian.findUnique({ where: { id: req.params.id } });

    // Return 404 if no record matches the given ID.
    if (!c) return next(new AppError('Christian not found', 404, 'NOT_FOUND'));

    // Map to API response shape and return.
    res.json(mapChristian(c));
  } catch (e) {
    next(e);
  }
});

// POST /api/christians — Create a new Christian record
// Body: validated against christianSchema (all required fields + optional sacraments)
// Response: 201 with the newly created Christian object.
router.post('/', async (req, res, next) => {
  try {
    // Validate request body against the full christianSchema.
    const data = christianSchema.parse(req.body);

    // Destructure and exclude client-supplied regNo (server generates it).
    const { regNo: _clientRegNo, ...rest } = data;

    // Create the new Christian record with server-generated regNo.
    const created = await appPrisma.christian.create({
      data: {
        ...rest,                                         // All validated fields
        regNo: await nextRegNo(),                        // Auto-generated registration number
        status: data.status ?? 'Active',                 // Default to 'Active' if not specified
        baptism: serializeOptionalJson(data.baptism),    // Serialize baptism JSON
        eucharist: serializeOptionalJson(data.eucharist), // Serialize eucharist JSON
        confirmation: serializeOptionalJson(data.confirmation), // Serialize confirmation JSON
        marriage: serializeOptionalJson(data.marriage),  // Serialize marriage JSON
      },
    });

    // Return 201 Created with the mapped response.
    res.status(201).json(mapChristian(created));

    // Broadcast real-time event to all connected clients.
    emitChange('christians', 'created', mapChristian(created));
  } catch (e) {
    next(e);
  }
});

// PUT /api/christians/:id — Update an existing Christian record (full or partial)
// Body: validated against christianSchema.partial() (all fields optional)
// Response: 200 with the updated Christian object.
router.put('/:id', async (req, res, next) => {
  try {
    // Validate request body — all fields optional (partial update).
    const data = christianSchema.partial().parse(req.body);

    // Update the record by UUID, serializing JSON fields.
    const updated = await appPrisma.christian.update({
      where: { id: req.params.id },
      data: {
        ...data,                                         // Partial validated fields
        baptism: serializeOptionalJson(data.baptism),    // Serialize baptism if provided
        eucharist: serializeOptionalJson(data.eucharist), // Serialize eucharist if provided
        confirmation: serializeOptionalJson(data.confirmation), // Serialize confirmation if provided
        marriage: serializeOptionalJson(data.marriage),  // Serialize marriage if provided
      },
    });

    // Map to API response shape and return.
    res.json(mapChristian(updated));

    // Broadcast real-time event to all connected clients.
    emitChange('christians', 'updated', mapChristian(updated));
  } catch (e) {
    next(e);
  }
});

// PATCH /api/christians/:id/sacraments — Update sacrament objects only
// Body: { baptism?, eucharist?, confirmation?, marriage? } — each a sacrament object or null.
// Response: 200 with the updated Christian object (all fields).
router.patch('/:id/sacraments', async (req, res, next) => {
  try {
    // Validate request body — only sacrament fields, all optional.
    const body = z.object({
      baptism: sacramentSchema,          // Baptism sacrament data (or null/undefined)
      eucharist: sacramentSchema,        // Eucharist sacrament data (or null/undefined)
      confirmation: sacramentSchema,     // Confirmation sacrament data (or null/undefined)
      marriage: sacramentSchema,         // Marriage sacrament data (or null/undefined)
    }).parse(req.body);

    // Update only the sacrament columns on the Christian record.
    const updated = await appPrisma.christian.update({
      where: { id: req.params.id },
      data: {
        baptism: serializeOptionalJson(body.baptism),          // Serialize baptism
        eucharist: serializeOptionalJson(body.eucharist),      // Serialize eucharist
        confirmation: serializeOptionalJson(body.confirmation), // Serialize confirmation
        marriage: serializeOptionalJson(body.marriage),        // Serialize marriage
      },
    });

    // Return full mapped Christian (client needs all fields for UI update).
    res.json(mapChristian(updated));

    // Broadcast real-time event to all connected clients.
    emitChange('christians', 'updated', mapChristian(updated));
  } catch (e) {
    next(e);
  }
});

// DELETE /api/christians/:id — Soft-delete a Christian record
// Sets status to 'Inactive', then calls audit.softDelete() to mark isDeleted=true.
// Response: 204 No Content on success.
router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    // Mark the member Inactive first (raw client: the row is about to be
    // soft-deleted) so the audit snapshot and the API contract (DELETE ->
    // status "Inactive") agree; then soft-delete + audit-log the record.

    // Step 1: Set status to 'Inactive' using the raw Prisma client
    // (bypasses soft-delete filter so we can update the row before marking deleted).
    await prisma.christian.update({
      where: { id: req.params.id },
      data: { status: 'Inactive' },
    });

    // Step 2: Resolve the authenticated user to an actor name for the audit log.
    const actor = await resolveActor(req.user!.id);

    // Step 3: Soft-delete the record — sets isDeleted=true, deletedAt=now,
    // and writes an entry to the audit_logs table.
    await softDelete('Christian', req.params.id, actor);

    // Step 4: Return 204 No Content (successful deletion, no response body).
    res.status(204).send();

    // Broadcast real-time event to all connected clients.
    emitChange('christians', 'deleted', { id: req.params.id });
  } catch (e) {
    next(e);
  }
});

// POST /api/christians/import — Bulk import members from CSV / XLSX
// Body: { rows: object[] } — each object should match ChristianRecord fields.
// Response: { imported, skipped, errors[] }
router.post('/import', async (req, res, next) => {
  try {
    const { rows } = z.object({ rows: z.array(z.record(z.any())).min(1) }).parse(req.body);

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        await appPrisma.christian.create({
          data: {
            regNo: String(row.regNo || '').trim(),
            nationalId: String(row.nationalId || '').trim(),
            baptismalName: String(row.baptismalName || '').trim(),
            secondName: String(row.secondName || '').trim(),
            sirName: String(row.sirName || '').trim(),
            phone: String(row.phone || '').trim(),
            diocese: String(row.diocese || '').trim(),
            parish: String(row.parish || '').trim(),
            localChurch: String(row.localChurch || '').trim(),
            scc: String(row.scc || '').trim(),
            status: row.status || 'Active',
          },
        });
        imported++;
      } catch (e: any) {
        if (e.code === 'P2002') {
          skipped++;
        } else {
          errors.push(`${row.regNo || 'unknown'}: ${e.message}`);
        }
      }
    }

    res.json({ imported, skipped, errors });
  } catch (e) {
    next(e);
  }
});

// Export the router for mounting in index.ts at /api/christians.
export default router;

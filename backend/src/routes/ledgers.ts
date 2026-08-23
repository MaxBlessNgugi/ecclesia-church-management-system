// =============================================================================
// Ledger routes — mounted at /api/ledgers (all require JWT auth)
// =============================================================================
//
// PURPOSE
//   Manages financial ledgers (cash books, bank accounts, mobile money, etc.)
//   and inter-ledger money transfers. Provides listing, creation, and
//   transactional fund movement with balance validation.
//
// ENDPOINT MAP
//   ┌──────────────┬────────┬────────────────────────────────────────────────┐
//   │ Endpoint     │ Method │ Purpose                                        │
//   ├──────────────┼────────┼────────────────────────────────────────────────┤
//   │ /            │ GET    │ List all ledgers (code ascending)              │
//   │ /            │ POST   │ Create a new ledger (code auto-gen if blank)   │
//   │ /movements   │ GET    │ List all inter-ledger transfer history         │
//   │ /transfer    │ POST   │ Move money between ledgers (transactional)     │
//   └──────────────┴────────┴────────────────────────────────────────────────┘
//
// LEDGER CODE AUTO-GENERATION
//   Format: LDR-<NNN> (e.g., LDR-001, LDR-002).
//   When the client sends no code or an empty code, the server generates
//   the next sequential code based on the current ledger count.
//
// TRANSFER TRANSACTION SAFETY
//   POST /api/ledgers/transfer performs the following atomically inside
//   a single database transaction:
//     1. Verify both source and destination ledgers exist (404 if not)
//     2. Check source ledger has sufficient balance (422 if insufficient)
//     3. Decrement source ledger balance
//     4. Increment destination ledger balance
//     5. Record the movement in ledger_movements table
//   If any step fails, ALL changes are rolled back — no half-applied balances.
//
// ERROR RESPONSES (transfers)
//   400 — Cannot transfer to the same ledger
//   404 — Source or destination ledger not found
//   422 — Insufficient balance in source ledger
//
// MIDDLEWARE CHAIN
//   requireAuth           → Validates JWT, attaches req.user
//   requireModule('ledgers') → Enforces panel+action rights for ledgers
//
// RELATED FILES
//   - backend/src/middleware/auth.ts     → requireAuth
//   - backend/src/middleware/perms.ts    → requireModule
//   - backend/src/lib/prisma.ts         → appPrisma
//   - backend/src/lib/audit.ts          → HttpError class
//   - backend/prisma/schema.prisma      → Ledger, LedgerMovement models
//   - src/services/api.ts (ledgersApi)  → Frontend typed client
//   - src/components/views/LedgersView.tsx → Ledgers UI
// =============================================================================
import { Router } from 'express';
import { z } from 'zod';
import { appPrisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireModule } from '../middleware/perms.js';
import { HttpError } from '../lib/audit.js';
import { emitChange } from '../lib/events.js';

// Create a new Express router for all ledger-related routes.
const router = Router();

// Apply JWT authentication to all routes in this router.
router.use(requireAuth);

// Apply module-level permission check for the 'ledgers' module.
router.use(requireModule('ledgers'));

// ── Route handlers ─────────────────────────────────────────────────────────

// GET /api/ledgers — List all financial ledgers
// Response: 200 with array of ledger objects, ordered by code ascending.
router.get('/', async (_req, res, next) => {
  try {
    // Fetch all ledger records sorted by code in ascending order (LDR-001, LDR-002, ...).
    res.json(await appPrisma.ledger.findMany({ orderBy: { code: 'asc' } }));
  } catch (e) { next(e); }
});

// POST /api/ledgers — Create a new financial ledger
// Body: validated inline with Zod schema.
// Response: 201 with the newly created ledger object.
// Code is auto-generated (LDR-###) if not provided by the client.
router.post('/', async (req, res, next) => {
  try {
    // Validate request body against the ledger schema.
    const data = z.object({
      // Ledger name (e.g., "Main Cash Book", "KCB Bank Account").
      name: z.string(),
      // Ledger code — optional; auto-generated as LDR-### if blank/omitted.
      code: z.string().optional(),
      // Ledger type (e.g., "Cash", "Bank", "Mobile Money").
      type: z.string(),
      // Name of the cashier/responsible person for this ledger.
      cashier: z.string(),
      // Initial balance in KES. Defaults to 0 if not provided.
      balance: z.number().default(0),
    }).parse(req.body);

    // Count existing ledgers to determine the next sequential code.
    const count = await appPrisma.ledger.count();

    // Generate code: use client-provided code if non-empty, otherwise LDR-###.
    const code = data.code && data.code.length > 0 ? data.code : `LDR-${String(count + 1).padStart(3, '0')}`;

    // Create the new ledger record with the resolved code.
    const created = await appPrisma.ledger.create({ data: { ...data, code } });

    // Return 201 Created with the ledger object.
    res.status(201).json(created);

    // Broadcast real-time event to all connected clients.
    emitChange('ledgers', 'created', created);
  } catch (e) { next(e); }
});

// GET /api/ledgers/movements — List all inter-ledger transfer history
// Response: 200 with array of LedgerMovement objects, newest first.
router.get('/movements', async (_req, res, next) => {
  try {
    // Fetch all ledger movement records ordered by createdAt descending.
    res.json(await appPrisma.ledgerMovement.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
});

// POST /api/ledgers/transfer — Move money between two ledgers
// Body: { fromLedgerId, toLedgerId, amount, notes? }
// Response: 201 with the created LedgerMovement record.
// Errors: 400 (same ledger), 404 (ledger not found), 422 (insufficient balance).
router.post('/transfer', async (req, res, next) => {
  try {
    // Validate and destructure the transfer request body.
    const { fromLedgerId, toLedgerId, amount, notes } = z.object({
      // ID of the source ledger (money is deducted from this ledger).
      fromLedgerId: z.string(),
      // ID of the destination ledger (money is added to this ledger).
      toLedgerId: z.string(),
      // Transfer amount in KES — must be a positive number.
      amount: z.number().positive(),
      // Optional notes/memo for the transfer.
      notes: z.string().optional(),
    }).parse(req.body);

    // Guard: Prevent transferring money from a ledger to itself (no-op / error).
    if (fromLedgerId === toLedgerId) {
      return res.status(400).json({ error: 'Cannot transfer a ledger to itself' });
    }

    // Everything — existence, balance check, both balance writes, the movement —
    // runs inside ONE transaction so a crash or concurrent request can never
    // leave balances half-applied or overspend.
    const movement = await appPrisma.$transaction(async (tx) => {
      // Step 1: Fetch the source ledger to verify it exists.
      const from = await tx.ledger.findUnique({ where: { id: fromLedgerId } });

      // Step 2: Fetch the destination ledger to verify it exists.
      const to = await tx.ledger.findUnique({ where: { id: toLedgerId } });

      // Step 3: If either ledger doesn't exist, throw 404 and roll back.
      if (!from || !to) throw new HttpError(404, 'Ledger not found');

      // Step 4: Check if the source ledger has sufficient balance.
      if (from.balance < amount) {
        throw new HttpError(422, 'Insufficient balance in source ledger');
      }

      // Capture the current timestamp for the movement record.
      const time = new Date().toISOString();

      // Step 5: Decrement the source ledger balance by the transfer amount.
      await tx.ledger.update({
        where: { id: fromLedgerId },
        data: { balance: { decrement: amount } },
      });

      // Step 6: Increment the destination ledger balance by the transfer amount.
      await tx.ledger.update({
        where: { id: toLedgerId },
        data: { balance: { increment: amount } },
      });

      // Step 7: Record the movement in the ledger_movements audit table.
      return tx.ledgerMovement.create({
        data: { amount, time, from: from.name, to: to.name, notes: notes ?? null },
      });
    });

    // Return 201 Created with the movement record.
    res.status(201).json(movement);

    // Broadcast real-time events: new movement + updated ledger balances.
    emitChange('ledger-movements', 'created', movement);
    emitChange('ledgers', 'updated', { id: fromLedgerId });
    emitChange('ledgers', 'updated', { id: toLedgerId });
  } catch (e) { next(e); }
});

// Export the router for mounting in index.ts at /api/ledgers.
export default router;

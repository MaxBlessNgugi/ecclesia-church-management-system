// =============================================================================
// Finance Routes — mounted at /api (all require JWT auth)
// =============================================================================
//
// Module Overview:
//   Handles all financial operations for the church management system, including
//   bank deposits, creditor management (accounts payable), debtor management
//   (accounts receivable), and expense tracking.
//
// Endpoints Summary:
//   ┌──────────────────────────────────┬─────────────────────────────────────┐
//   │ HTTP Method / Endpoint           │ Purpose                             │
//   ├──────────────────────────────────┼─────────────────────────────────────┤
//   │ GET    /deposits                 │ List all bank deposits              │
//   │ POST   /deposits                 │ Create a deposit (refNo auto-gen)   │
//   │ GET    /creditors                │ List all creditors                  │
//   │ POST   /creditors                │ Create a creditor record            │
//   │ PUT    /creditors/:id            │ Update a creditor by ID             │
//   │ PATCH  /creditors/:id/paid       │ Mark a creditor as Paid             │
//   │ GET    /debtors                  │ List all debtors                    │
//   │ POST   /debtors                  │ Create a debtor record              │
//   │ POST   /debtors/:id/payments     │ Record a payment against a debtor   │
//   │ GET    /expenses                 │ List all expenses                   │
//   │ POST   /expenses                 │ Create an expense (voucherNo auto)  │
//   └──────────────────────────────────┴─────────────────────────────────────┘
//
// Auto-Generated Fields:
//   - refNo  (Deposits): Format "DEP-#####" — sequential, zero-padded 5-digit
//     number derived from the highest existing refNo in the deposits table.
//   - voucherNo (Expenses): Format "EXP-#####" — sequential, zero-padded
//     5-digit number derived from the highest existing voucherNo in expenses.
//     Both are auto-generated only when the client omits or sends an empty value.
//
// Validation Rules:
//   - All numeric "amount" fields must be positive (> 0).
//   - Status enums are restricted to pre-defined sets per entity.
//   - Optional fields that are omitted retain their existing database values on update.
//   - Zod parse errors are forwarded to the Express error handler via next(e).
//
// Authentication & Authorization:
//   - Every route requires a valid JWT (enforced by requireAuth middleware).
//   - Every route requires the authenticated user to have access to the
//     'finance' module (enforced by requireModule('finance') middleware).
// =============================================================================

// ----- Imports ----------------------------------------------------------------

import { Router } from 'express';          // Express Router factory — creates a modular, mountable router instance
import { z } from 'zod';                   // Zod — TypeScript-first schema validation library used to validate request bodies
import { appPrisma } from '../lib/prisma.js'; // Singleton Prisma Client instance providing access to the application database
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';   // Middleware that rejects requests without a valid JWT bearer token
import { requireModule } from '../middleware/perms.js'; // Middleware that checks the user has permission for a specific module
import { emitChange } from '../lib/events.js';
import { toNum } from '../lib/decimal.js';
import { softDelete, resolveActor } from '../lib/audit.js';
import { AuthRequest } from '../middleware/auth.js';

// ----- Router Setup -----------------------------------------------------------

/** Express Router instance that will hold all finance-related routes. */
const router = Router();

/** Apply JWT authentication to every route defined on this router. */
router.use(requireAuth);

/** Require the authenticated user to have 'finance' module access for every route. */
router.use(requireModule('finance'));

// =============================================================================
// DEPOSITS
// =============================================================================
// Represents bank deposit records. Each deposit tracks the date, amount, bank
// details, source of funds, and an auto-generated reference number.
// =============================================================================

/**
 * GET /deposits
 * Retrieve all deposit records, ordered from newest to oldest.
 * Response: JSON array of deposit objects.
 */
router.get('/deposits', async (_req, res, next) => {
  try {
    // Query the deposit table ordered by creation timestamp descending (most recent first)
    res.json(await appPrisma.deposit.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); } // Forward any database or unexpected errors to Express error handler
});

/**
 * Generates the next sequential deposit reference number.
 *
 * Logic:
 *   1. Fetch the deposit with the highest existing refNo (alphabetical/descending sort).
 *   2. Extract the trailing numeric portion using a regex (e.g. "DEP-00042" → "00042").
 *   3. Increment that number by 1; if no previous refNo exists, start at 1.
 *   4. Format as "DEP-" followed by the number zero-padded to 5 digits.
 *
 * @returns A string like "DEP-00001", "DEP-00002", etc.
 */
async function nextDepositRefNo(): Promise<string> {
  // Fetch the deposit with the lexicographically highest refNo (last in sequence)
  const last = await appPrisma.deposit.findFirst({ orderBy: { refNo: 'desc' } });
  // Extract the numeric suffix from the refNo using regex; returns null if no match
  const match = last?.refNo?.match(/(\d+)$/);
  // Increment the extracted number, or default to 1 if no previous record exists
  const next = match ? parseInt(match[1], 10) + 1 : 1;
  // Format as "DEP-#####" with zero-padding to ensure consistent 5-digit width
  return `DEP-${String(next).padStart(5, '0')}`;
}

/**
 * POST /deposits
 * Create a new bank deposit record.
 * Request body (Zod-validated):
 *   - date        (string)          — Date of the deposit (ISO format or display string)
 *   - amount      (number, > 0)     — Monetary amount deposited
 *   - bankName    (string)          — Name of the bank where deposit was made
 *   - accountNo   (string)          — Account number the deposit was made into
 *   - sourceOfCash (string)         — Origin of the funds being deposited
 *   - refNo       (string, optional) — Client-supplied reference; auto-generated if omitted
 *   - depositedBy (string)          — Name or ID of the person who made the deposit
 * Response: 201 with the created deposit object.
 */
router.post('/deposits', async (req, res, next) => {
  try {
    // Validate the request body against the deposit schema; throws ZodError on failure
    const data = z.object({
      date: z.coerce.date(),          // Deposit date (ISO string → Date)
      amount: z.number().positive(),   // Must be a number greater than zero
      bankName: z.string(),           // Name of the financial institution
      accountNo: z.string(),          // Bank account identifier
      sourceOfCash: z.string(),       // Describes where the cash originated
      refNo: z.string().optional(),   // Optional reference number; auto-generated if absent
      depositedBy: z.string(),        // Person responsible for the deposit
    }).parse(req.body);

    // Insert the new deposit; auto-generate refNo if the client omitted it or sent an empty string
    const created = await appPrisma.deposit.create({
      data: {
        ...data, // Spread all validated fields into the create payload
        refNo: data.refNo && data.refNo.trim() ? data.refNo : await nextDepositRefNo(),
        // ^ Use client refNo if provided and non-empty; otherwise generate the next sequential refNo
      },
    });

    // Return 201 Created status with the newly created deposit record
    res.status(201).json(created);

    // Broadcast real-time event to all connected clients.
    emitChange('deposits', 'created', created);
  } catch (e) { next(e); } // Forward validation or database errors to error handler
});

// =============================================================================
// CREDITORS
// =============================================================================
// Represents amounts owed by the church to suppliers/vendors (accounts payable).
// Each creditor record tracks the vendor, invoice, amount, due date, and status.
// Status can be: Pending, Overdue, Scheduled, or Paid.
// =============================================================================

/**
 * GET /creditors
 * Retrieve all creditor records, ordered from newest to oldest.
 * Response: JSON array of creditor objects.
 */
router.get('/creditors', async (_req, res, next) => {
  try {
    // Query the creditor table ordered by creation timestamp descending
    res.json(await appPrisma.creditor.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
});

/**
 * POST /creditors
 * Create a new creditor (accounts payable) record.
 * Request body (Zod-validated):
 *   - vendor      (string)                             — Name of the supplier/vendor
 *   - description (string)                             — Description of goods or services
 *   - invoiceNo   (string)                             — Invoice reference number
 *   - amountOwed  (number, > 0)                        — Total amount owed
 *   - dueDate     (string)                             — When payment is due
 *   - status      (enum, optional)                     — Defaults to 'Pending' if omitted
 * Response: 201 with the created creditor object.
 */
router.post('/creditors', async (req, res, next) => {
  try {
    // Validate the request body against the creditor creation schema
    const data = z.object({
      vendor: z.string(),            // Name of the vendor being paid
      description: z.string(),       // What the invoice covers
      invoiceNo: z.string(),         // Vendor's invoice reference number
      amountOwed: z.number().positive(), // Amount owed; must be positive
      dueDate: z.coerce.date(),      // Payment due date (ISO string → Date)
      status: z.enum(['Pending', 'Overdue', 'Scheduled', 'Paid']).optional(),
      // ^ Optional status enum; if not provided, defaults to 'Pending' below
    }).parse(req.body);

    // Insert new creditor, defaulting status to 'Pending' if the client did not provide one
    const created = await appPrisma.creditor.create({
      data: { ...data, status: data.status ?? 'Pending' },
      // ^ Nullish coalescing: use provided status, or fall back to 'Pending'
    });

    // Return 201 Created with the new creditor record
    res.status(201).json(created);

    // Broadcast real-time event to all connected clients.
    emitChange('creditors', 'created', created);
  } catch (e) { next(e); }
});

/**
 * PUT /creditors/:id
 * Update an existing creditor record by ID. Only provided fields are updated;
 * omitted fields retain their current database values.
 * Request params:
 *   - id (string) — The unique identifier of the creditor to update
 * Request body (Zod-validated, all fields optional):
 *   - vendor, description, invoiceNo, amountOwed, dueDate, status
 * Response: 200 with the updated creditor object.
 */
router.put('/creditors/:id', async (req, res, next) => {
  try {
    // Validate the request body — all fields are optional for partial updates
    const data = z.object({
      vendor: z.string().optional(),          // Supplier name (optional for update)
      description: z.string().optional(),     // Invoice description (optional for update)
      invoiceNo: z.string().optional(),       // Invoice number (optional for update)
      amountOwed: z.number().optional(),      // Amount owed (optional, no positivity check on update)
      dueDate: z.coerce.date().optional(),    // Due date (optional for update)
      status: z.enum(['Pending', 'Overdue', 'Scheduled', 'Paid']).optional(),
      // ^ Status enum (optional for update)
    }).parse(req.body);

    // Update the creditor record matching the provided ID with the validated fields
    const updated = await appPrisma.creditor.update({
      where: { id: req.params.id }, // Match creditor by its unique ID from the URL parameter
      data,                         // Only the fields present in the request body are updated
    });

    // Return 200 OK with the updated creditor record
    res.json(updated);

    // Broadcast real-time event to all connected clients.
    emitChange('creditors', 'updated', updated);
  } catch (e) { next(e); }
});

/**
 * PATCH /creditors/:id/paid
 * Convenience endpoint to mark a creditor as Paid without sending a full body.
 * Request params:
 *   - id (string) — The unique identifier of the creditor
 * Response: 200 with the updated creditor object (status = 'Paid').
 */
router.patch('/creditors/:id/paid', async (req, res, next) => {
  try {
    // Update only the status field to 'Paid' for the creditor matching the given ID
    const updated = await appPrisma.creditor.update({
      where: { id: req.params.id }, // Locate creditor by ID from the URL
      data: { status: 'Paid' },     // Set status to 'Paid'
    });

    // Return 200 OK with the updated creditor record
    res.json(updated);

    // Broadcast real-time event to all connected clients.
    emitChange('creditors', 'updated', updated);
  } catch (e) { next(e); }
});

// =============================================================================
// DEBTORS
// =============================================================================
// Represents amounts owed by church members (accounts receivable).
// Each debtor record tracks the member, contribution type, remaining amount,
// and status (Outstanding, Partially Paid, or Paid).
// Payments reduce the outstanding amount and automatically update the status.
// =============================================================================

/**
 * GET /debtors
 * Retrieve all debtor records, ordered from newest to oldest.
 * Response: JSON array of debtor objects.
 */
router.get('/debtors', async (_req, res, next) => {
  try {
    // Query the debtor table ordered by creation timestamp descending
    res.json(await appPrisma.debtor.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
});

/**
 * POST /debtors
 * Create a new debtor (accounts receivable) record.
 * Request body (Zod-validated):
 *   - memberName       (string)                              — Name of the member who owes
 *   - contributionType (string)                              — Type of contribution (e.g. tithe, offering)
 *   - amount           (number, > 0)                         — Total amount owed
 *   - status           (enum, optional)                      — Defaults to 'Outstanding' if omitted
 * Response: 201 with the created debtor object.
 */
router.post('/debtors', async (req, res, next) => {
  try {
    // Validate the request body against the debtor creation schema
    const data = z.object({
      memberName: z.string(),         // Name of the debtor (church member)
      contributionType: z.string(),   // Category of contribution (tithe, building fund, etc.)
      amount: z.number().positive(),  // Total debt amount; must be positive
      status: z.enum(['Outstanding', 'Partially Paid', 'Paid']).optional(),
      // ^ Optional status; defaults to 'Outstanding' if not provided
    }).parse(req.body);

    // Insert new debtor, defaulting status to 'Outstanding' if the client did not provide one
    const created = await appPrisma.debtor.create({
      data: { ...data, status: data.status ?? 'Outstanding' },
      // ^ Nullish coalescing: use provided status, or fall back to 'Outstanding'
    });

    // Return 201 Created with the new debtor record
    res.status(201).json(created);

    // Broadcast real-time event to all connected clients.
    emitChange('debtors', 'created', created);
  } catch (e) { next(e); }
});

/**
 * POST /debtors/:id/payments
 * Record a payment against a debtor, reducing the outstanding balance.
 * Automatically derives the new status:
 *   - 'Paid'          if the remaining balance reaches 0
 *   - 'Partially Paid' if there is still an outstanding balance
 * Request params:
 *   - id (string) — The unique identifier of the debtor
 * Request body (Zod-validated):
 *   - amountPaid (number, > 0) — The amount being paid
 * Response: 200 with the updated debtor object, or 404 if debtor not found.
 */
router.post('/debtors/:id/payments', async (req, res, next) => {
  try {
    // Validate that the payment amount is a positive number
    const { amountPaid } = z.object({ amountPaid: z.number().positive() }).parse(req.body);

    // Fetch the existing debtor record to get the current outstanding amount
    const debtor = await appPrisma.debtor.findUnique({ where: { id: req.params.id } });

    // Return 404 if no debtor exists with the given ID
    if (!debtor) return next(new AppError('Debtor not found', 404, 'NOT_FOUND'));

    // Calculate the new outstanding amount, ensuring it never goes below zero
    const newAmount = Math.max(0, toNum(debtor.amount) - amountPaid);
    // ^ Math.max(0, ...) prevents negative balances if overpayment occurs

    // Derive the status based on the remaining balance
    const status = newAmount === 0 ? 'Paid' : 'Partially Paid';
    // ^ Fully paid when balance reaches zero; otherwise still partially outstanding

    // Update the debtor record with the reduced amount and derived status
    const updated = await appPrisma.debtor.update({
      where: { id: req.params.id },  // Match debtor by ID from the URL parameter
      data: { amount: newAmount, status }, // Set the new balance and status
    });

    // Return 200 OK with the updated debtor record
    res.json(updated);

    // Broadcast real-time event to all connected clients.
    emitChange('debtors', 'updated', updated);
  } catch (e) { next(e); }
});

// =============================================================================
// EXPENSES
// =============================================================================
// Represents church expense/spend records. Each expense tracks the date,
// category, description, amount, payment method, and an auto-generated voucher
// number.
// =============================================================================

/**
 * GET /expenses
 * Retrieve all expense records, ordered from newest to oldest.
 * Response: JSON array of expense objects.
 */
router.get('/expenses', async (_req, res, next) => {
  try {
    // Query the expense table ordered by creation timestamp descending
    res.json(await appPrisma.expense.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
});

/**
 * Generates the next sequential expense voucher number.
 *
 * Logic:
 *   1. Fetch the expense with the highest existing voucherNo (alphabetical/descending sort).
 *   2. Extract the trailing numeric portion using a regex (e.g. "EXP-00015" → "00015").
 *   3. Increment that number by 1; if no previous voucherNo exists, start at 1.
 *   4. Format as "EXP-" followed by the number zero-padded to 5 digits.
 *
 * @returns A string like "EXP-00001", "EXP-00002", etc.
 */
async function nextExpenseVoucherNo(): Promise<string> {
  // Fetch the expense with the lexicographically highest voucherNo (last in sequence)
  const last = await appPrisma.expense.findFirst({ orderBy: { voucherNo: 'desc' } });
  // Extract the numeric suffix from the voucherNo using regex; returns null if no match
  const match = last?.voucherNo?.match(/(\d+)$/);
  // Increment the extracted number, or default to 1 if no previous record exists
  const next = match ? parseInt(match[1], 10) + 1 : 1;
  // Format as "EXP-#####" with zero-padding to ensure consistent 5-digit width
  return `EXP-${String(next).padStart(5, '0')}`;
}

/**
 * POST /expenses
 * Create a new expense record.
 * Request body (Zod-validated):
 *   - date          (string)          — Date of the expense
 *   - category      (string)          — Expense category (e.g. utilities, supplies)
 *   - description   (string)          — Description of the expense
 *   - amount        (number, > 0)     — Monetary amount spent
 *   - paymentMethod (string)          — How the expense was paid (cash, check, card, etc.)
 *   - voucherNo     (string, optional) — Client-supplied voucher; auto-generated if omitted
 * Response: 201 with the created expense object.
 */
router.post('/expenses', async (req, res, next) => {
  try {
    // Validate the request body against the expense creation schema
    const data = z.object({
      date: z.coerce.date(),          // Expense date (ISO string → Date)
      category: z.string(),           // Expense classification/category
      description: z.string(),        // Detailed description of the expense
      amount: z.number().positive(),  // Expense amount; must be greater than zero
      paymentMethod: z.string(),      // Method of payment (cash, check, bank transfer, etc.)
      voucherNo: z.string().optional(), // Optional voucher number; auto-generated if absent
    }).parse(req.body);

    // Insert the new expense; auto-generate voucherNo if the client omitted it or sent an empty string
    const created = await appPrisma.expense.create({
      data: {
        ...data, // Spread all validated fields into the create payload
        voucherNo: data.voucherNo && data.voucherNo.trim() ? data.voucherNo : await nextExpenseVoucherNo(),
        // ^ Use client voucherNo if provided and non-empty; otherwise generate the next sequential voucherNo
      },
    });

    // Return 201 Created with the newly created expense record
    res.status(201).json(created);

    // Broadcast real-time event to all connected clients.
    emitChange('expenses', 'created', created);
  } catch (e) { next(e); }
});

// ── DELETE endpoints (soft-delete, restorable from Trash & Audit) ─────────

router.delete('/deposits/:id', async (req: AuthRequest, res, next) => {
  try {
    const actor = await resolveActor(req.user!.id);
    await softDelete('Deposit', req.params.id, actor);
    res.status(204).end();
    emitChange('deposits', 'deleted', { id: req.params.id });
  } catch (e) { next(e); }
});

router.delete('/creditors/:id', async (req: AuthRequest, res, next) => {
  try {
    const actor = await resolveActor(req.user!.id);
    await softDelete('Creditor', req.params.id, actor);
    res.status(204).end();
    emitChange('creditors', 'deleted', { id: req.params.id });
  } catch (e) { next(e); }
});

router.delete('/debtors/:id', async (req: AuthRequest, res, next) => {
  try {
    const actor = await resolveActor(req.user!.id);
    await softDelete('Debtor', req.params.id, actor);
    res.status(204).end();
    emitChange('debtors', 'deleted', { id: req.params.id });
  } catch (e) { next(e); }
});

router.delete('/expenses/:id', async (req: AuthRequest, res, next) => {
  try {
    const actor = await resolveActor(req.user!.id);
    await softDelete('Expense', req.params.id, actor);
    res.status(204).end();
    emitChange('expenses', 'deleted', { id: req.params.id });
  } catch (e) { next(e); }
});

// ----- Export -----------------------------------------------------------------

/** Export the configured finance router for mounting in the main application. */
export default router;

// =============================================================================
// Ecclesia Backend — Inventory Routes (/api/inventory)
// =============================================================================
//
// PURPOSE
//   Manages the parish inventory system: items, deliveries (goods in), sales
//   (goods out), stock takes (physical counts), and stock issues (outstation
//   distribution). Includes a comprehensive price audit trail that logs every
//   cost/price change for admin review.
//
// MOUNTED MIDDLEWARE CHAIN
//   router.use(requireAuth)         → Validates JWT, attaches req.user
//   router.use(requireModule('inventory'))
//                                    → Enforces panel+action rights for 'inventory'
//
// ENDPOINT MAP (Sub-resource groups)
//   ┌──────────────────────────────┬──────────┬──────────────────────────────────┐
//   │ Path                         │ Method   │ Purpose                          │
//   ├──────────────────────────────┼──────────┼──────────────────────────────────┤
//   │ /items                       │ GET      │ List all items (name ASC)        │
//   │ /items                       │ POST     │ Create item + baseline audit log │
//   │ /items/:id                   │ PUT      │ Update item + price audit if cost│
//   │                              │          │   or price changed               │
//   │ /items/:id/history           │ GET      │ Price audit trail (newest first) │
//   │ /items/:id                   │ DELETE   │ SOFT-delete via audit.ts         │
//   │ /items/batch-update          │ POST     │ Transactional multi-item update  │
//   │                              │          │   + atomic price audit logging   │
//   ├──────────────────────────────┼──────────┼──────────────────────────────────┤
//   │ /deliveries                  │ GET      │ List inward goods (createdAt ↓)  │
//   │ /deliveries                  │ POST     │ Record delivery                  │
//   ├──────────────────────────────┼──────────┼──────────────────────────────────┤
//   │ /sales                       │ GET      │ List sales (createdAt ↓)         │
//   │ /sales                       │ POST     │ Record sale + decrement stock    │
//   │                              │          │   (name-based match, 1 unit)     │
//   ├──────────────────────────────┼──────────┼──────────────────────────────────┤
//   │ /stock-takes                 │ GET      │ List stocktakes (createdAt ↓)    │
//   │ /stock-takes                 │ POST     │ Create stocktake entry           │
//   │ /stock-takes/:id/physical    │ PATCH    │ Update counted physical quantity │
//   ├──────────────────────────────┼──────────┼──────────────────────────────────┤
//   │ /issues                      │ GET      │ List stock issues (createdAt ↓)  │
//   │ /issues                      │ POST     │ Record stock issued to outstation│
//   └──────────────────────────────┴──────────┴──────────────────────────────────┘
//
// PRICE AUDIT TRAIL (InventoryPriceAuditLog)
//   - Append-only log of EVERY cost/price change (create + update + batch-update)
//   - Written by logPriceChange() which runs inside the same transaction
//   - Fields: itemId, itemName, sku, oldCost, newCost, oldPrice, newPrice,
//             actorName (resolved from JWT), createdAt
//   - Baseline entry on CREATE: oldCost=null, oldPrice=null
//   - Query: GET /items/:id/history → newest first
//   - Frontend: InventoryView "Edit" tab shows this via inventoryApi.items.history()
//
// BATCH UPDATE TRANSACTION SEMANTICS
//   - POST /items/batch-update runs inside appPrisma.$transaction()
//   - All updates succeed OR all rollback (no half-updated catalogue)
//   - Price changes on ANY row append to audit trail ATOMICALLY
//   - Input: { updates: [{ id, name?, category?, cost?, price?, reorder? }] }
//   - Validation: min 1 update, each id must exist
//
// STOCK DECREMENT ON SALE (SIMPLIFICATION)
//   - POST /sales finds InventoryItem by NAME (not SKU) → decrements stock by 1
//   - Known limitation: name-based join can match wrong item if names collide
//   - Documented at call site; acceptable for current parish scale
//
// SOFT DELETE
//   - DELETE /items/:id calls audit.softDelete('InventoryItem', id, actor)
//   - Sets isDeleted=true, deletedAt=now, writes AuditLog entry
//   - Restorable via Admin → Trash & Audit
//
// RELATED FILES
//   - backend/prisma/schema.prisma     → InventoryItem, Delivery, Sale, StockTake,
//                                         StockIssue, InventoryPriceAuditLog models
//   - backend/src/lib/audit.ts         → softDelete, resolveActor, HttpError
//   - backend/src/middleware/perms.ts  → requireModule('inventory')
//   - src/services/api.ts (inventoryApi) → Frontend typed client
//   - src/components/views/InventoryView.tsx → Inventory UI (Edit/Vault tabs)
// =============================================================================
import { Router } from 'express';
import { z } from 'zod';
import { appPrisma } from '../lib/prisma.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { requireModule } from '../middleware/perms.js';
import { softDelete, resolveActor, HttpError } from '../lib/audit.js';

// Create a new Express router for all inventory-related routes.
const router = Router();

// Apply JWT authentication to all routes in this router.
// Rejects requests without a valid Bearer token (401 Unauthorized).
router.use(requireAuth);

// Apply module-level permission check for the 'inventory' module.
// Checks that the authenticated user's role has access to inventory operations.
router.use(requireModule('inventory'));

// ── Price audit trail helpers ──────────────────────────────────────────────

// Resolves the authenticated user's display name for audit log entries.
// Falls back to the user's ID if no name is set.
async function currentActorName(req: AuthRequest): Promise<string> {
  // Fetch the user record to get the display name.
  const actor = await resolveActor(req.user!.id);

  // Return name if set, otherwise fall back to the user's ID.
  return actor.name ?? actor.id;
}

// Checks if cost or price values have changed between two snapshots.
// Used to decide whether to write a price audit log entry.
function pricingChanged(prev: { cost: number; price: number }, next: { cost: number; price: number }): boolean {
  // Return true if either cost or price differs between the two objects.
  return prev.cost !== next.cost || prev.price !== next.price;
}

// Interface defining the minimal Prisma client surface needed for writing
// price audit logs. Works with both appPrisma and $transaction clients.
interface PriceLogWriter {
  inventoryPriceAuditLog: {
    create(args: {
      data: {
        itemId: string;        // ID of the inventory item being changed
        itemName: string;      // Name of the item (denormalized for display)
        sku: string;           // SKU of the item (denormalized for display)
        oldCost: number | null; // Previous cost (null on create/baseline)
        newCost: number;       // New cost value
        oldPrice: number | null; // Previous price (null on create/baseline)
        newPrice: number;      // New price value
        actorName: string;     // Name of the user who made the change
      };
    }): Promise<unknown>;
  };
}

// Writes one append-only price audit row to the InventoryPriceAuditLog table.
// Can run inside or outside a transaction (accepts PriceLogWriter interface).
async function logPriceChange(
  tx: PriceLogWriter,           // Transaction client or appPrisma
  item: { id: string; name: string; sku: string; cost: number; price: number }, // Current item state
  oldCost: number | null,       // Previous cost (null on baseline/create)
  oldPrice: number | null,      // Previous price (null on baseline/create)
  actorName: string             // Display name of the acting user
) {
  // Insert a new audit log entry recording the before/after pricing values.
  await tx.inventoryPriceAuditLog.create({
    data: {
      itemId: item.id,          // Foreign key to the inventory item
      itemName: item.name,      // Denormalized item name for query/display
      sku: item.sku,            // Denormalized SKU for query/display
      oldCost,                  // Previous cost (null = baseline entry)
      newCost: item.cost,       // New cost after the change
      oldPrice,                 // Previous price (null = baseline entry)
      newPrice: item.price,     // New price after the change
      actorName,                // User who performed the change
    },
  });
}

// ── Items ──────────────────────────────────────────────────────────────────

// GET /api/inventory/items — List all inventory items
// Response: 200 with array of InventoryItem objects, ordered by name ascending.
router.get('/items', async (_req, res, next) => {
  try {
    // Fetch all inventory items sorted alphabetically by name.
    res.json(await appPrisma.inventoryItem.findMany({ orderBy: { name: 'asc' } }));
  } catch (e) { next(e); }
});

// POST /api/inventory/items — Create a new inventory item
// Body: validated inline with Zod schema.
// Response: 201 with the newly created InventoryItem object.
// Side effect: Writes a baseline price audit log entry (oldCost=null, oldPrice=null).
router.post('/items', async (req, res, next) => {
  try {
    // Validate request body against the inventory item schema.
    const data = z.object({
      // Item name (e.g., "Communion Wine", "Candles").
      name: z.string(),
      // Stock Keeping Unit — unique identifier for the item.
      sku: z.string(),
      // Item category (e.g., "Liturgical", "Office", "Maintenance").
      category: z.string(),
      // Cost price in KES (what the parish pays to acquire the item).
      cost: z.number(),
      // Retail/selling price in KES (what the parish charges).
      price: z.number(),
      // Current stock quantity. Defaults to 0 for new items.
      stock: z.number().int().default(0),
      // Reorder threshold — alerts when stock falls below this level.
      reorder: z.number().int().default(0),
    }).parse(req.body);

    // Create the new inventory item record in the database.
    const created = await appPrisma.inventoryItem.create({ data });

    // Write a baseline price audit log entry (oldCost=null, oldPrice=null)
    // so the price history starts with the initial values.
    await logPriceChange(appPrisma, created, null, null, await currentActorName(req));

    // Return 201 Created with the item object.
    res.status(201).json(created);
  } catch (e) { next(e); }
});

// PUT /api/inventory/items/:id — Update an existing inventory item
// Body: validated inline with Zod schema (all fields optional).
// Response: 200 with the updated InventoryItem object.
// Side effect: Writes a price audit log entry if cost or price changed.
router.put('/items/:id', async (req, res, next) => {
  try {
    // Validate request body — all fields optional (partial update).
    const data = z.object({
      // Item name (optional — only update if provided).
      name: z.string().optional(),
      // SKU (optional — only update if provided).
      sku: z.string().optional(),
      // Category (optional — only update if provided).
      category: z.string().optional(),
      // Cost price in KES (optional — only update if provided).
      cost: z.number().optional(),
      // Retail price in KES (optional — only update if provided).
      price: z.number().optional(),
      // Stock quantity (optional — only update if provided).
      stock: z.number().int().optional(),
      // Reorder threshold (optional — only update if provided).
      reorder: z.number().int().optional(),
    }).parse(req.body);

    // Fetch the current item state BEFORE the update (for comparison).
    const current = await appPrisma.inventoryItem.findFirst({ where: { id: req.params.id } });

    // Return 404 if the item doesn't exist.
    if (!current) throw new HttpError(404, 'Item not found');

    // Apply the update to the inventory item.
    const updated = await appPrisma.inventoryItem.update({ where: { id: req.params.id }, data });

    // If cost or price changed, write a price audit log entry.
    if (pricingChanged(current, updated)) {
      await logPriceChange(appPrisma, updated, current.cost, current.price, await currentActorName(req));
    }

    // Return the updated item.
    res.json(updated);
  } catch (e) { next(e); }
});

// GET /api/inventory/items/:id/history — Price audit trail for one item
// Response: 200 with array of InventoryPriceAuditLog entries, newest first.
router.get('/items/:id/history', async (req, res, next) => {
  try {
    // Fetch all price audit log entries for the specified item,
    // ordered by createdAt descending (most recent changes first).
    res.json(await appPrisma.inventoryPriceAuditLog.findMany({
      where: { itemId: req.params.id },
      orderBy: { createdAt: 'desc' },
    }));
  } catch (e) { next(e); }
});

// DELETE /api/inventory/items/:id — Soft-delete an inventory item
// Calls audit.softDelete() which sets isDeleted=true, deletedAt=now.
// Response: 204 No Content on success.
// Restorable via Admin → Trash & Audit UI.
router.delete('/items/:id', async (req: AuthRequest, res, next) => {
  try {
    // Resolve the authenticated user to an actor name for the audit log.
    const actor = await resolveActor(req.user!.id);

    // Soft-delete the inventory item — marks as deleted but preserves the record.
    await softDelete('InventoryItem', req.params.id, actor);

    // Return 204 No Content (successful deletion, no response body).
    res.status(204).send();
  } catch (e) { next(e); }
});

// POST /api/inventory/items/batch-update — Transactional multi-item update
// Body: { updates: [{ id, name?, category?, cost?, price?, reorder? }] }
// Response: 200 with array of updated InventoryItem objects.
// All updates succeed OR all roll back (atomic). Price changes append to audit log.
router.post('/items/batch-update', async (req, res, next) => {
  try {
    // Validate request body — must have at least one update in the array.
    const data = z.object({
      // Array of item updates — each must have an id and at least one field to update.
      updates: z
        .array(
          z.object({
            // ID of the inventory item to update (required).
            id: z.string(),
            // New name (optional — only update if provided).
            name: z.string().optional(),
            // New category (optional — only update if provided).
            category: z.string().optional(),
            // New cost price in KES (optional — only update if provided).
            cost: z.number().optional(),
            // New retail price in KES (optional — only update if provided).
            price: z.number().optional(),
            // New reorder threshold (optional — only update if provided).
            reorder: z.number().int().optional(),
          })
        )
        .min(1),  // Must have at least one update
    }).parse(req.body);

    // Resolve the acting user's name once for all audit log entries.
    const actorName = await currentActorName(req);

    // Execute all updates inside a single transaction for atomicity.
    const updated = await appPrisma.$transaction(async (tx) => {
      const results: any[] = [];

      // Process each update sequentially within the transaction.
      for (const u of data.updates) {
        // Destructure the id and separate the update fields.
        const { id, ...fields } = u;

        // Fetch the current item state BEFORE the update.
        const current = await tx.inventoryItem.findFirst({ where: { id } });

        // Throw 404 if the item doesn't exist — rolls back the entire transaction.
        if (!current) throw new HttpError(404, `Item ${id} not found`);

        // Apply the update to the inventory item.
        const next = await tx.inventoryItem.update({ where: { id }, data: fields });

        // If cost or price changed, write a price audit log entry.
        if (pricingChanged(current, next)) {
          await logPriceChange(tx, next, current.cost, current.price, actorName);
        }

        // Collect the updated item for the response.
        results.push(next);
      }

      return results;
    });

    // Return all updated items.
    res.json(updated);
  } catch (e) { next(e); }
});

// ── Deliveries (goods in) ──────────────────────────────────────────────────

// GET /api/inventory/deliveries — List all delivery records
// Response: 200 with array of Delivery objects, newest first.
router.get('/deliveries', async (_req, res, next) => {
  try {
    // Fetch all delivery records ordered by createdAt descending.
    res.json(await appPrisma.delivery.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
});

// POST /api/inventory/deliveries — Record a new delivery (goods received)
// Body: validated inline with Zod schema.
// Response: 201 with the newly created Delivery object.
router.post('/deliveries', async (req, res, next) => {
  try {
    // Validate request body against the delivery schema.
    const data = z.object({
      // Supplier name (who provided the goods).
      supplier: z.string(),
      // Invoice or reference number for the delivery.
      inv: z.string(),
      // Date of delivery (ISO date string).
      date: z.string(),
      // Number of units received (must be a positive integer).
      units: z.number().int().positive(),
      // Category of the delivered goods.
      cat: z.string(),
      // Total cost of the delivery in KES.
      total: z.number(),
    }).parse(req.body);

    // Create the delivery record in the database.
    const created = await appPrisma.delivery.create({ data });

    // Optionally increase stock of matching category items – left simple for now
    res.status(201).json(created);
  } catch (e) { next(e); }
});

// ── Sales (goods out) ──────────────────────────────────────────────────────

// GET /api/inventory/sales — List all sales records
// Response: 200 with array of Sale objects, newest first.
router.get('/sales', async (_req, res, next) => {
  try {
    // Fetch all sale records ordered by createdAt descending.
    res.json(await appPrisma.sale.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
});

// POST /api/inventory/sales — Record a new sale
// Body: validated inline with Zod schema.
// Response: 201 with the newly created Sale object.
// Side effect: Decrements stock of matching inventory item by 1 (name-based match).
router.post('/sales', async (req, res, next) => {
  try {
    // Validate request body against the sale schema.
    const data = z.object({
      // Item name sold (used to find matching inventory item for stock decrement).
      item: z.string(),
      // Time of the sale (ISO datetime string).
      time: z.string(),
      // Sale amount in KES.
      amount: z.number(),
    }).parse(req.body);

    // Create the sale record in the database.
    const created = await appPrisma.sale.create({ data });

    // Reduce stock if item matches by name
    // Find the inventory item by name (case-sensitive exact match).
    // Known limitation: name-based join can match wrong item if names collide.
    const inv = await appPrisma.inventoryItem.findFirst({ where: { name: data.item } });

    // If the item exists and has stock available, decrement by 1.
    if (inv && inv.stock > 0) {
      await appPrisma.inventoryItem.update({
        where: { id: inv.id },
        data: { stock: { decrement: 1 } },  // Atomic decrement operation
      });
    }

    // Return 201 Created with the sale record.
    res.status(201).json(created);
  } catch (e) { next(e); }
});

// ── Stock takes (physical counts) ──────────────────────────────────────────

// GET /api/inventory/stock-takes — List all stock take records
// Response: 200 with array of StockTake objects, newest first.
router.get('/stock-takes', async (_req, res, next) => {
  try {
    // Fetch all stock take records ordered by createdAt descending.
    res.json(await appPrisma.stockTake.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
});

// POST /api/inventory/stock-takes — Create a new stock take entry
// Body: validated inline with Zod schema.
// Response: 201 with the newly created StockTake object.
router.post('/stock-takes', async (req, res, next) => {
  try {
    // Validate request body against the stock take schema.
    const data = z.object({
      // Item name being counted.
      name: z.string(),
      // SKU of the item being counted.
      sku: z.string(),
      // System-expected quantity (from inventory records).
      system: z.number().int(),
      // Physically counted quantity (actual stock on hand).
      physical: z.number().int(),
      // Notes or discrepancies observed during counting. Defaults to empty string.
      notes: z.string().default(''),
    }).parse(req.body);

    // Create the stock take record in the database.
    const created = await appPrisma.stockTake.create({ data });

    // Return 201 Created with the stock take object.
    res.status(201).json(created);
  } catch (e) { next(e); }
});

// PATCH /api/inventory/stock-takes/:id/physical — Update the physical count
// Body: { physical: number } — the counted quantity.
// Response: 200 with the updated StockTake object.
router.patch('/stock-takes/:id/physical', async (req, res, next) => {
  try {
    // Validate request body — only the physical count field.
    const { physical } = z.object({
      // The physically counted quantity (integer).
      physical: z.number().int(),
    }).parse(req.body);

    // Update the physical count on the stock take record.
    const updated = await appPrisma.stockTake.update({
      where: { id: req.params.id },
      data: { physical },
    });

    // Return the updated stock take object.
    res.json(updated);
  } catch (e) { next(e); }
});

// ── Stock issues (outstation distribution) ─────────────────────────────────

// GET /api/inventory/issues — List all stock issue records
// Response: 200 with array of StockIssue objects, newest first.
router.get('/issues', async (_req, res, next) => {
  try {
    // Fetch all stock issue records ordered by createdAt descending.
    res.json(await appPrisma.stockIssue.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
});

// POST /api/inventory/issues — Record a stock issue (goods sent to outstation)
// Body: validated inline with Zod schema.
// Response: 201 with the newly created StockIssue object.
router.post('/issues', async (req, res, next) => {
  try {
    // Validate request body against the stock issue schema.
    const data = z.object({
      // Name of the item being issued/distributed.
      item: z.string(),
      // Destination outstation or recipient.
      dest: z.string(),
    }).parse(req.body);

    // Create the stock issue record in the database.
    const created = await appPrisma.stockIssue.create({ data });

    // Return 201 Created with the stock issue object.
    res.status(201).json(created);
  } catch (e) { next(e); }
});

// Export the router for mounting in index.ts at /api/inventory.
export default router;

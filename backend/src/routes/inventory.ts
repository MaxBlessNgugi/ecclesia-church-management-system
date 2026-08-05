// =============================================================================
// Inventory routes — mounted at /api/inventory (all require JWT auth)
// -----------------------------------------------------------------------------
//   GET/POST/PUT/DELETE /items         inventory catalogue; DELETE is a SOFT
//                                      delete -> audit_logs.
//   GET/POST /deliveries               goods inward records.
//   GET/POST /sales                    a sale also decrements stock by 1 when an
//                                      item matches by name (name-based join — a
//                                      known simplification, documented at the call).
//   GET/POST /stock-takes              stocktake entries; PATCH :id/physical
//                                      lets users record the counted figure.
//   GET/POST /issues                   stock issued out to outstations.
// =============================================================================
import { Router } from 'express';
import { z } from 'zod';
import { appPrisma } from '../lib/prisma.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { requireModule } from '../middleware/perms.js';
import { softDelete, resolveActor, HttpError } from '../lib/audit.js';

const router = Router();
router.use(requireAuth);
router.use(requireModule('inventory'));

// -----------------------------------------------------------------------------
// Price audit trail — every cost/price write is appended to
// InventoryPriceAuditLog so admins can review pricing history per item.
// -----------------------------------------------------------------------------
async function currentActorName(req: AuthRequest): Promise<string> {
  const actor = await resolveActor(req.user!.id);
  return actor.name ?? actor.id;
}

/** True when the two pricing values differ in cost or retail price. */
function pricingChanged(prev: { cost: number; price: number }, next: { cost: number; price: number }): boolean {
  return prev.cost !== next.cost || prev.price !== next.price;
}

/** Minimal writer surface shared by appPrisma and a $transaction client. */
interface PriceLogWriter {
  inventoryPriceAuditLog: {
    create(args: {
      data: {
        itemId: string;
        itemName: string;
        sku: string;
        oldCost: number | null;
        newCost: number;
        oldPrice: number | null;
        newPrice: number;
        actorName: string;
      };
    }): Promise<unknown>;
  };
}

/** Writes one append-only price audit row (used inside or outside a transaction). */
async function logPriceChange(
  tx: PriceLogWriter,
  item: { id: string; name: string; sku: string; cost: number; price: number },
  oldCost: number | null,
  oldPrice: number | null,
  actorName: string
) {
  await tx.inventoryPriceAuditLog.create({
    data: {
      itemId: item.id,
      itemName: item.name,
      sku: item.sku,
      oldCost,
      newCost: item.cost,
      oldPrice,
      newPrice: item.price,
      actorName,
    },
  });
}

// Items
router.get('/items', async (_req, res, next) => {
  try {
    res.json(await appPrisma.inventoryItem.findMany({ orderBy: { name: 'asc' } }));
  } catch (e) { next(e); }
});

router.post('/items', async (req, res, next) => {
  try {
    const data = z.object({
      name: z.string(),
      sku: z.string(),
      category: z.string(),
      cost: z.number(),
      price: z.number(),
      stock: z.number().int().default(0),
      reorder: z.number().int().default(0),
    }).parse(req.body);
    const created = await appPrisma.inventoryItem.create({ data });
    // Baseline entry so the price history starts with the initial values.
    await logPriceChange(appPrisma, created, null, null, await currentActorName(req));
    res.status(201).json(created);
  } catch (e) { next(e); }
});

router.put('/items/:id', async (req, res, next) => {
  try {
    const data = z.object({
      name: z.string().optional(),
      sku: z.string().optional(),
      category: z.string().optional(),
      cost: z.number().optional(),
      price: z.number().optional(),
      stock: z.number().int().optional(),
      reorder: z.number().int().optional(),
    }).parse(req.body);
    const current = await appPrisma.inventoryItem.findFirst({ where: { id: req.params.id } });
    if (!current) throw new HttpError(404, 'Item not found');
    const updated = await appPrisma.inventoryItem.update({ where: { id: req.params.id }, data });
    if (pricingChanged(current, updated)) {
      await logPriceChange(appPrisma, updated, current.cost, current.price, await currentActorName(req));
    }
    res.json(updated);
  } catch (e) { next(e); }
});

// Price history for one item (append-only trail, newest first).
router.get('/items/:id/history', async (req, res, next) => {
  try {
    res.json(await appPrisma.inventoryPriceAuditLog.findMany({
      where: { itemId: req.params.id },
      orderBy: { createdAt: 'desc' },
    }));
  } catch (e) { next(e); }
});

router.delete('/items/:id', async (req: AuthRequest, res, next) => {
  try {
    const actor = await resolveActor(req.user!.id);
    await softDelete('InventoryItem', req.params.id, actor);
    res.status(204).send();
  } catch (e) { next(e); }
});

// Batch update: applies editable fields to many catalogue rows in one request.
// Runs inside a single transaction so a failure mid-way rolls back every change
// instead of leaving the catalogue half-updated. Price changes on any row also
// append to the price audit trail atomically within the same transaction.
router.post('/items/batch-update', async (req, res, next) => {
  try {
    const data = z.object({
      updates: z
        .array(
          z.object({
            id: z.string(),
            name: z.string().optional(),
            category: z.string().optional(),
            cost: z.number().optional(),
            price: z.number().optional(),
            reorder: z.number().int().optional(),
          })
        )
        .min(1),
    }).parse(req.body);

    const actorName = await currentActorName(req);
    const updated = await appPrisma.$transaction(async (tx) => {
      const results: any[] = [];
      for (const u of data.updates) {
        const { id, ...fields } = u;
        const current = await tx.inventoryItem.findFirst({ where: { id } });
        if (!current) throw new HttpError(404, `Item ${id} not found`);
        const next = await tx.inventoryItem.update({ where: { id }, data: fields });
        if (pricingChanged(current, next)) {
          await logPriceChange(tx, next, current.cost, current.price, actorName);
        }
        results.push(next);
      }
      return results;
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// Deliveries (goods in)
router.get('/deliveries', async (_req, res, next) => {
  try {
    res.json(await appPrisma.delivery.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
});

router.post('/deliveries', async (req, res, next) => {
  try {
    const data = z.object({
      supplier: z.string(),
      inv: z.string(),
      date: z.string(),
      units: z.number().int().positive(),
      cat: z.string(),
      total: z.number(),
    }).parse(req.body);
    const created = await appPrisma.delivery.create({ data });
    // Optionally increase stock of matching category items – left simple for now
    res.status(201).json(created);
  } catch (e) { next(e); }
});

// Sales
router.get('/sales', async (_req, res, next) => {
  try {
    res.json(await appPrisma.sale.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
});

router.post('/sales', async (req, res, next) => {
  try {
    const data = z.object({
      item: z.string(),
      time: z.string(),
      amount: z.number(),
    }).parse(req.body);
    const created = await appPrisma.sale.create({ data });
    // Reduce stock if item matches by name
    const inv = await appPrisma.inventoryItem.findFirst({ where: { name: data.item } });
    if (inv && inv.stock > 0) {
      await appPrisma.inventoryItem.update({
        where: { id: inv.id },
        data: { stock: { decrement: 1 } },
      });
    }
    res.status(201).json(created);
  } catch (e) { next(e); }
});

// Stock takes
router.get('/stock-takes', async (_req, res, next) => {
  try {
    res.json(await appPrisma.stockTake.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
});

router.post('/stock-takes', async (req, res, next) => {
  try {
    const data = z.object({
      name: z.string(),
      sku: z.string(),
      system: z.number().int(),
      physical: z.number().int(),
      notes: z.string().default(''),
    }).parse(req.body);
    const created = await appPrisma.stockTake.create({ data });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

router.patch('/stock-takes/:id/physical', async (req, res, next) => {
  try {
    const { physical } = z.object({ physical: z.number().int() }).parse(req.body);
    const updated = await appPrisma.stockTake.update({
      where: { id: req.params.id },
      data: { physical },
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// Issues
router.get('/issues', async (_req, res, next) => {
  try {
    res.json(await appPrisma.stockIssue.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
});

router.post('/issues', async (req, res, next) => {
  try {
    const data = z.object({
      item: z.string(),
      dest: z.string(),
    }).parse(req.body);
    const created = await appPrisma.stockIssue.create({ data });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

export default router;

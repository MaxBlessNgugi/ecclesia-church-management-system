import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Items
router.get('/items', async (_req, res, next) => {
  try {
    res.json(await prisma.inventoryItem.findMany({ orderBy: { name: 'asc' } }));
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
    const created = await prisma.inventoryItem.create({ data });
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
    const updated = await prisma.inventoryItem.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (e) { next(e); }
});

router.delete('/items/:id', async (req, res, next) => {
  try {
    await prisma.inventoryItem.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (e) { next(e); }
});

// Deliveries (goods in)
router.get('/deliveries', async (_req, res, next) => {
  try {
    res.json(await prisma.delivery.findMany({ orderBy: { createdAt: 'desc' } }));
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
    const created = await prisma.delivery.create({ data });
    // Optionally increase stock of matching category items – left simple for now
    res.status(201).json(created);
  } catch (e) { next(e); }
});

// Sales
router.get('/sales', async (_req, res, next) => {
  try {
    res.json(await prisma.sale.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
});

router.post('/sales', async (req, res, next) => {
  try {
    const data = z.object({
      item: z.string(),
      time: z.string(),
      amount: z.number(),
    }).parse(req.body);
    const created = await prisma.sale.create({ data });
    // Reduce stock if item matches by name
    const inv = await prisma.inventoryItem.findFirst({ where: { name: data.item } });
    if (inv && inv.stock > 0) {
      await prisma.inventoryItem.update({
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
    res.json(await prisma.stockTake.findMany({ orderBy: { createdAt: 'desc' } }));
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
    const created = await prisma.stockTake.create({ data });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

router.patch('/stock-takes/:id/physical', async (req, res, next) => {
  try {
    const { physical } = z.object({ physical: z.number().int() }).parse(req.body);
    const updated = await prisma.stockTake.update({
      where: { id: req.params.id },
      data: { physical },
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// Issues
router.get('/issues', async (_req, res, next) => {
  try {
    res.json(await prisma.stockIssue.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
});

router.post('/issues', async (req, res, next) => {
  try {
    const data = z.object({
      item: z.string(),
      dest: z.string(),
    }).parse(req.body);
    const created = await prisma.stockIssue.create({ data });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

export default router;

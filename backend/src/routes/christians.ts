import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const sacramentSchema = z.object({
  date: z.string().optional(),
  minister: z.string().optional(),
  place: z.string().optional(),
}).optional();

const christianSchema = z.object({
  regNo: z.string().min(1),
  nationalId: z.string().min(1),
  baptismalName: z.string().min(1),
  secondName: z.string().min(1),
  sirName: z.string().min(1),
  phone: z.string().min(1),
  diocese: z.string().min(1),
  parish: z.string().min(1),
  localChurch: z.string().min(1),
  scc: z.string().min(1),
  status: z.enum(['Active', 'Transferred', 'Deceased', 'Inactive']).optional(),
  baptism: sacramentSchema,
  eucharist: sacramentSchema,
  confirmation: sacramentSchema,
  marriage: sacramentSchema,
});

function mapChristian(c: any) {
  return {
    id: c.id,
    regNo: c.regNo,
    nationalId: c.nationalId,
    baptismalName: c.baptismalName,
    secondName: c.secondName,
    sirName: c.sirName,
    phone: c.phone,
    diocese: c.diocese,
    parish: c.parish,
    localChurch: c.localChurch,
    scc: c.scc,
    status: c.status,
    baptism: c.baptism ?? undefined,
    eucharist: c.eucharist ?? undefined,
    confirmation: c.confirmation ?? undefined,
    marriage: c.marriage ?? undefined,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    const q = (req.query.q as string | undefined)?.trim();

    const where: any = {};
    if (status) where.status = status;
    // SQLite: filter in memory for case-insensitive search
    const rows = await prisma.christian.findMany({ where, orderBy: { createdAt: 'desc' } });
    let result = rows;
    if (q) {
      const lower = q.toLowerCase();
      result = rows.filter((c) =>
        [c.regNo, c.baptismalName, c.secondName, c.sirName, c.nationalId, c.scc]
          .some((v) => v.toLowerCase().includes(lower))
      );
    }
    res.json(result.map(mapChristian));
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const c = await prisma.christian.findUnique({ where: { id: req.params.id } });
    if (!c) return res.status(404).json({ error: 'Christian not found' });
    res.json(mapChristian(c));
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const data = christianSchema.parse(req.body);
    const created = await prisma.christian.create({
      data: {
        ...data,
        status: data.status ?? 'Active',
        baptism: data.baptism ?? undefined,
        eucharist: data.eucharist ?? undefined,
        confirmation: data.confirmation ?? undefined,
        marriage: data.marriage ?? undefined,
      },
    });
    res.status(201).json(mapChristian(created));
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const data = christianSchema.partial().parse(req.body);
    const updated = await prisma.christian.update({
      where: { id: req.params.id },
      data: {
        ...data,
        baptism: data.baptism ?? undefined,
        eucharist: data.eucharist ?? undefined,
        confirmation: data.confirmation ?? undefined,
        marriage: data.marriage ?? undefined,
      },
    });
    res.json(mapChristian(updated));
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/sacraments', async (req, res, next) => {
  try {
    const body = z.object({
      baptism: sacramentSchema,
      eucharist: sacramentSchema,
      confirmation: sacramentSchema,
      marriage: sacramentSchema,
    }).parse(req.body);

    const updated = await prisma.christian.update({
      where: { id: req.params.id },
      data: {
        baptism: body.baptism ?? undefined,
        eucharist: body.eucharist ?? undefined,
        confirmation: body.confirmation ?? undefined,
        marriage: body.marriage ?? undefined,
      },
    });
    res.json(mapChristian(updated));
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.christian.update({
      where: { id: req.params.id },
      data: { status: 'Inactive' },
    });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

export default router;

// =============================================================================
// Christian registry routes — /api/christians (all require JWT auth)
// -----------------------------------------------------------------------------
//   GET    /                  list w/ optional ?status= and ?q= (search)
//   GET    /:id               single record
//   POST   /                  create (server assigns the next REG-<year>-###### no.)
//   PUT    /:id               full/partial update
//   PATCH  /:id/sacraments    update sacrament objects (baptism/eucharist/etc.)
//   DELETE /:id               SOFT delete -> audit_logs + Trash & Audit UI
//
// Sacrament fields are stored as JSON TEXT in SQLite (see serializeOptionalJson)
// and re-parsed on the way out (parseOptionalJson) so the API contract is plain
// JS objects, not strings.
// =============================================================================
import { Router } from 'express';
import { z } from 'zod';
import { appPrisma } from '../lib/prisma.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { requireModule } from '../middleware/perms.js';
import { softDelete, resolveActor } from '../lib/audit.js';

const router = Router();
router.use(requireAuth);
router.use(requireModule('christian'));

const sacramentSchema = z.object({
  date: z.string().optional(),
  minister: z.string().optional(),
  place: z.string().optional(),
}).optional();

function parseOptionalJson<T>(value: string | null | undefined): T | undefined {
  if (!value) return undefined;
  try {
    return typeof value === 'string' ? JSON.parse(value) as T : value as T;
  } catch {
    return undefined;
  }
}

function serializeOptionalJson<T>(value: T | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

const christianSchema = z.object({
  regNo: z.string().optional(),
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
    baptism: parseOptionalJson(c.baptism) ?? undefined,
    eucharist: parseOptionalJson(c.eucharist) ?? undefined,
    confirmation: parseOptionalJson(c.confirmation) ?? undefined,
    marriage: parseOptionalJson(c.marriage) ?? undefined,
  };
}

/** Generates the next sequential registration number server-side (guarantees uniqueness). */
async function nextRegNo(): Promise<string> {
  const last = await appPrisma.christian.findFirst({ orderBy: { regNo: 'desc' } });
  const match = last?.regNo?.match(/(\d+)$/);
  const next = match ? parseInt(match[1], 10) + 1 : 1043;
  return `REG-${new Date().getFullYear()}-${String(next).padStart(6, '0')}`;
}

router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    const q = (req.query.q as string | undefined)?.trim();

    const where: any = {};
    if (status) where.status = status;
    // SQLite: filter in memory for case-insensitive search
    const rows = await appPrisma.christian.findMany({ where, orderBy: { createdAt: 'desc' } });
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
    const c = await appPrisma.christian.findUnique({ where: { id: req.params.id } });
    if (!c) return res.status(404).json({ error: 'Christian not found' });
    res.json(mapChristian(c));
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const data = christianSchema.parse(req.body);
    const { regNo: _clientRegNo, ...rest } = data;
    const created = await appPrisma.christian.create({
      data: {
        ...rest,
        regNo: await nextRegNo(),
        status: data.status ?? 'Active',
        baptism: serializeOptionalJson(data.baptism),
        eucharist: serializeOptionalJson(data.eucharist),
        confirmation: serializeOptionalJson(data.confirmation),
        marriage: serializeOptionalJson(data.marriage),
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
    const updated = await appPrisma.christian.update({
      where: { id: req.params.id },
      data: {
        ...data,
        baptism: serializeOptionalJson(data.baptism),
        eucharist: serializeOptionalJson(data.eucharist),
        confirmation: serializeOptionalJson(data.confirmation),
        marriage: serializeOptionalJson(data.marriage),
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

    const updated = await appPrisma.christian.update({
      where: { id: req.params.id },
      data: {
        baptism: serializeOptionalJson(body.baptism),
        eucharist: serializeOptionalJson(body.eucharist),
        confirmation: serializeOptionalJson(body.confirmation),
        marriage: serializeOptionalJson(body.marriage),
      },
    });
    res.json(mapChristian(updated));
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const actor = await resolveActor(req.user!.id);
    await softDelete('Christian', req.params.id, actor);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

export default router;

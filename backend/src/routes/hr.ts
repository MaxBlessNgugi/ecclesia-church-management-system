import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/employees', async (_req, res, next) => {
  try {
    res.json(await prisma.employee.findMany({ orderBy: { code: 'asc' } }));
  } catch (e) { next(e); }
});

router.post('/employees', async (req, res, next) => {
  try {
    const data = z.object({
      nationalId: z.string(),
      surname: z.string(),
      firstName: z.string(),
      middleName: z.string().optional(),
      designation: z.string(),
      hireDate: z.string(),
      email: z.string().email(),
      phone: z.string(),
      nextOfKinName: z.string().optional(),
      nextOfKinRelation: z.string().optional(),
      nextOfKinPhone: z.string().optional(),
    }).parse(req.body);

    const name = [data.firstName, data.middleName, data.surname].filter(Boolean).join(' ');
    const count = await prisma.employee.count();
    const code = `EMP-${String(count + 1).padStart(4, '0')}`;

    const created = await prisma.employee.create({
      data: {
        code,
        name,
        role: data.designation,
        phone: data.phone,
        email: data.email,
        hireDate: data.hireDate,
      },
    });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

router.put('/employees/:id', async (req, res, next) => {
  try {
    const data = z.object({
      name: z.string().optional(),
      role: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      hireDate: z.string().optional(),
    }).parse(req.body);
    const updated = await prisma.employee.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (e) { next(e); }
});

export default router;

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { hashPassword, verifyPassword, signToken } from '../lib/auth.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  title: z.string().max(100).optional(),
  role: z.enum(['admin', 'staff', 'viewer']).default('staff'),
});

const defaultPanels = {
  christian: true,
  activities: true,
  sacraments: true,
  finance: true,
  ledgers: true,
  inventory: true,
  reports: true,
  hr: true,
  administration: true,
};

const defaultActions = { view: true, edit: true, delete: true };

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return typeof value === 'string' ? JSON.parse(value) as T : value as T;
  } catch {
    return fallback;
  }
}

function session(user: any) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    title: user.title ?? null,
    role: user.role,
    permissions: {
      panels: parseJson(user.panels, defaultPanels),
      actions: parseJson(user.actions, defaultActions),
    },
  };
}

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    const token = signToken({ id: user.id, email: user.email, role: user.role });
    res.json({ token, user: session(user) });
  } catch (e) {
    next(e);
  }
});

/**
 * Register is restricted: only a super_admin can create new users.
 * This ensures Max Bless Ngugi (first super_admin) controls who joins.
 */
router.post('/register', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only the super admin can add new users' });
    }
    const data = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await hashPassword(data.password);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        role: data.role,
      },
    });

    const token = signToken({ id: user.id, email: user.email, role: user.role });
    res.status(201).json({ token, user: session(user) });
  } catch (e) {
    next(e);
  }
});

router.get('/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || !user.isActive) return res.status(401).json({ error: 'User not found' });
    res.json(session(user));
  } catch (e) {
    next(e);
  }
});

export default router;

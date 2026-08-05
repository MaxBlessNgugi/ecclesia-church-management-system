// =============================================================================
// Auth routes — /api/auth
// -----------------------------------------------------------------------------
//   POST /login           public  — verify credentials, issue JWT + session
//   POST /register        JWT+super_admin — create a user (email reservation
//                           checks the RAW prisma table so soft-deleted users
//                           keep their email reserved)
//   GET  /me              JWT     — refresh the logged-in session payload
//   PUT  /change-password JWT     — verify current password, re-hash new one
//
// A "session" payload is the user object with JSON `panels`/`actions` strings
// parsed into permission objects (see session() below). These drive the UI's
// per-panel access controls.
// =============================================================================
import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { appPrisma, prisma } from '../lib/prisma.js';
import {
  hashPassword,
  verifyPassword,
  signToken,
  generateResetToken,
  hashResetToken,
  verifyResetToken,
} from '../lib/auth.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const MAX_RESET_ATTEMPTS = 10;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please try again later.' },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests. Please try again later.' },
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reset attempts. Please try again later.' },
});

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

/** Default panel access: everyone can see every panel unless overridden per user. */
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

/** Default CRUD actions granted to every user. */
const defaultActions = { view: true, edit: true, delete: true };

/**
 * Safe JSON parse for the `panels`/`actions` columns. SQLite stores these as
 * TEXT; any malformed legacy value degrades gracefully to the default object
 * instead of crashing the login response.
 */
function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return typeof value === 'string' ? JSON.parse(value) as T : value as T;
  } catch {
    return fallback;
  }
}

/** Builds the client-facing session object (never exposes passwordHash). */
function session(user: any) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    title: user.title ?? null,
    role: user.role,
    mustChangePassword: user.mustChangePassword ?? false,
    permissions: {
      panels: parseJson(user.panels, defaultPanels),
      actions: parseJson(user.actions, defaultActions),
    },
  };
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    // appPrisma filters out soft-deleted users, so a deleted account can't log in.
    const user = await appPrisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      // Uniform "invalid credentials" response — don't leak whether the email exists.
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Per-account lockout window after repeated failures.
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      return res.status(423).json({
        error: 'Account temporarily locked due to too many failed attempts. Try again later.',
      });
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      const attempts = user.loginFailedAttempts + 1;
      const update: any = { loginFailedAttempts: attempts };
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        update.lockedUntil = new Date(Date.now() + LOGIN_LOCK_MS);
        update.loginFailedAttempts = 0;
      }
      await appPrisma.user.update({ where: { id: user.id }, data: update });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const now = new Date();
    // Record login/last-seen and clear any lockout state from prior failures.
    await appPrisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: now,
        lastActiveAt: now,
        loginFailedAttempts: 0,
        lockedUntil: null,
      },
    });

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
    // Check the unfiltered table so soft-deleted users keep their email reserved.
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await hashPassword(data.password);
    const user = await appPrisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        role: data.role,
        mustChangePassword: true,
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
    const user = await appPrisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || !user.isActive) return res.status(401).json({ error: 'User not found' });
    // Touch the last-seen timestamp so admin "Last Active" reflects real usage.
    await appPrisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
    res.json(session(user));
  } catch (e) {
    next(e);
  }
});

router.put('/change-password', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const user = await appPrisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

    const newHash = await hashPassword(newPassword);
    await appPrisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash, mustChangePassword: false },
    });
    res.json({ message: 'Password updated successfully' });
  } catch (e) {
    next(e);
  }
});

/**
 * Forgot-password request: always answers 200 `{ ok: true }` regardless of
 * whether the email exists (no user enumeration). When the account exists and
 * is active, a one-time reset code is issued and its SHA-256 hash stored with a
 * 30-minute expiry — the user collects the code from their parish administrator.
 */
router.post('/forgot-password', forgotPasswordLimiter, async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const user = await appPrisma.user.findUnique({ where: { email } });
    if (user && user.isActive) {
      const hasLiveToken =
        user.resetTokenHash && user.resetTokenExpires && user.resetTokenExpires.getTime() > Date.now();
      if (!hasLiveToken) {
        const token = generateResetToken();
        await appPrisma.user.update({
          where: { id: user.id },
          data: {
            resetTokenHash: hashResetToken(token),
            resetTokenExpires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
            resetFailedAttempts: 0,
          },
        });
      }
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/**
 * Redeems a one-time reset code with a new password. The code hash is looked up
 * directly (no email required); wrong or expired codes increment a per-user
 * failure counter that locks the account after MAX_RESET_ATTEMPTS tries.
 */
router.post('/reset-password', resetPasswordLimiter, async (req, res, next) => {
  try {
    const { token, newPassword } = z
      .object({ token: z.string().min(1).max(64), newPassword: z.string().min(8) })
      .parse(req.body);

    const hash = hashResetToken(token);
    const user = await appPrisma.user.findFirst({ where: { resetTokenHash: hash } });
    if (!user || !user.isActive || !user.resetTokenExpires) {
      return res.status(400).json({ error: 'Invalid or expired reset code' });
    }

    const isExpired = user.resetTokenExpires.getTime() < Date.now();
    const isCodeValid = verifyResetToken(token, user.resetTokenHash!);

    if (isExpired || !isCodeValid) {
      const attempts = user.resetFailedAttempts + 1;
      const update: any = { resetFailedAttempts: attempts };
      if (attempts >= MAX_RESET_ATTEMPTS) {
        update.isActive = false;
        update.resetTokenHash = null;
        update.resetTokenExpires = null;
      }
      await appPrisma.user.update({ where: { id: user.id }, data: update });
      return res.status(400).json({ error: 'Invalid or expired reset code' });
    }

    const passwordHash = await hashPassword(newPassword);
    await appPrisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetTokenHash: null,
        resetTokenExpires: null,
        resetFailedAttempts: 0,
        isActive: true,
      },
    });
    res.json({ message: 'Password reset successfully. You can now sign in.' });
  } catch (e) {
    next(e);
  }
});

export default router;

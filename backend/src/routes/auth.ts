// =============================================================================
// Auth routes — /api/auth
// =============================================================================
//   POST /login           public  — verify credentials, issue JWT + session
//   POST /register        JWT+super_admin — create a user (email reservation
//                           checks the RAW prisma table so soft-deleted users
//                           keep their email reserved)
//   GET  /me              JWT     — refresh the logged-in session payload
//   PUT  /change-password JWT     — verify current password, re-hash new one
//   POST /forgot-password public  — request a password reset code (no user enumeration)
//   POST /reset-password  public  — redeem a one-time reset code with a new password
//
// Security measures:
//   - Rate limiting on login, forgot-password, and reset-password endpoints
//   - Account lockout after repeated failed login attempts (15 minutes)
//   - Account lockout after repeated failed reset attempts (15 minutes)
//   - Password hashing with bcrypt via hashPassword/verifyPassword
//   - JWT tokens for authenticated endpoints
//   - Soft-delete support: inactive users cannot log in
//   - Email uniqueness enforced across active and soft-deleted users
//   - Password validation: min 8 chars, uppercase, lowercase, number, special char
//   - No user enumeration: generic error messages for auth failures
//   - Reset tokens stored as SHA-256 hashes, not plaintext
//   - Reset tokens have 30-minute expiry
//   - Successful login invalidates outstanding reset tokens
//   - mustChangePassword flag for newly created users
//   - Session object never exposes passwordHash
//
// A "session" payload is the user object with JSON `panels`/`actions` strings
// parsed into permission objects (see session() below). These drive the UI's
// per-panel access controls.
// =============================================================================

// Import Router from Express - creates modular route handlers
import { Router } from 'express';

// Import Zod for runtime schema validation - ensures request body shapes
import { z } from 'zod';

// Import rateLimit middleware - prevents brute-force and abuse attacks
import { rateLimit } from 'express-rate-limit';

// Import Prisma client instances: appPrisma filters soft-deleted records,
// prisma is the raw client for checking all users including soft-deleted
import { appPrisma, prisma } from '../lib/prisma.js';

// Import password hashing/verification utilities for secure credential management
import {
  hashPassword,       // Hashes plaintext passwords with bcrypt
  verifyPassword,     // Verifies plaintext against bcrypt hash
  signToken,          // Signs JWT tokens with user payload
  generateResetToken, // Generates cryptographically random reset token
  hashResetToken,     // Hashes reset token with SHA-256 for storage
} from '../lib/auth.js';

// Import auth middleware and typed request interface for protected routes
import { requireAuth, AuthRequest } from '../middleware/auth.js';

// Import AppError for consistent error handling via the centralized error handler
import { AppError } from '../middleware/errorHandler.js';

// Create Express router instance to define auth routes
const router = Router();

// Time-to-live for password reset tokens: 30 minutes in milliseconds
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

// Maximum failed reset password attempts before temporary account lockout
const MAX_RESET_ATTEMPTS = 10;

// Maximum failed login attempts before temporary account lockout
const MAX_LOGIN_ATTEMPTS = 5;

// Duration of account lockout after too many failed attempts: 15 minutes in milliseconds
const LOGIN_LOCK_MS = 15 * 60 * 1000;

// Rate limiter for login endpoint: max 10 requests per 15-minute window per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15-minute sliding window
  max: 10,                    // Max 10 requests per window
  standardHeaders: true,      // Return rate limit info in headers (RateLimit-*)
  legacyHeaders: false,       // Disable X-RateLimit-* headers (deprecated)
  validate: { trustProxy: false },
  message: { error: 'Too many sign-in attempts. Please try again later.' }, // Error response
});

// Rate limiter for forgot-password endpoint: max 5 requests per 15-minute window per IP
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15-minute sliding window
  max: 5,                     // Max 5 requests per window
  standardHeaders: true,      // Return rate limit info in headers
  legacyHeaders: false,       // Disable legacy headers
  validate: { trustProxy: false },
  message: { error: 'Too many password reset requests. Please try again later.' }, // Error response
});

// Rate limiter for reset-password endpoint: max 5 requests per 15-minute window per IP
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15-minute sliding window
  max: 5,                     // Max 5 requests per window
  standardHeaders: true,      // Return rate limit info in headers
  legacyHeaders: false,       // Disable legacy headers
  validate: { trustProxy: false },
  message: { error: 'Too many reset attempts. Please try again later.' }, // Error response
});

// Validation schema for login request body
const loginSchema = z.object({
  email: z.string().email(),      // Must be valid email format
  password: z.string().min(1),    // Must not be empty
});

// Validation schema for user registration request body
const registerSchema = z.object({
  email: z.string().email(),          // Must be valid email format
  password: z.string()
    .min(8, 'Password must be at least 8 characters')                      // Minimum 8 characters
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter') // At least one uppercase
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter') // At least one lowercase
    .regex(/[0-9]/, 'Password must contain at least one number')           // At least one digit
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'), // At least one special char
  name: z.string().min(1),         // Must not be empty
  title: z.string().max(100).optional(), // Optional, max 100 characters
  role: z.enum(['admin', 'staff', 'viewer']).default('staff'), // Role with default
});

/** Default panel access: everyone can see every panel unless overridden per user. */
const defaultPanels = {
  christian: true,        // Christian management panel
  activities: true,       // Activities management panel
  sacraments: true,       // Sacraments management panel
  finance: true,          // Finance management panel
  ledgers: true,          // Ledgers management panel
  inventory: true,        // Inventory management panel
  reports: true,          // Reports panel
  hr: true,               // Human resources panel
  administration: true,   // Administration panel
};

/** Default CRUD actions granted to every user. */
const defaultActions = { view: true, edit: true, delete: true };

/**
 * Safe JSON parse for the `panels`/`actions` columns. PostgreSQL stores these as
 * TEXT; any malformed legacy value degrades gracefully to the default object
 * instead of crashing the login response.
 *
 * @template T - The expected type of the parsed JSON
 * @param {string | null | undefined} value - The raw string value from database
 * @param {T} fallback - Default value to return if parsing fails
 * @returns {T} The parsed JSON value or the fallback
 */
function parseJson<T>(value: string | null | undefined, fallback: T): T {
  // Return fallback if value is null, undefined, or empty string
  if (!value) return fallback;
  try {
    // Parse string to JSON, or return as-is if already an object
    return typeof value === 'string' ? JSON.parse(value) as T : value as T;
  } catch {
    // If JSON parsing fails (malformed data), return safe fallback
    return fallback;
  }
}

/**
 * Builds the client-facing session object (never exposes passwordHash).
 *
 * @param {any} user - Raw user object from database
 * @returns {object} Safe session object with user info and parsed permissions
 */
function session(user: any) {
  return {
    id: user.id,                                          // User ID
    name: user.name,                                      // User's full name
    email: user.email,                                    // User's email address
    title: user.title ?? null,                            // User's title (e.g., Pastor, Admin)
    role: user.role,                                      // User's role (super_admin, admin, staff, viewer)
    mustChangePassword: user.mustChangePassword ?? false, // Whether user must change password on next login
    permissions: {
      panels: parseJson(user.panels, defaultPanels),      // Parse JSON panels string to object
      actions: parseJson(user.actions, defaultActions),    // Parse JSON actions string to object
    },
  };
}

// Validation schema for change-password request body
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1), // Current password must not be empty
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')                      // Minimum 8 characters
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter') // At least one uppercase
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter') // At least one lowercase
    .regex(/[0-9]/, 'Password must contain at least one number')           // At least one digit
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'), // At least one special char
});

/**
 * POST /login - Authenticate user and issue JWT token
 * @param {Request} req - Express request with email and password in body
 * @param {Response} res - Express response with token and user session
 * @param {NextFunction} next - Express next middleware
 * @returns {Promise<void>} JSON response with token and user, or error
 */
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    // Validate and parse request body against login schema
    const { email, password } = loginSchema.parse(req.body);
    // appPrisma filters out soft-deleted users, so a deleted account can't log in.
    // Database query: Find user by email (excludes soft-deleted users)
    const user = await appPrisma.user.findUnique({ where: { email } });
    // Validation: Check if user exists and is active
    if (!user || !user.isActive) {
      // Uniform "invalid credentials" response — don't leak whether the email exists.
      return next(new AppError('Invalid email or password', 401, 'UNAUTHORIZED'));
    }

    // Validation: Check if account is temporarily locked due to failed attempts
    // Per-account lockout window after repeated failures.
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      return next(new AppError('Account temporarily locked due to too many failed attempts. Try again later.', 423, 'UNAUTHORIZED'));
    }

    // Verify password against stored hash
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      // Increment failed attempt counter
      const attempts = user.loginFailedAttempts + 1;
      const update: any = { loginFailedAttempts: attempts };
      // Lock account if max attempts reached
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        update.lockedUntil = new Date(Date.now() + LOGIN_LOCK_MS);
        update.loginFailedAttempts = 0;
      }
      // Database query: Update user with failed attempt count or lockout
      await appPrisma.user.update({ where: { id: user.id }, data: update });
      return next(new AppError('Invalid email or password', 401, 'UNAUTHORIZED'));
    }

    // Success: Update login timestamps and clear lockout state
    const now = new Date();
    // Record login/last-seen, clear lockout state from prior failures, and
    // invalidate any outstanding password-reset code (a successful login means
    // the user already has access — a code must not stay valid after that).
    // Database query: Update user's last active time and clear all lockout/reset state
    await appPrisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: now,              // Record successful login time
        lastActiveAt: now,             // Update last seen timestamp
        loginFailedAttempts: 0,        // Reset failed attempt counter
        lockedUntil: null,             // Clear any lockout
        resetTokenHash: null,          // Invalidate any pending reset token
        resetTokenExpires: null,       // Clear reset token expiry
        resetFailedAttempts: 0,        // Reset failed reset attempts
      },
    });

    // Generate JWT token with user ID, email, and role
    const token = signToken({ id: user.id, email: user.email, role: user.role });
    // Return token and sanitized user session (no passwordHash)
    res.json({ token, user: session(user) });
  } catch (e) {
    // Pass any errors to Express error handler
    next(e);
  }
});

/**
 * POST /register - Create new user (super_admin only)
 * Register is restricted: only a super_admin can create new users.
 * This ensures Max Bless Ngugi (first super_admin) controls who joins.
 * @param {AuthRequest} req - Express request with user data in body
 * @param {Response} res - Express response with token and user session
 * @param {NextFunction} next - Express next middleware
 * @returns {Promise<void>} JSON response with token and user, or error
 */
router.post('/register', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    // Authorization: Only super_admin can create new users
    if (req.user?.role !== 'super_admin') {
      return next(new AppError('Only the super admin can add new users', 403, 'FORBIDDEN'));
    }
    // Validate and parse request body against registration schema
    const data = registerSchema.parse(req.body);
    // Check the unfiltered table so soft-deleted users keep their email reserved.
    // Database query: Find any user with this email (including soft-deleted)
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    // Validation: Check if email is already taken
    if (existing) return next(new AppError('Email already registered', 409, 'CONFLICT'));

    // Hash the plaintext password with bcrypt
    const passwordHash = await hashPassword(data.password);
    // Database query: Create new user in database
    const user = await appPrisma.user.create({
      data: {
        email: data.email,                // User's email
        passwordHash,                      // Hashed password
        name: data.name,                   // User's full name
        role: data.role,                   // User's role (default: staff)
        mustChangePassword: true,          // Force password change on first login
      },
    });

    // Generate JWT token for immediate login after registration
    const token = signToken({ id: user.id, email: user.email, role: user.role });
    // Return 201 Created with token and sanitized user session
    res.status(201).json({ token, user: session(user) });
  } catch (e) {
    // Pass any errors to Express error handler
    next(e);
  }
});

// ---------------------------------------------------------------------------
// First-run bootstrap — creates the initial super admin on a fresh database.
// ---------------------------------------------------------------------------
// A fresh installation starts with an empty schema, so there is no pre-seeded
// admin: the parish creates its administrator in the guided first-run screen
// instead of relying
// on a random password printed to an invisible console. Both endpoints are
// public but only function while the user table is empty.
// ---------------------------------------------------------------------------

// Validation schema for the bootstrap request body (same strength as register)
const bootstrapSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

/**
 * GET /bootstrap-status - whether the first-run admin setup is required.
 * Returns true only while no (non-soft-deleted) user exists.
 */
router.get('/bootstrap-status', async (_req, res, next) => {
  try {
    const count = await appPrisma.user.count();
    res.json({ needsBootstrap: count === 0 });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /bootstrap - create the FIRST super admin (fresh-DB only).
 * Also ensures the default singletons exist (same as prisma/seed.ts), so a
 * template DB needs no runtime seeding. Returns a JWT like /login so the
 * user is signed in immediately after setup.
 */
router.post('/bootstrap', async (req, res, next) => {
  try {
    // Validate and parse the request body
    const data = bootstrapSchema.parse(req.body);

    // Guard: only usable while no user exists yet (race-safe enough for a
    // local app — a second concurrent request will fail the unique email
    // constraint or this check on the now-populated table).
    const count = await appPrisma.user.count();
    if (count > 0) {
      return next(new AppError('Setup already completed. Please sign in.', 409, 'CONFLICT'));
    }

    // Hash the plaintext password with bcrypt
    const passwordHash = await hashPassword(data.password);
    // Create the initial super admin — password chosen by the parish, so no
    // forced change is needed (unlike seeded temporary passwords).
    const user = await appPrisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        title: 'Parish Administrator',
        role: 'super_admin',
        isActive: true,
        mustChangePassword: false,
      },
    });

    // Ensure the default singletons exist (belt-and-braces with the template)
    await appPrisma.panelPermissions.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        panels: JSON.stringify(defaultPanels),
        actions: JSON.stringify(defaultActions),
      },
      update: {},
    });
    await appPrisma.pushPaymentSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });

    // Sign the JWT and return the same shape as /login for immediate entry
    const token = signToken({ id: user.id, email: user.email, role: user.role });
    res.status(201).json({ token, user: session(user) });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /me - Refresh logged-in session payload
 * Returns current user's session data and updates last active timestamp.
 * @param {AuthRequest} req - Express request with authenticated user
 * @param {Response} res - Express response with user session
 * @param {NextFunction} next - Express next middleware
 * @returns {Promise<void>} JSON response with user session, or error
 */
router.get('/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    // Database query: Fetch fresh user data from database
    const user = await appPrisma.user.findUnique({ where: { id: req.user!.id } });
    // Validation: Check if user exists and is active
    if (!user || !user.isActive) return next(new AppError('User not found', 401, 'UNAUTHORIZED'));
    // Touch the last-seen timestamp so admin "Last Active" reflects real usage.
    // Database query: Update user's last active timestamp
    await appPrisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
    // Return sanitized user session (no passwordHash)
    res.json(session(user));
  } catch (e) {
    // Pass any errors to Express error handler
    next(e);
  }
});

/**
 * PUT /change-password - Change user's password
 * Verifies current password, then updates to new password hash.
 * @param {AuthRequest} req - Express request with current and new passwords
 * @param {Response} res - Express response with success message
 * @param {NextFunction} next - Express next middleware
 * @returns {Promise<void>} JSON response with success message, or error
 */
router.put('/change-password', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    // Validate and parse request body against change-password schema
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    // Database query: Fetch user from database to verify current password
    const user = await appPrisma.user.findUnique({ where: { id: req.user!.id } });
    // Validation: Check if user exists
    if (!user) return next(new AppError('User not found', 404, 'NOT_FOUND'));

    // Verify current password against stored hash
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    // Validation: Check if current password is correct
    if (!ok) return next(new AppError('Current password is incorrect', 401, 'UNAUTHORIZED'));

    // Hash the new password with bcrypt
    const newHash = await hashPassword(newPassword);
    // Database query: Update user's password hash and clear mustChangePassword flag
    await appPrisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash, mustChangePassword: false },
    });
    // Return success message
    res.json({ message: 'Password updated successfully' });
  } catch (e) {
    // Pass any errors to Express error handler
    next(e);
  }
});

/**
 * POST /forgot-password - Request password reset code
 * Forgot-password request: always answers 200 `{ ok: true }` regardless of
 * whether the email exists (no user enumeration). When the account exists and
 * is active, a one-time reset code is issued and its SHA-256 hash stored with a
 * 30-minute expiry — the user collects the code from their parish administrator.
 * @param {Request} req - Express request with email in body
 * @param {Response} res - Express response with ok status
 * @param {NextFunction} next - Express next middleware
 * @returns {Promise<void>} JSON response with { ok: true }, or error
 */
router.post('/forgot-password', forgotPasswordLimiter, async (req, res, next) => {
  try {
    // Validate and parse email from request body
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    // Database query: Find user by email (excludes soft-deleted users)
    const user = await appPrisma.user.findUnique({ where: { email } });
    // Only issue reset token if user exists and is active
    if (user && user.isActive) {
      // Check if user already has a live (non-expired) reset token
      const hasLiveToken =
        user.resetTokenHash && user.resetTokenExpires && user.resetTokenExpires.getTime() > Date.now();
      // Only generate new token if no live token exists
      if (!hasLiveToken) {
        // Generate cryptographically random reset token
        const token = generateResetToken();
        // Database query: Store hashed reset token with expiry
        await appPrisma.user.update({
          where: { id: user.id },
          data: {
            resetTokenHash: hashResetToken(token),                          // SHA-256 hash of token
            resetTokenExpires: new Date(Date.now() + RESET_TOKEN_TTL_MS),   // 30-minute expiry
            resetFailedAttempts: 0,                                          // Reset failure counter
          },
        });
      }
    }
    // Always return success to prevent user enumeration
    res.json({ ok: true });
  } catch (e) {
    // Pass any errors to Express error handler
    next(e);
  }
});

/**
 * POST /reset-password - Redeem reset code with new password
 * Redeems a one-time reset code with a new password. The code hash is looked up
 * directly (no email required). Replaying an EXPIRED code counts toward a
 * per-user failure counter; after MAX_RESET_ATTEMPTS the account is temporarily
 * locked (never silently deactivated — the resetPasswordLimiter already rate
 * limits guessing from a single IP, and a wrong token simply can't be matched
 * to an account to count against).
 * @param {Request} req - Express request with token and newPassword in body
 * @param {Response} res - Express response with success message
 * @param {NextFunction} next - Express next middleware
 * @returns {Promise<void>} JSON response with success message, or error
 */
router.post('/reset-password', resetPasswordLimiter, async (req, res, next) => {
  try {
    // Validate and parse request body with token and new password
    const { token, newPassword } = z
      .object({ token: z.string().min(1).max(64), newPassword: z.string()
        .min(8, 'Password must be at least 8 characters')                      // Minimum 8 characters
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter') // At least one uppercase
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter') // At least one lowercase
        .regex(/[0-9]/, 'Password must contain at least one number')           // At least one digit
        .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character') // At least one special char
      })
      .parse(req.body);

    // Hash the provided reset token to compare against stored hash
    const hash = hashResetToken(token);
    // Database query: Find user by reset token hash (excludes soft-deleted users)
    const user = await appPrisma.user.findFirst({ where: { resetTokenHash: hash } });
    // Validation: Check if user exists and is active
    if (!user || !user.isActive) {
      return next(new AppError('Invalid or expired reset code', 400, 'BAD_REQUEST'));
    }

    // Validation: Check if reset token has expired
    const isExpired = !user.resetTokenExpires || user.resetTokenExpires.getTime() < Date.now();
    if (isExpired) {
      // Increment failed reset attempt counter
      const attempts = (user.resetFailedAttempts ?? 0) + 1;
      const update: any = { resetFailedAttempts: attempts };
      // Lock account if max attempts reached
      if (attempts >= MAX_RESET_ATTEMPTS) {
        // Temporary lockout, consistent with the login lock; the account stays
        // active and an admin reset (or time passing) recovers it.
        update.lockedUntil = new Date(Date.now() + LOGIN_LOCK_MS);
        update.resetTokenHash = null;
        update.resetTokenExpires = null;
        update.resetFailedAttempts = 0;
      }
      // Database query: Update user with failed attempt count or lockout
      await appPrisma.user.update({ where: { id: user.id }, data: update });
      return next(new AppError('Invalid or expired reset code', 400, 'BAD_REQUEST'));
    }

    // Success: Hash new password and update user
    const passwordHash = await hashPassword(newPassword);
    // Database query: Update user's password and clear all reset/lockout state
    await appPrisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,              // New hashed password
        resetTokenHash: null,      // Invalidate reset token
        resetTokenExpires: null,   // Clear reset token expiry
        resetFailedAttempts: 0,    // Reset failure counter
        lockedUntil: null,         // Clear any lockout
        isActive: true,            // Ensure user is active
      },
    });
    // Return success message
    res.json({ message: 'Password reset successfully. You can now sign in.' });
  } catch (e) {
    // Pass any errors to Express error handler
    next(e);
  }
});

// Export router to be mounted in main app
export default router;
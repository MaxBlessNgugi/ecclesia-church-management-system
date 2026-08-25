// =============================================================================
// Ecclesia Backend — Express Authentication & Authorization Guards
// =============================================================================
//
// PURPOSE
//   Middleware functions that enforce authentication (valid JWT + live account)
//   and role-based authorization on protected Express routes. These guards are
//   the gatekeepers of every protected endpoint in the application.
//
// MIDDLEWARE STACK
//   requireAuth        — Validates JWT token, re-checks account status against DB.
//   requireAdmin       — requireAuth + role in ['admin', 'super_admin'].
//   requireSuperAdmin  — requireAuth + role === 'super_admin' only.
//
// GUARANTEES
//   - A valid, non-expired JWT is required for all protected routes.
//   - The account must exist in the database and be active (not soft-deleted).
//   - Role checks are evaluated against the LIVE database value, not the JWT claim,
//     so demotions/promotions take effect immediately without re-login.
//   - Guards short-circuit with 401 (missing/invalid token or revoked account)
//     or 403 (valid token, insufficient role) before reaching route handlers.
//
// MOUNTING ORDER
//   Guards MUST be applied AFTER body parsing middleware and BEFORE route handlers:
//     app.use(express.json());
//     app.use('/api/admin', requireAuth, requireAdmin, adminRouter);
//
// SECURITY NOTES
//   - The Authorization header must be in the format 'Bearer <jwt>'.
//   - Tokens that survive JWT expiry are caught by verifyToken() and return 401.
//   - Tokens whose accounts have been deleted are caught by the DB lookup.
//   - The req.user object is always fresh from the DB, never stale from JWT claims.
// =============================================================================
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/auth.js';
import { appPrisma } from '../lib/prisma.js';
import { AppError } from './errorHandler.js';

/**
 * Extended Express Request interface augmented with the decoded JWT payload.
 *
 * After requireAuth runs successfully, req.user is guaranteed to contain
 * the user's id, email, and role — all sourced from the live database, not
 * the JWT claims. This ensures privilege changes take effect immediately.
 */
export interface AuthRequest extends Request {
  /**
   * The authenticated user's decoded JWT payload, refreshed from the database.
   * - id:    The unique user identifier (UUID) — used for DB queries and audit logs.
   * - email: The user's email — used for display and identification.
   * - role:  The user's current role — used by requireAdmin/requireSuperAdmin.
   */
  user?: { id: string; email: string; role: string };
}

/**
 * Express middleware that enforces JWT authentication and live account validation.
 *
 * This middleware performs two critical checks on every request:
 *   1. JWT validation: Verifies the token's signature and expiration via verifyToken().
 *   2. Account existence: Queries the database to confirm the user still exists
 *      and has an active (non-deleted) account.
 *
 * On success, attaches a fresh user object to req.user with data from the database
 * (not the JWT claims), ensuring privilege changes are honored immediately.
 *
 * @param req  - The incoming Express request (expected to have an Authorization header).
 * @param res  - The Express response object (used to send 401 on auth failure).
 * @param next - The next middleware function in the chain.
 *
 * @returns A 401 JSON response on authentication failure, or calls next() on success.
 *
 * @example
 * // Mount on a router:
 * router.use(requireAuth);
 * router.get('/profile', (req: AuthRequest, res) => {
 *   res.json({ user: req.user }); // req.user is guaranteed to exist
 * });
 */
export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  // Extract the Authorization header from the request.
  // The header is expected to be in the format 'Bearer <jwt-token>'.
  const header = req.headers.authorization;

  // Validate that the header exists and starts with 'Bearer ' (7 characters).
  // If not present or malformed, the request is immediately rejected with 401.
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
  }

  let payload: { id: string; email: string; role: string };
  try {
    // Strip the 'Bearer ' prefix (first 7 characters) to extract the raw JWT.
    // verifyToken() validates the signature against the JWT secret and checks
    // expiration. Throws JsonWebTokenError or TokenExpiredError on failure.
    payload = verifyToken(header.slice(7));
  } catch {
    // Token is invalid, expired, or malformed — return 401 with a generic message
    // to avoid leaking whether the token was expired vs. invalidly signed.
    return next(new AppError('Invalid or expired token', 401, 'UNAUTHORIZED'));
  }

  try {
    // Re-validate the account against the live database on EVERY request.
    // This ensures that:
    //   - Deleted users cannot use old tokens (revoked access).
    //   - Deactivated accounts are rejected immediately.
    //   - appPrisma's middleware filters soft-deleted rows, so a deleted user
    //     is treated as non-existent.
    const user = await appPrisma.user.findUnique({
      where: { id: payload.id },
      // Only select the fields we need — avoids leaking password hashes or
      // other sensitive columns into the request context.
      select: { id: true, email: true, role: true, isActive: true },
    });

    // Check that the user exists AND is active. A missing user means the
    // account was deleted; an inactive user has been deactivated. Both are
    // treated as authentication failures, not authorization failures.
    if (!user || !user.isActive) {
      return next(new AppError('Account is inactive or has been removed', 401, 'UNAUTHORIZED'));
    }

    // Use the LIVE role from the database, not the role from the JWT claim.
    // This means if an admin demotes a user, the demotion takes effect on the
    // user's next request — no re-login required.
    req.user = { id: user.id, email: user.email, role: user.role };

    // Authentication succeeded — pass control to the next middleware/route handler.
    next();
  } catch (e) {
    // Database errors during user lookup are passed to the centralized error handler
    // rather than returning a 401, since this is a server-side failure.
    next(e);
  }
}

/**
 * Express middleware that restricts access to super_admin users only.
 *
 * Must be mounted AFTER requireAuth, which populates req.user. This middleware
 * performs an additional role check — only users with role 'super_admin' are
 * permitted to proceed. Used for the most sensitive operations: managing other
//  admin users, modifying system-wide settings, and full database operations.
 *
 * @param req  - The authenticated Express request (must have req.user set by requireAuth).
 * @param res  - The Express response object (used to send 401/403 on failure).
 * @param next - The next middleware function in the chain.
 *
 * @returns A 401 if req.user is missing, 403 if role is not 'super_admin', or calls next().
 *
 * @example
 * // Mount on sensitive routes:
 * router.use(requireAuth);
 * router.use(requireSuperAdmin);
 * router.delete('/users/:id', deleteUserHandler);
 */
export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  // Defensive check: if req.user is missing, requireAuth was not mounted before
  // this middleware. Return 401 to indicate the user is not authenticated.
  if (!req.user) return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));

  // Check that the user's role is exactly 'super_admin'. Unlike requireAdmin,
  // this does NOT accept 'admin' — only the highest privilege level passes.
  if (req.user.role !== 'super_admin') {
    return next(new AppError('Super admin access required', 403, 'FORBIDDEN'));
  }

  // Authorization succeeded — pass control to the next middleware/route handler.
  next();
}

/**
 * Express middleware that restricts access to admin and super_admin users.
 *
 * Must be mounted AFTER requireAuth, which populates req.user. This middleware
 * checks that the user's role is either 'admin' or 'super_admin'. Used for
 * administrative operations that don't require the highest privilege level.
 *
 * @param req  - The authenticated Express request (must have req.user set by requireAuth).
 * @param res  - The Express response object (used to send 401/403 on failure).
 * @param next - The next middleware function in the chain.
 *
 * @returns A 401 if req.user is missing, 403 if role is not admin/super_admin, or calls next().
 *
 * @example
 * // Mount on admin routes:
 * router.use(requireAuth);
 * router.use(requireAdmin);
 * router.get('/reports', getReportsHandler);
 */
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  // Defensive check: if req.user is missing, requireAuth was not mounted before
  // this middleware. Return 401 to indicate the user is not authenticated.
  if (!req.user) return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));

  // Check that the user's role is either 'super_admin' or 'admin'.
  // Uses Array.includes() for clean membership testing — accepts both admin levels.
  if (!['super_admin', 'admin'].includes(req.user.role)) {
    return next(new AppError('Admin access required', 403, 'FORBIDDEN'));
  }

  // Authorization succeeded — pass control to the next middleware/route handler.
  next();
}

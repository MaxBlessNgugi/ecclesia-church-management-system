// =============================================================================
// Express authentication / authorization guards
// -----------------------------------------------------------------------------
// requireAuth      — verifies the `Authorization: Bearer <jwt>` header and
//                    attaches { id, email, role } to req.user.
// requireAdmin     — requireAuth + role in ['admin', 'super_admin'].
// requireSuperAdmin— requireAuth + role === 'super_admin' only.
//
// Guards short-circuit with 401 (missing/invalid token) or 403 (valid token,
// insufficient role). They must be applied AFTER body parsing and BEFORE the
// route handlers that need a user.
// =============================================================================
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/auth.js';

/** Express Request augmented with the decoded JWT payload once requireAuth runs. */
export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    // Strip the "Bearer " prefix (7 chars) and verify signature + expiry.
    const token = header.slice(7);
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Super admin only – can manage users and full system settings */
export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
}

/** Admin or super_admin */
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (!['super_admin', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

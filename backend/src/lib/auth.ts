// =============================================================================
// Password hashing + JWT helpers
// -----------------------------------------------------------------------------
// Small wrapper around bcryptjs / jsonwebtoken so security primitives live in
// one place. Everything here is imported by the auth route and the auth guard
// middleware — do not hand-roll bcrypt/jwt calls elsewhere.
// =============================================================================
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { resolveJwtSecret } from './config.js';

// Expiry is controlled by JWT_EXPIRES_IN (default 7d). The signing secret is
// resolved via config.ts, which fails hard in production when a real
// JWT_SECRET is not configured and auto-generates one for local development.
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * bcrypt with cost factor 12 — deliberately slow to resist brute-force and
 * rainbow-table attacks. Never store plaintext passwords anywhere.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Constant-time comparison of a submitted password against a stored hash.
 * Timing-safe against side-channel attacks; returns false for unknown users too.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Issue an HS256 JWT carrying only the claims the app needs: user id (for the
 * actor in audit logs), email and role (for requireAuth/requireAdmin guards).
 */
export function signToken(payload: { id: string; email: string; role: string }): string {
  return jwt.sign(payload, resolveJwtSecret(), { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

/**
 * Verify + decode a JWT. Throws on invalid signature / expiry — callers in the
 * middleware translate that into a 401.
 */
export function verifyToken(token: string): { id: string; email: string; role: string } {
  return jwt.verify(token, resolveJwtSecret()) as { id: string; email: string; role: string };
}

const RESET_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/**
 * Generates a human-readable, one-time password-reset code (8 chars, base62
 * minus ambiguous characters). Only the SHA-256 hash is ever persisted.
 */
export function generateResetToken(): string {
  const bytes = crypto.randomBytes(8);
  let token = '';
  for (let i = 0; i < bytes.length; i++) {
    token += RESET_ALPHABET[bytes[i] % RESET_ALPHABET.length];
  }
  return token;
}

export function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison of a raw token against a stored SHA-256 hash. */
export function verifyResetToken(token: string, hash: string): boolean {
  const a = Buffer.from(crypto.createHash('sha256').update(token).digest('hex'));
  const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

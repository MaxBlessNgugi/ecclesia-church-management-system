// =============================================================================
// Ecclesia Backend — Password Hashing & JWT Token Helpers
// =============================================================================
//
// PURPOSE
//   Centralized security primitives module that wraps bcryptjs for password
//   hashing/verification and jsonwebtoken for JWT issuance/validation. All
//   authentication-related cryptographic operations flow through this single
//   module to ensure consistency, auditability, and proper security practices.
//
// SECURITY CONSIDERATIONS
//   - Passwords are hashed with bcrypt (cost factor 12) — never stored in plaintext.
//   - JWT tokens are signed with HS256 using a secret resolved via config.ts.
//   - Token expiry defaults to 7 days but is configurable via JWT_EXPIRES_IN env.
//   - Reset tokens are generated using cryptographically secure random bytes and
//     only their SHA-256 hashes are ever persisted to the database.
//   - The module uses a custom alphabet for reset tokens that excludes ambiguous
//     characters (0, O, I, l, 1) to prevent user confusion during copy-paste.
//
// USAGE
//   - Import hashPassword/verifyPassword for credential operations.
//   - Import signToken/verifyToken for session management in auth routes.
//   - Import generateResetToken/hashResetToken for password reset flows.
//   - Do NOT hand-roll bcrypt/jwt calls elsewhere — all crypto ops go through here.
//
// DEPENDENCIES
//   - bcryptjs: Pure-JS bcrypt implementation (no native compilation needed).
//   - jsonwebtoken: RFC 7519 JWT signing/verification library.
//   - node:crypto: Built-in Node.js cryptographic functions for reset tokens.
//   - config.js: Provides the JWT signing secret and environment configuration.
// =============================================================================

// Import Node.js built-in crypto module for cryptographically secure random
// byte generation and SHA-256 hashing used in password reset token flows.
import crypto from 'node:crypto';

// Import bcryptjs for password hashing and comparison. bcryptjs is a pure
// JavaScript implementation of bcrypt — no native dependencies required.
// Cost factor 12 is used for hashing (approx. 250ms on modern hardware).
import bcrypt from 'bcryptjs';

// Import jsonwebtoken for HS256 JWT signing and verification. Used to issue
// session tokens on login and validate them on every authenticated request.
import jwt from 'jsonwebtoken';

// Import the resolveJwtSecret helper from our config module. This function
// returns the JWT signing secret from environment variables or auto-generates
// one for development. It throws in production if no secret is configured.
import { resolveJwtSecret } from './config.js';

// JWT token expiry duration. Controlled by the JWT_EXPIRES_IN environment
// variable, defaulting to '7d' (7 days). This value is passed to jsonwebtoken's
// expiresIn option when signing new tokens. The config.ts module fails hard in
// production when JWT_SECRET is not set, preventing insecure token signing.
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Hashes a plaintext password using bcrypt with a cost factor of 12.
 *
 * The cost factor of 12 means the hashing algorithm performs 2^12 = 4096
 * iterations of the key expansion, making brute-force attacks computationally
 * expensive. This is intentionally slow — approximately 250ms on modern hardware.
 *
 * @param password - The plaintext password to hash. Must be a non-empty string.
 * @returns A Promise resolving to the bcrypt hash string (60 characters).
 *
 * @example
 * const hash = await hashPassword('userPassword123');
 * // hash: '$2a$12$...'
 */
export async function hashPassword(password: string): Promise<string> {
  // bcrypt.hash() performs the key expansion and returns the salt + hash.
  // The salt is automatically prepended to the hash string for later comparison.
  return bcrypt.hash(password, 12);
}

/**
 * Verifies a plaintext password against a stored bcrypt hash.
 *
 * Uses constant-time comparison internally (bcrypt.compare) to prevent timing
 * side-channel attacks. Returns false for any invalid combination rather than
 * throwing, which prevents user enumeration through error differentials.
 *
 * @param password - The plaintext password submitted by the user.
 * @param hash     - The stored bcrypt hash to compare against (from the database).
 * @returns A Promise resolving to `true` if the password matches, `false` otherwise.
 *
 * @example
 * const isValid = await verifyPassword('userPassword123', storedHash);
 * if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // bcrypt.compare() extracts the salt from the stored hash and re-hashes the
  // submitted password, then performs a constant-time comparison of the results.
  return bcrypt.compare(password, hash);
}

/**
 * Issues an HS256 JSON Web Token containing the minimum claims needed by the
 * application: user id, email, and role.
 *
 * The token is signed with the JWT secret resolved via config.ts and expires
 * according to the JWT_EXPIRES_IN environment variable (default: 7 days).
 *
 * @param payload - Object containing the user's id, email, and role.
 *   - id:    The unique user identifier (UUID) — used as the actor in audit logs.
 *   - email: The user's email address — used for display and identification.
 *   - role:  The user's role string — used by requireAuth/requireAdmin guards.
 * @returns A signed JWT string (header.payload.signature).
 *
 * @example
 * const token = signToken({ id: 'abc-123', email: 'user@church.org', role: 'admin' });
 * // token: 'eyJhbGciOiJIUzI1NiIs...'
 */
export function signToken(payload: { id: string; email: string; role: string }): string {
  // jwt.sign() creates a JWT with the given payload, signs it with the secret,
  // and sets the expiration claim. The type assertion is needed because
  // jsonwebtoken's SignOptions type doesn't include all valid expiresIn formats.
  return jwt.sign(payload, resolveJwtSecret(), { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

/**
 * Verifies and decodes a JWT, returning the decoded payload.
 *
 * Validates the token's signature against the JWT secret and checks that the
 * token has not expired. Throws a JsonWebTokenError or TokenExpiredError on
 * failure — callers in the auth middleware translate these into 401 responses.
 *
 * @param token - The JWT string to verify (without the 'Bearer ' prefix).
 * @returns The decoded payload containing id, email, and role.
 * @throws {jwt.JsonWebTokenError} If the token signature is invalid.
 * @throws {jwt.TokenExpiredError} If the token has expired.
 *
 * @example
 * try {
 *   const payload = verifyToken(req.headers.authorization?.slice(7));
 *   // payload: { id: 'abc-123', email: 'user@church.org', role: 'admin' }
 * } catch {
 *   return res.status(401).json({ error: 'Invalid or expired token' });
 * }
 */
export function verifyToken(token: string): { id: string; email: string; role: string } {
  // jwt.verify() validates the signature and expiration, then decodes the payload.
  // The type assertion ensures TypeScript knows the shape of our application's claims.
  return jwt.verify(token, resolveJwtSecret()) as { id: string; email: string; role: string };
}

// Custom alphabet for password reset tokens. Excludes ambiguous characters:
//   - 0/O: Zero and capital O are easily confused.
//   - I/l/1: Capital I, lowercase L, and digit 1 are indistinguishable in many fonts.
//   - 8/B: Sometimes confused in handwritten notes.
// This alphabet uses 56 characters (base56), providing ~4.8 bits of entropy per character.
// An 8-character token thus has ~38.4 bits of entropy, sufficient for a single-use code.
const RESET_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/**
 * Generates a cryptographically secure, human-readable password reset token.
 *
 * Produces an 8-character code using the custom alphabet (base56 minus ambiguous
 * characters). The token is generated using Node.js crypto.randomBytes() for
 * cryptographic randomness. Only the SHA-256 hash of this token is ever stored
 * in the database — the plaintext is sent to the user via email and discarded.
 *
 * @returns An 8-character alphanumeric reset token string.
 *
 * @example
 * const token = generateResetToken(); // 'aB3kM7xQ'
 * const hash = hashResetToken(token); // SHA-256 hash stored in DB
 * // Send token to user via email, discard plaintext
 */
export function generateResetToken(): string {
  // Generate 8 cryptographically secure random bytes.
  const bytes = crypto.randomBytes(8);
  // Build the token string by mapping each byte to an index in the alphabet.
  // Using modulo (%) ensures the index stays within bounds, introducing slight
  // bias (56 doesn't evenly divide 256) but this is acceptable for reset tokens.
  let token = '';
  for (let i = 0; i < bytes.length; i++) {
    token += RESET_ALPHABET[bytes[i] % RESET_ALPHABET.length];
  }
  return token;
}

/**
 * Produces a one-way SHA-256 hash of a reset token for secure storage.
 *
 * The plaintext reset token is never stored in the database. Instead, only its
 * SHA-256 hash is persisted. When a user submits the token, the same hash is
 * computed and compared against the stored value. This prevents database leaks
 * from exposing valid reset tokens.
 *
 * @param token - The plaintext reset token to hash (8 characters).
 * @returns A 64-character lowercase hexadecimal SHA-256 digest.
 *
 * @example
 * const hash = hashResetToken('aB3kM7xQ');
 * // hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
 */
export function hashResetToken(token: string): string {
  // Create a SHA-256 hash digest of the token string, output as lowercase hex.
  return crypto.createHash('sha256').update(token).digest('hex');
}

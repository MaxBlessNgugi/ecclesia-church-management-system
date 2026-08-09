// =============================================================================
// Runtime configuration & secret management
// -----------------------------------------------------------------------------
// resolveJwtSecret() is the single source of truth for the JWT signing secret:
//   - Production  — a strong JWT_SECRET env var is REQUIRED; the app refuses to
//                   start with the documented dev defaults or an empty value.
//   - Development — if JWT_SECRET is missing or still the dev default, a random
//                   secret is generated and persisted into backend/.env so the
//                   running server (and every restart) uses a real secret.
//
// This module ensures that:
//   1. Production deployments never run with weak/default secrets
//   2. Development environments get a stable random secret across restarts
//   3. The secret is cached after first resolution for zero-overhead access
// =============================================================================
// Node.js built-in: crypto module for generating cryptographically secure random secrets
import crypto from 'node:crypto';
// Node.js built-in: fs module for reading and writing the .env file
import fs from 'node:fs';
// Node.js built-in: path module for resolving the .env file location
import path from 'node:path';

/**
 * Set of known development/default secret values that must never be used in production.
 * If the JWT_SECRET env var matches one of these, it's treated as "not configured".
 * This prevents accidental deployment with the documented placeholder values.
 */
const DEV_SECRETS = new Set([
  'ecclesia-local-dev-secret-change-in-production', // Default from .env.example
  'dev-secret-change-me',                            // Common tutorial placeholder
]);

/**
 * Cached JWT secret value. Populated on first call to resolveJwtSecret().
 * Subsequent calls return this value instantly without re-reading env vars.
 */
let cached: string | null = null;

/**
 * Generates a cryptographically secure random JWT secret.
 * Uses 48 bytes (384 bits) of randomness, encoded as hex for readability.
 *
 * @returns A 96-character hex string suitable for HMAC-SHA256 signing.
 */
function generate(): string {
  // 48 bytes = 384 bits of entropy, more than sufficient for JWT signing
  return crypto.randomBytes(48).toString('hex');
}

/**
 * Persists a generated secret to the .env file so it survives server restarts.
 * If JWT_SECRET already exists in .env, it's replaced; otherwise it's appended.
 * This is only used in development — production secrets come from env vars directly.
 *
 * @param secret - The generated secret to persist.
 * @returns The secret (always returns the input, even on write failure).
 */
function persistToEnv(secret: string): string {
  // Resolve the path to the .env file in the project root
  const envPath = path.resolve(process.cwd(), '.env');
  // Regex to match existing JWT_SECRET lines in the .env file
  const marker = /^JWT_SECRET\s*=.*$/m;

  try {
    // Read existing .env content, or start with empty string if file doesn't exist
    const content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

    // Replace existing JWT_SECRET line or append a new one
    const next = marker.test(content)
      ? content.replace(marker, `JWT_SECRET="${secret}"`)
      : `${content.trimEnd()}\nJWT_SECRET="${secret}"\n`;

    // Write the updated .env file
    fs.writeFileSync(envPath, next);
    console.log(`\n  [config] Generated a random JWT_SECRET and saved it to ${envPath}\n`);
    return secret;
  } catch (err) {
    // Warn but don't crash — the secret still works for this session,
    // but will be regenerated on restart
    console.warn('\n  [config] Could not persist JWT_SECRET to .env — sessions will be invalidated on restart:', err);
    return secret;
  }
}

/**
 * Returns the JWT signing secret, with environment-specific behavior:
 *
 * **Production (NODE_ENV=production):**
 *   - Requires a strong, non-default JWT_SECRET env var
 *   - Throws an error if the secret is missing or is a dev placeholder
 *   - Never generates or persists secrets automatically
 *
 * **Development:**
 *   - Uses JWT_SECRET if set and not a dev placeholder
 *   - Otherwise generates a random 384-bit secret and persists it to .env
 *   - The persisted secret survives restarts for session stability
 *
 * The result is cached after first resolution for zero-overhead access.
 *
 * @returns The JWT signing secret string.
 * @throws Error in production if JWT_SECRET is not properly configured.
 */
export function resolveJwtSecret(): string {
  // Return cached value if already resolved (fast path)
  if (cached) return cached;

  // Read the JWT_SECRET from environment variables
  const envSecret = process.env.JWT_SECRET;
  // Check if we're in production mode
  const isProduction = process.env.NODE_ENV === 'production';

  // If a real (non-dev-default) secret is provided, use it
  if (envSecret && !DEV_SECRETS.has(envSecret)) {
    cached = envSecret;
    return envSecret;
  }

  // In production, fail hard with a clear error message and remediation steps
  if (isProduction) {
    throw new Error(
      'JWT_SECRET must be set to a strong random value in production. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
    );
  }

  // In development, generate a new secret and persist it for future restarts
  cached = persistToEnv(generate());
  // Also set it in process.env so other modules can read it without re-resolving
  process.env.JWT_SECRET = cached;
  return cached;
}

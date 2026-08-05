// =============================================================================
// Runtime configuration & secret management
// -----------------------------------------------------------------------------
// resolveJwtSecret() is the single source of truth for the JWT signing secret:
//   - Production  — a strong JWT_SECRET env var is REQUIRED; the app refuses to
//                   start with the documented dev defaults or an empty value.
//   - Development — if JWT_SECRET is missing or still the dev default, a random
//                   secret is generated and persisted into backend/.env so the
//                   running server (and every restart) uses a real secret.
// =============================================================================
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DEV_SECRETS = new Set([
  'ecclesia-local-dev-secret-change-in-production',
  'dev-secret-change-me',
]);

let cached: string | null = null;

function generate(): string {
  return crypto.randomBytes(48).toString('hex');
}

function persistToEnv(secret: string): string {
  const envPath = path.resolve(process.cwd(), '.env');
  const marker = /^JWT_SECRET\s*=.*$/m;
  try {
    const content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    const next = marker.test(content)
      ? content.replace(marker, `JWT_SECRET="${secret}"`)
      : `${content.trimEnd()}\nJWT_SECRET="${secret}"\n`;
    fs.writeFileSync(envPath, next);
    console.log(`\n  [config] Generated a random JWT_SECRET and saved it to ${envPath}\n`);
    return secret;
  } catch (err) {
    console.warn('\n  [config] Could not persist JWT_SECRET to .env — sessions will be invalidated on restart:', err);
    return secret;
  }
}

/**
 * Returns the JWT signing secret, generating + persisting one in development
 * and failing hard in production when a real secret is not configured.
 */
export function resolveJwtSecret(): string {
  if (cached) return cached;

  const envSecret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (envSecret && !DEV_SECRETS.has(envSecret)) {
    cached = envSecret;
    return envSecret;
  }

  if (isProduction) {
    throw new Error(
      'JWT_SECRET must be set to a strong random value in production. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
    );
  }

  cached = persistToEnv(generate());
  process.env.JWT_SECRET = cached;
  return cached;
}

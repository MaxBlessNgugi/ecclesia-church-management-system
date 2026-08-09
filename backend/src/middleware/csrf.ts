/**
 * @module csrf
 * @description Double-submit cookie CSRF protection middleware for the Ecclesia backend.
 *
 * This module implements a stateless CSRF defense strategy that does not require
 * server-side sessions. A random token is generated, set as a cookie, and the
 * client must echo it back in the X-CSRF-Token header on state-changing requests.
 * The server then compares the two values; a match proves the caller controlled
 * both the cookie (same-origin context) and the header (browser cannot set
 * custom headers cross-origin without CORS preflight approval).
 *
 * The middleware also provides a same-origin fallback: if the Origin or Referer
 * header is present and matches one of the configured allowed origins the
 * request is considered safe even without a matching token.
 *
 * Security considerations:
 * - The cookie is set with SameSite=Strict to prevent CSRF via top-level
 *   cross-site navigations.
 * - The token itself is a 32-byte random value encoded as a hex string, giving
 *   256 bits of entropy that are infeasible to brute-force.
 * - GET, HEAD, and OPTIONS requests are idempotent by HTTP convention and are
 *   therefore exempt from CSRF checks.
 *
 * @example
 * ```ts
 * import { csrfProtection, generateCsrfToken } from './middleware/csrf';
 *
 * // Attach the middleware to every non-safe method
 * app.use(csrfProtection(['https://ecclesia.example.com']));
 *
 * // Before sending a response to the client, include a fresh token cookie
 * generateCsrfToken(res);
 * ```
 */

import type { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Length of the random token in bytes before hex encoding.
 * 32 bytes → 64 hex characters → 256 bits of entropy.
 */
const TOKEN_BYTE_LENGTH = 32;

/**
 * Name of the HTTP header the client must send with the CSRF token.
 * Browsers do not allow custom headers in cross-origin requests unless the
 * server explicitly opts in via CORS, so an attacker cannot set this header
 * without the target site cooperating.
 */
const CSRF_HEADER_NAME = 'X-CSRF-Token';

/**
 * Name of the cookie where the CSRF token is stored.
 * The cookie is readable by JavaScript running on the same origin, which is
 * required so the client can read it and echo it back in the header.
 */
const CSRF_COOKIE_NAME = 'csrf_token';

/**
 * Set of HTTP methods that are considered idempotent and safe from CSRF.
 * These methods MUST NOT cause any state-changing side-effects on the server.
 * POST, PUT, PATCH, and DELETE are NOT safe and will be validated.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cookie options applied when setting the CSRF token cookie.
 * - `httpOnly: false` – the cookie MUST be readable by client-side JS so it
 *   can be placed into the X-CSRF-Token header.
 * - `sameSite: 'strict'` – prevents the cookie from being sent on any
 *   cross-site request, which is the primary CSRF mitigation vector.
 * - `path: '/'` – makes the cookie available on every route.
 * - `secure` is intentionally omitted here; callers should set it based on
 *   whether the application is served over HTTPS in production.
 */
const COOKIE_OPTIONS = {
  httpOnly: false,
  sameSite: 'strict' as const,
  path: '/',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration options accepted by the {@link csrfProtection} middleware.
 */
export interface CsrfProtectionOptions {
  /**
   * List of allowed origins (scheme + host) that are trusted for same-origin
   * validation.  For example `['https://ecclesia.example.com']`.
   * A request whose Origin or Referer matches any of these is considered safe
   * even if the CSRF token header is absent or mismatched.
   */
  allowedOrigins: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the origin (scheme + host, optionally including port) from a URL
 * string.  Returns `null` when the input is malformed or empty.
 *
 * @param url - A full URL or a bare origin string.
 * @returns The origin portion, e.g. `"https://ecclesia.example.com"`, or `null`.
 */
function extractOrigin(url: string): string | null {
  try {
    // Use the built-in URL constructor for robust parsing.
    const parsed = new URL(url);
    // Reconstruct origin from the parsed components (scheme + host).
    return parsed.origin;
  } catch {
    // If the input cannot be parsed as a URL we consider it invalid.
    return null;
  }
}

/**
 * Checks whether the given request is same-origin by comparing the Origin or
 * Referer header against the list of allowed origins.
 *
 * The function implements a two-tier check:
 * 1. If an `Origin` header is present it is compared directly.  This is the
 *    most reliable indicator because browsers always send Origin on POST/PUT.
 * 2. If Origin is absent but a `Referer` header is present, its origin is
 *    extracted and compared.
 * 3. If neither header is present the request is NOT considered same-origin
 *    (the caller should fall back to token validation).
 *
 * @param req     - The incoming Express request object.
 * @param origins - List of trusted origins to compare against.
 * @returns `true` when the request is deemed same-origin.
 */
function isSameOrigin(req: Request, origins: string[]): boolean {
  // Attempt to read the Origin header first.
  const originHeader = req.headers.origin;
  if (typeof originHeader === 'string' && originHeader.length > 0) {
    // Normalize the origin value.
    const origin = originHeader.trim().toLowerCase();
    // Check against every allowed origin.
    for (const allowed of origins) {
      if (origin === allowed.toLowerCase()) {
        // Match found – the request is same-origin.
        return true;
      }
    }
  }

  // Fall back to the Referer header when Origin is absent.
  const refererHeader = req.headers.referer;
  if (typeof refererHeader === 'string' && refererHeader.length > 0) {
    // Extract the origin portion from the full Referer URL.
    const refererOrigin = extractOrigin(refererHeader);
    if (refererOrigin !== null) {
      // Compare the extracted origin against each allowed origin.
      const normalized = refererOrigin.toLowerCase();
      for (const allowed of origins) {
        if (normalized === allowed.toLowerCase()) {
          // Match found – the request is same-origin via Referer.
          return true;
        }
      }
    }
  }

  // No matching origin header or referer – not considered same-origin.
  return false;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Express middleware that enforces CSRF protection using the double-submit
 * cookie pattern.
 *
 * For every incoming request whose method is **not** GET, HEAD, or OPTIONS
 * the middleware verifies that:
 *
 * 1. The value of the `X-CSRF-Token` request header matches the value of the
 *    `csrf_token` cookie **AND** is non-empty, **OR**
 * 2. The request is determined to be same-origin (Origin/Referer matches one
 *    of the configured allowed origins).
 *
 * When validation fails the middleware responds with HTTP 403 Forbidden and a
 * JSON body containing an error message.  On success the `next()` callback is
 * invoked to pass control downstream.
 *
 * @param optionsOrOrigins - Either an {@link CsrfProtectionOptions} object or a
 *   plain array of allowed origin strings for convenience.
 * @returns An Express middleware function.
 *
 * @example
 * ```ts
 * // Using the array shorthand
 * app.use(csrfProtection(['https://ecclesia.example.com']));
 *
 * // Using the full options object
 * app.use(csrfProtection({ allowedOrigins: ['https://ecclesia.example.com'] }));
 * ```
 */
export function csrfProtection(
  optionsOrOrigins: CsrfProtectionOptions | string[],
): (req: Request, res: Response, next: NextFunction) => void {
  // Normalize the input into a consistent options structure.
  const options: CsrfProtectionOptions = Array.isArray(optionsOrOrigins)
    ? { allowedOrigins: optionsOrOrigins }
    : optionsOrOrigins;

  // Return the actual Express middleware closure.
  return (req: Request, res: Response, next: NextFunction): void => {
    // Allow safe (idempotent) methods to pass through without any checks.
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }

    // Read the CSRF token from the cookie that the client should have stored.
    const cookieToken =
      typeof req.cookies === 'object' && req.cookies !== null
        ? (req.cookies[CSRF_COOKIE_NAME] as string | undefined)
        : undefined;

    // Read the CSRF token the client sent in the request header.
    const headerToken =
      typeof req.headers[CSRF_HEADER_NAME.toLowerCase()] === 'string'
        ? (req.headers[CSRF_HEADER_NAME.toLowerCase()] as string)
        : undefined;

    // Determine whether the token values are non-empty strings and equal.
    const tokensMatch =
      typeof cookieToken === 'string' &&
      typeof headerToken === 'string' &&
      cookieToken.length > 0 &&
      headerToken.length > 0 &&
      cookieToken === headerToken;

    // If the tokens do not match, check the same-origin fallback.
    if (!tokensMatch) {
      // Verify that the request originated from a trusted origin.
      const sameOrigin = isSameOrigin(req, options.allowedOrigins);

      if (!sameOrigin) {
        // Neither token match nor same-origin – reject with 403 Forbidden.
        res.status(403).json({
          error: 'CSRF validation failed. Provide a valid X-CSRF-Token header or ensure the request is same-origin.',
        });
        return;
      }
    }

    // Validation passed – continue to the next middleware / route handler.
    next();
  };
}

// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------

/**
 * Generates a cryptographically secure random CSRF token and sets it as a
 * cookie on the given response.
 *
 * The token is a 32-byte (256-bit) random value encoded as a lowercase hex
 * string, producing a 64-character token such as
 * `"a1b2c3d4e5f6…90abcdef"`.
 *
 * The cookie is configured with `SameSite=Strict` and `httpOnly=false` so that:
 * - It is never sent on cross-site requests, blocking the primary CSRF vector.
 * - Client-side JavaScript can read it to include it in the X-CSRF-Token header.
 *
 * @param res    - The Express response object to attach the cookie to.
 * @param options - Optional overrides for the cookie name or path.
 * @returns The newly generated token string (useful for debugging or logging).
 */
export function generateCsrfToken(
  res: Response,
  options?: { cookieName?: string; path?: string },
): string {
  // Use Node.js crypto to generate a cryptographically strong random value.
  const tokenBytes = randomBytes(TOKEN_BYTE_LENGTH);

  // Encode the raw bytes as a lowercase hex string for easy transport.
  const token = tokenBytes.toString('hex');

  // Resolve the cookie name (default to the module constant).
  const cookieName = options?.cookieName ?? CSRF_COOKIE_NAME;

  // Resolve the cookie path (default to the module constant).
  const path = options?.path ?? COOKIE_OPTIONS.path;

  // Set the CSRF token cookie on the response.
  res.cookie(cookieName, token, {
    // Allow client-side JavaScript to read the cookie value.
    httpOnly: COOKIE_OPTIONS.httpOnly,
    // Prevent the cookie from being sent on cross-site requests.
    sameSite: COOKIE_OPTIONS.sameSite,
    // Make the cookie available on all routes.
    path,
  });

  // Return the token so callers can optionally log or embed it.
  return token;
}

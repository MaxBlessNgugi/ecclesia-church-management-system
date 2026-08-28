// =============================================================================
// Ecclesia Backend — Financial Idempotency Middleware
// =============================================================================
//
// PURPOSE
//   Prevents duplicate execution of critical financial transactions (transfers,
//   deposits, expenses) if network retries or rapid UI double-clicking occurs.
//
// HOW IT WORKS
//   Clients supply an optional `X-Idempotency-Key` header with POST requests.
//   If a key is re-sent within the 24-hour window, the server returns the cached
//   response immediately without executing the handler again.
// =============================================================================
import { Request, Response, NextFunction } from 'express';

interface CachedResponse {
  statusCode: number;
  body: any;
  timestamp: number;
}

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const cache = new Map<string, CachedResponse>();

/**
 * Periodically cleans up expired keys from the in-memory cache.
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > IDEMPOTENCY_TTL_MS) {
      cache.delete(key);
    }
  }
}, 60 * 60 * 1000); // Clean every hour

/**
 * Express middleware for idempotency control.
 */
export function requireIdempotencyKey(req: Request, res: Response, next: NextFunction) {
  const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;

  // If no idempotency key provided, pass through to route handler normally.
  if (!idempotencyKey) {
    return next();
  }

  const cached = cache.get(idempotencyKey);
  if (cached) {
    // Return cached response immediately
    res.setHeader('X-Cache-Lookup', 'HIT');
    return res.status(cached.statusCode).json(cached.body);
  }

  // Intercept res.json to capture response before returning
  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      cache.set(idempotencyKey, {
        statusCode: res.statusCode,
        body,
        timestamp: Date.now(),
      });
    }
    return originalJson(body);
  };

  next();
}

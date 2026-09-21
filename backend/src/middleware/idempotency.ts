// =============================================================================
// Ecclesia Backend — Financial Idempotency Middleware
// =============================================================================
//
// PURPOSE
//   Prevents duplicate execution of critical financial transactions (transfers,
//   deposits, expenses, contributions, sales) if network retries or rapid UI
//   double-clicking occurs.
//
// HOW IT WORKS
//   Clients may supply an `X-Idempotency-Key` header with POST requests.
//   Without the header the request executes normally (the middleware is
//   opt-in per request, mandatory per route only where mounted with a guard).
//
//   With a key:
//     1. If a response for that key is already cached (24h TTL) → replay it
//        immediately with `X-Cache-Lookup: HIT`. The handler does NOT run
//        again — no duplicate expense/sale/transfer is created.
//     2. If an identical-key request is currently IN FLIGHT (concurrent
//        double-click), the second request awaits the first's outcome and
//        receives the SAME response instead of executing in parallel. This
//        closes the race where two simultaneous requests both missed the
//        cache and both executed.
//     3. Otherwise the request executes and its 2xx response is cached.
//
//   Non-2xx responses are never cached — a failed request can be retried
//   with the same key.
// =============================================================================
import { Request, Response, NextFunction } from 'express';

interface CachedResponse {
  statusCode: number;
  body: any;
  timestamp: number;
}

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Cache of completed responses AND in-flight promises, keyed by idempotency
 * key. A Map<string, CachedResponse | Promise<CachedResponse>> — the value is
 * a Promise while the first request is still executing, then the resolved
 * response once it finishes (or nothing, if it failed).
 */
const cache = new Map<string, CachedResponse | Promise<CachedResponse>>();

/**
 * Periodically cleans up expired keys from the in-memory cache.
 * unref()'d so it never keeps the process (or a test worker) alive.
 */
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (value && typeof value === 'object' && 'timestamp' in value && now - value.timestamp > IDEMPOTENCY_TTL_MS) {
      cache.delete(key);
    }
  }
}, 60 * 60 * 1000); // Clean every hour
sweeper.unref();

/** Express middleware for idempotency control. */
export function requireIdempotencyKey(req: Request, res: Response, next: NextFunction) {
  const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;

  // No key provided → pass through to the route handler normally.
  if (!idempotencyKey) {
    return next();
  }

  const existing = cache.get(idempotencyKey);

  if (existing) {
    if (existing instanceof Promise) {
      // A request with this key is executing RIGHT NOW — await its outcome
      // and mirror it instead of running the handler a second time.
      res.setHeader('X-Cache-Lookup', 'HIT');
      existing
        .then((entry) => {
          if (!res.headersSent) res.status(entry.statusCode).json(entry.body);
        })
        .catch(() => {
          // The in-flight attempt failed before producing a cacheable
          // response — free the key and let this request try for itself.
          cache.delete(idempotencyKey);
          if (!res.headersSent) next();
        });
      return;
    }

    // Completed response already cached → replay it verbatim.
    res.setHeader('X-Cache-Lookup', 'HIT');
    return res.status(existing.statusCode).json(existing.body);
  }

  // First request with this key: register an in-flight promise so concurrent
  // duplicates coalesce, then intercept res.json to capture the outcome.
  let resolveInflight!: (entry: CachedResponse) => void;
  let rejectInflight!: (err: Error) => void;
  const inflight = new Promise<CachedResponse>((resolve, reject) => {
    resolveInflight = resolve;
    rejectInflight = reject;
  });
  cache.set(idempotencyKey, inflight);
  // Mark rejections as handled up front: when the in-flight attempt fails and
  // NO duplicate is waiting on this promise, Node would otherwise emit an
  // unhandledRejection. A no-op catch does not affect waiters attaching later.
  inflight.catch(() => undefined);

  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const entry: CachedResponse = { statusCode: res.statusCode, body, timestamp: Date.now() };
      // Replace the promise with the resolved value for future replays.
      cache.set(idempotencyKey, entry);
      resolveInflight(entry);
    } else {
      // Non-2xx: nothing is cached; free waiting duplicates to retry.
      // (The promise's own no-op catch marks this rejection as handled when
      // nobody is waiting; real waiters receive it via their .catch.)
      cache.delete(idempotencyKey);
      rejectInflight(new Error(`idempotent request failed with ${res.statusCode}`));
    }
    return originalJson(body);
  };

  next();
}

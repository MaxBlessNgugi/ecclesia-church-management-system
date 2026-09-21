// =============================================================================
// Transient database error classifier + bounded retry
// -----------------------------------------------------------------------------
// PURPOSE
//   PRIMARY concurrency correctness comes from transaction design: atomic
//   guarded updates, single-statement guards, and consistent lock ordering
//   (see routes/finance.ts, routes/inventory.ts, routes/ledgers.ts).
//
//   This module is the SECONDARY safety net for the two residual sources of
//   transient failure that no lock ordering can fully eliminate:
//     1. Postgres deadlock detection (SQLSTATE 40P01) — theoretically possible
//        whenever two transactions lock more than one row.
//     2. Serialization failure (40001) — only when an isolation level above
//        READ COMMITTED is used, or on hot-standby conflicts.
//
//   We do NOT blindly retry every error: the classifier matches only the two
//   transient SQLSTATEs plus Prisma's P2034 (transaction conflict). Zod
//   validation errors, AppError/HttpError business rejections (409/422/etc.),
//   Prisma P2002 unique violations and every other failure propagate
//   immediately — retrying those would be wrong.
// =============================================================================

/** SQLSTATE codes that are always safe to retry: deadlock + serialization failure. */
const TRANSIENT_SQLSTATES = new Set(['40001', '40P01']);

/** Prisma's own transaction-conflict error code. */
const TRANSIENT_PRISMA_CODES = new Set(['P2034']);

/**
 * Decides whether an error is a transient transaction conflict worth retrying.
 * Anything not positively identified as transient is treated as permanent.
 */
export function isTransientTransactionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string; meta?: { code?: string } };

  if (typeof e.code === 'string') {
    // Prisma known request errors surface their own `code` (P2034); the raw
    // driver error inside `meta` carries the SQLSTATE (40001/40P01).
    if (TRANSIENT_PRISMA_CODES.has(e.code)) return true;
    if (TRANSIENT_SQLSTATES.has(e.code)) return true;
  }
  if (e.meta && typeof e.meta.code === 'string' && TRANSIENT_SQLSTATES.has(e.meta.code)) return true;

  // Postgres drivers sometimes flatten the SQLSTATE into the message.
  const msg = e.message ?? '';
  return msg.includes('40P01') || msg.includes('40001') || /deadlock detected|could not serialize/i.test(msg);
}

/**
 * Runs `fn`, retrying only transient transaction errors with exponential
 * backoff and full jitter until `maxAttempts` is exhausted.
 *
 * Non-transient errors (validation, permissions, unique-constraint business
 * conflicts, etc.) are rethrown immediately without retry.
 *
 * @param fn        Operation to run.
 * @param maxAttempts  Total attempts including the first (default 4).
 * @param baseDelayMs  First backoff delay in ms (default 25).
 * @param label     Short name used in retry log lines.
 */
export async function retryOnTransient<T>(
  fn: (attempt: number) => Promise<T>,
  { maxAttempts = 4, baseDelayMs = 25, label = 'operation' }: { maxAttempts?: number; baseDelayMs?: number; label?: string } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts || !isTransientTransactionError(err)) throw err;
      // Full jitter: random delay in [0, baseDelay * 2^(attempt-1)] — spreads
      // out contending writers instead of herding them into the next retry.
      const delay = Math.floor(Math.random() * baseDelayMs * 2 ** (attempt - 1));
      console.warn(`[transient] ${label} hit a transient DB conflict (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError; // unreachable — the loop always returns or throws
}

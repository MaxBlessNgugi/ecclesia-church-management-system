// =============================================================================
// Ecclesia Backend — Error Handling (AppError + Centralized errorHandler)
// -----------------------------------------------------------------------------
// Two pieces live here:
//   1. AppError  – lightweight, typed throwable with a user-facing message and
//      HTTP status. Throw it inside route handlers; the errorHandler converts it
//      to a clean JSON shape.
//   2. errorHandler – Express 4-arg middleware registered LAST in index.ts.
//      It normalises Prisma ZodError / P2025 / P2002 / etc. into the same
//      { success, message, code } envelope, logs the full detail server-side,
//      and emits a safe client-facing string.
//
// This supersedes the existing middleware/error.ts for route-level errors while
// keeping backward compatibility (HttpError from audit.ts still works).
// =============================================================================
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

/**
 * Custom application error with a guaranteed user-facing message.
 *
 * Usage inside a route handler:
 *   const post = await appPrisma.post.findUnique({ where: { id } });
 *   if (!post) throw new AppError('Post not found', 404, 'POST_NOT_FOUND');
 *
 * The errorHandler maps `status` → HTTP code, `userMessage` → client JSON.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly userMessage: string;

  constructor(userMessage: string, status = 400, code = 'APP_ERROR') {
    super(userMessage);
    this.name = 'AppError';
    this.userMessage = userMessage;
    this.status = status;
    this.code = code;
  }
}

/**
 * Centralized Express error handler.
 *
 * Registered as the **last** middleware in src/index.ts so it catches every
 * error thrown or `next(err)`-ed from route handlers and earlier middleware.
 *
 * Priority:
 *   1. AppError          → its explicit status + userMessage
 *   2. HttpError (audit) → its explicit status + message
 *   3. ZodError           → 400 with joined field-level messages
 *   4. Prisma P2002       → 409 unique-constraint conflict
 *   5. Prisma P2025       → 404 record not found
 *   6. Prisma P2003       → 400 foreign-key constraint
 *   7. Anything else      → 500 (logged, generic client message)
 *
 * In production the client ALWAYS receives a generic 500 string so internal
 * stack traces / SQL fragments never leak. In development the raw message is
 * included so developers can debug quickly.
 */
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  // Log full detail server-side for debugging — never sent to client.
  console.error('[ERROR]', {
    message: err?.message,
    stack: err?.stack,
    code: err?.code,
    status: err?.status,
    url: _req?.originalUrl,
    method: _req?.method,
  });

  // ── AppError (our own typed errors) ─────────────────────────────────────
  if (err instanceof AppError) {
    return res.status(err.status).json({
      success: false,
      message: err.userMessage,
      code: err.code,
    });
  }

  // ── HttpError from audit.ts (backward compatibility) ────────────────────
  if (err && err.name === 'HttpError' && typeof err.status === 'number') {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      code: 'HTTP_ERROR',
    });
  }

  // ── Zod validation errors ───────────────────────────────────────────────
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: err.issues.map((i) => i.message).join('; ') || 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.issues,
    });
  }

  // ── Prisma unique-constraint violation (duplicate record) ──────────────
  if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      message: 'A record with this unique field already exists',
      code: 'DUPLICATE_RECORD',
    });
  }

  // ── Prisma record-not-found ────────────────────────────────────────────
  if (err && typeof err === 'object' && 'code' in err && err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      message: 'Record not found',
      code: 'NOT_FOUND',
    });
  }

  // ── Prisma foreign-key constraint violation ────────────────────────────
  if (err && typeof err === 'object' && 'code' in err && err.code === 'P2003') {
    return res.status(400).json({
      success: false,
      message: 'Referenced record does not exist',
      code: 'FOREIGN_KEY_ERROR',
    });
  }

  // ── Fallback: 500 ───────────────────────────────────────────────────────
  // Never leak raw internals to the client in production.
  const isDev = process.env.NODE_ENV !== 'production';
  const message = isDev && err?.message
    ? err.message
    : 'Something went wrong. Please try again or send a Support Bundle.';

  res.status(500).json({
    success: false,
    message,
    code: 'INTERNAL_ERROR',
  });
}

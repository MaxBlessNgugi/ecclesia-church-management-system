// =============================================================================
// Ecclesia Backend — Centralized Express Error Handler
// =============================================================================
//
// PURPOSE
//   Registered LAST in the middleware chain (see src/index.ts). Converts known
//   error types into clean, client-safe JSON responses while logging the full
//   error details to the server-side error log for debugging and support.
//
// ERROR TYPE MAPPING
//   HttpError         → its explicit status code (400/403/404/500)
//   ZodError          → 400 with a human-readable summary of validation issues
//   Prisma P2002      → 409 unique constraint violation (duplicate record)
//   Prisma P2025      → 404 record not found
//   Prisma P2003      → 400 foreign key constraint (referenced record missing)
//   anything else     → 500 (logged to console + error log file, raw message kept)
//
// SECURITY NOTES
//   - Raw error messages (Prisma/SQLite internals) are NEVER sent to the client.
//   - Only generic, user-friendly error messages are returned in responses.
//   - Full error details (including stack traces) are written to logs/error.log.
//   - The writeErrorLog function is wrapped in try/catch to prevent logging
//     failures from crashing the response path.
//
// LOGGING
//   Every error is appended to logs/error.log with:
//   - ISO 8601 timestamp for chronological ordering
//   - HTTP method and request URL for context
//   - Full error stack trace for debugging
//   This file can be shipped with deployment bundles for support diagnosis.
//
// MOUNTING
//   Must be registered AFTER all route handlers and other middleware:
//     app.use(express.json());
//     app.use('/api', apiRouter);
//     app.use(errorHandler);  // ← Always last
// =============================================================================

// Import Node.js fs module for synchronous file operations.
// Used to write error logs to the filesystem. Synchronous operations are used
// intentionally in error handlers because async operations may not complete
// before the response is sent, and we need to ensure log writes succeed.
import fs from 'node:fs';

// Import Node.js path module for cross-platform file path construction.
// path.join() handles platform-specific separators (backslash on Windows, forward on Unix).
import path from 'node:path';

// Import Express types for the error handler signature.
// The error handler must follow Express's 4-argument error middleware pattern.
import { Request, Response, NextFunction } from 'express';

// Import ZodError type for runtime validation error detection.
// ZodError is thrown by Zod schema validation when request data fails validation.
import { ZodError } from 'zod';

// Import HttpError class for custom application-level error detection.
// HttpError is used throughout the codebase for intentional error responses
// (e.g., "not found", "forbidden", "bad request") with explicit status codes.
import { HttpError } from '../lib/audit.js';

// Import the structured logger for production error logging.
// logger writes to both console and configured transports (file, external services).
import { logger } from '../lib/logger.js';

// Directory where error logs are stored, resolved to an absolute path.
// Uses process.cwd() as the base, so logs/ is relative to the project root.
const LOG_DIR = path.resolve(process.cwd(), 'logs');

// Full path to the error log file. All errors are appended to this file.
const LOG_FILE = path.join(LOG_DIR, 'error.log');

/**
 * Writes error details to the server-side error log file.
 *
 * This function appends a single line to logs/error.log containing:
 *   - ISO 8601 timestamp for chronological ordering
 *   - HTTP method and request URL for context
 *   - Full error stack trace (or stringified error) for debugging
 *
 * The entire function is wrapped in try/catch because logging failures must
 * never crash the response path — the user should still receive an error
 * response even if the log write fails (e.g., disk full, permissions issue).
 *
 * @param err - The error object (unknown type — could be anything thrown).
 * @param req - The Express request object (provides method and originalUrl).
 *
 * @example
 * writeErrorLog(new Error('DB connection failed'), req);
 * // Appends: [2024-01-15T10:30:00.000Z] GET /api/users :: Error: DB connection failed
 */
function writeErrorLog(err: unknown, req: Request): void {
  try {
    // Create the logs/ directory if it doesn't exist. recursive: true ensures
    // parent directories are also created if needed (e.g., first run).
    fs.mkdirSync(LOG_DIR, { recursive: true });

    // Extract the stack trace for Error instances, or fall back to stringifying
    // the error. Some thrown values may not be Error objects (e.g., strings).
    const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);

    // Format the log line with timestamp, HTTP method, request URL, and error details.
    // ISO 8601 format ensures chronological sorting in log files.
    const line = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} :: ${stack}\n`;

    // Append the log line to the error log file. appendFileSync creates the file
    // if it doesn't exist, and appends to it if it does.
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    // Logging must never crash the response path. If we can't write to the log
    // file (disk full, permissions error, etc.), silently swallow the error
    // and let the response continue. The error is still logged to console by
    // the structured logger below.
    /* logging must never crash the response path */
  }
}

/**
 * Centralized Express error handler middleware.
 *
 * This middleware is registered LAST in the Express middleware chain and
 * catches all errors thrown or passed via next(err) from preceding middleware
 * and route handlers. It converts known error types into appropriate HTTP
//  responses while logging full details to the error log.
 *
 * Error handling priority:
 *   1. HttpError — Custom application errors with explicit status codes.
 *   2. ZodError — Zod validation errors with field-level details.
 *   3. Prisma P2002 — Unique constraint violation (duplicate record).
 *   4. Prisma P2025 — Record not found.
 *   5. Prisma P2003 — Foreign key constraint (referenced record missing).
 *   6. Unknown errors — Generic 500 with minimal client-facing information.
 *
 * @param err   - The error that was thrown or passed to next().
 * @param req   - The Express request object that triggered the error.
 * @param res   - The Express response object to send the error response.
 * @param _next - The next middleware (required by Express error handler signature).
 *
 * @example
 * // Express error handler registration (src/index.ts):
 * import { errorHandler } from './middleware/error';
 * app.use(errorHandler); // Must be after all route handlers
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  // Always log the error to the server-side log file first.
  // This captures every error regardless of type for debugging and auditing.
  writeErrorLog(err, req);

  // Handle HttpError: Custom application-level errors with explicit status codes.
  // These are thrown intentionally (e.g., new HttpError(404, 'User not found'))
  // and carry both a status code and a user-friendly message.
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  // Handle ZodError: Validation errors from Zod schema parsing.
  // These contain an array of field-level issues. We join all issue messages
  // with semicolons to provide a comprehensive validation summary.
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: err.issues.map((i) => i.message).join('; ') || 'Validation failed',
    });
  }

  // Handle Prisma P2002: Unique constraint violation.
  // This occurs when trying to create or update a record that would violate
  // a unique index constraint (e.g., duplicate email address). Maps to 409 Conflict.
  if (err && typeof err === 'object' && 'code' in err && (err as any).code === 'P2002') {
    return res.status(409).json({ error: 'A record with this unique field already exists' });
  }

  // Handle Prisma P2025: Record not found.
  // This occurs when trying to update or delete a record that doesn't exist
  // (e.g., findUnique returns null, or delete operates on a non-existent ID).
  // Maps to 404 Not Found.
  if (err && typeof err === 'object' && 'code' in err && (err as any).code === 'P2025') {
    return res.status(404).json({ error: 'Record not found' });
  }

  // Handle Prisma P2003: Foreign key constraint violation.
  // This occurs when trying to create or update a record that references a
  // non-existent record via a foreign key (e.g., assigning a user to a
  // non-existent group). Maps to 400 Bad Request.
  if (err && typeof err === 'object' && 'code' in err && (err as any).code === 'P2003') {
    return res.status(400).json({ error: 'Referenced record does not exist' });
  }

  // Log unhandled errors with the structured logger for production monitoring.
  // The structured logger writes to console and any configured transports
  // (e.g., external logging services). Full error details including stack trace
  // are captured here for debugging. NEVER echo raw error internals to the client
  // — the full error was already written to logs/error.log above.
  logger.error('Unhandled request error', {
    method: req.method,
    url: req.originalUrl,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  // Return a generic 500 error to the client. The response intentionally contains
  // no diagnostic information about the actual error to prevent information leakage.
  res.status(500).json({ error: 'Internal server error' });
}

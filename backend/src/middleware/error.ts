// =============================================================================
// Centralized Express error handler
// -----------------------------------------------------------------------------
// Registered LAST in the middleware chain (see src/index.ts). Converts known
// error types into clean JSON responses:
//   HttpError  -> its explicit status code (400/403/404/500)
//   ZodError   -> 400 with a human-readable summary of validation issues
//   P2002      -> 409 unique constraint violation (SQLite: UNIQUE constraint)
//   P2025      -> 404 record not found
//   anything   -> 500 (logged to console + error log file, raw message kept)
//
// Every handled error is appended to logs/error.log with a timestamp so support
// can diagnose a deployment from the log bundle instead of the console.
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../lib/audit.js';

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'error.log');

function writeErrorLog(err: unknown, req: Request): void {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
    const line = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} :: ${stack}\n`;
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    /* logging must never crash the response path */
  }
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  writeErrorLog(err, req);

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: err.issues.map((i) => i.message).join('; ') || 'Validation failed',
    });
  }
  // Prisma known-request-error codes (SQLite backend).
  if (err && typeof err === 'object' && 'code' in err && (err as any).code === 'P2002') {
    return res.status(409).json({ error: 'A record with this unique field already exists' });
  }
  if (err && typeof err === 'object' && 'code' in err && (err as any).code === 'P2025') {
    return res.status(404).json({ error: 'Record not found' });
  }
  console.error(err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
}

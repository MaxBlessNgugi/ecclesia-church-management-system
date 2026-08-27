// =============================================================================
// Decimal JSON Middleware — converts Prisma Decimal to numbers in responses
// =============================================================================
//
// Prisma returns Decimal columns as `Prisma.Decimal` objects.  When Express
// calls `res.json()`, JSON.stringify invokes `.toJSON()` on Decimal, which
// returns a *string* (e.g. "100.50").  Most frontends expect numbers.
//
// This middleware wraps `res.json()` so every Decimal value in the response
// body is converted to a plain JS number before serialization.
//
// MOUNT:  app.use(decimalJson())  — before route handlers.
// =============================================================================

import type { Request, Response, NextFunction } from 'express';

/** Recursively walk a value and convert Prisma.Decimal objects to numbers. */
function convertDecimals(val: unknown): unknown {
  if (val == null) return val;

  // Prisma.Decimal objects have a .toNumber() method
  if (typeof val === 'object' && val !== null && 'toNumber' in val) {
    return (val as { toNumber(): number }).toNumber();
  }

  // Date objects: preserve as-is (JSON.stringify converts to ISO string)
  if (val instanceof Date) {
    return val;
  }

  if (Array.isArray(val)) {
    return val.map(convertDecimals);
  }

  if (typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = convertDecimals(v);
    }
    return out;
  }

  return val;
}

/**
 * Express middleware that intercepts res.json() and converts all Prisma
 * Decimal values to plain JS numbers before serialization.
 */
export function decimalJson() {
  return (_req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = (body: unknown) => {
      return originalJson(convertDecimals(body));
    };

    next();
  };
}

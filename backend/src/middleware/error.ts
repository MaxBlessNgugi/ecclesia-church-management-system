import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: err.issues.map((i) => i.message).join('; ') || 'Validation failed',
    });
  }
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

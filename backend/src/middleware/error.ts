import type { NextFunction, Request, Response } from 'express';
import { ZodError, z } from 'zod';
import { HttpError } from '../utils/errors';
import { createLogger } from '../lib/logger';

const log = createLogger('http');

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'Route not found' });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: z.flattenError(err).fieldErrors });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  log.error(`${req.method} ${req.path} failed`, err);
  res.status(500).json({ error: 'Something went wrong' });
}

import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

/**
 * Menambahkan request-id unik untuk tracing/audit.
 */
export const requestId = (req: Request, res: Response, next: NextFunction): void => {
  const id = (req.headers['x-request-id'] as string) || randomUUID();
  res.setHeader('X-Request-Id', id);
  (req as Request & { requestId?: string }).requestId = id;
  next();
};

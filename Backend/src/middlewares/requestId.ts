import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

/**
 * Menambahkan request-id unik untuk tracing/audit.
 */
export const requestId = (req: Request, res: Response, next: NextFunction): void => {
  const supplied = req.headers['x-request-id'];
  const id = typeof supplied === 'string' && /^[0-9a-f-]{36}$/i.test(supplied) ? supplied : randomUUID();
  res.setHeader('X-Request-Id', id);
  (req as Request & { requestId?: string }).requestId = id;
  next();
};

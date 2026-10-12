import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { ForbiddenError } from '../errors/AppError';
import { MESSAGES } from '../config/constants';

/** Lindungi endpoint cookie dari cross-site request. */
export const requireTrustedOrigin = (req: Request, _res: Response, next: NextFunction): void => {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && !env.corsOrigins.includes(origin)) {
    return next(new ForbiddenError(MESSAGES.AUTH.FORBIDDEN));
  }
  next();
};

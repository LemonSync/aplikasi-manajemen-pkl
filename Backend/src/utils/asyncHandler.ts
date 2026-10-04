import { NextFunction, Request, Response } from 'express';

/**
 * Wrapper untuk handler async agar error otomatis diteruskan ke error handler.
 * @example router.get('/', asyncHandler(async (req, res) => { ... }))
 */
export const asyncHandler =
  <T = unknown>(fn: (req: Request, res: Response, next: NextFunction) => Promise<T>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

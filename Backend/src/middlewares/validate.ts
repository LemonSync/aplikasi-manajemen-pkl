import { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { UnprocessableError } from '../errors/AppError';
import { MESSAGES } from '../config/constants';

type Source = 'body' | 'query' | 'params';

interface ValidationSchemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

/**
 * Middleware validasi request dengan zod.
 * Menimpa nilai sumber dengan hasil parsing (agar tipe & default diterapkan).
 *
 * @example router.post('/', validate({ body: createUserSchema }), handler)
 */
export const validate =
  (schemas: ValidationSchemas) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      (Object.keys(schemas) as Source[]).forEach((source) => {
        const schema = schemas[source];
        if (!schema) return;
        const parsed = schema.parse(req[source]);
        // assign kembali hasil parsing (menerapkan default/coerce/transform)
        req[source] = parsed as Request[typeof source];
      });
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return next(new UnprocessableError(MESSAGES.VALIDATION, details));
      }
      return next(err);
    }
  };

import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';
import { HTTP_STATUS, MESSAGES } from '../config/constants';
import { logger } from '../config/logger';
import { env } from '../config/env';

/**
 * Middleware penanganan 404 (route tidak ditemukan).
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    message: MESSAGES.NOT_FOUND,
    data: null,
    path: req.originalUrl,
  });
};

/**
 * Global error handler. Mengubah semua error menjadi response JSON konsisten.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
  let statusCode: number = HTTP_STATUS.INTERNAL;
  let message: string = MESSAGES.INTERNAL;
  let details: unknown;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    statusCode = HTTP_STATUS.UNPROCESSABLE;
    message = MESSAGES.VALIDATION;
    details = err.issues.map((e) => ({ field: e.path.join('.'), message: e.message }));
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      statusCode = HTTP_STATUS.CONFLICT;
      const target = err.meta?.target;
      const fieldStr = Array.isArray(target) ? target.join(', ') : typeof target === 'string' ? target : 'field unik';
      message = `${MESSAGES.CONFLICT}: ${fieldStr}`;
    } else if (err.code === 'P2025') {
      statusCode = HTTP_STATUS.NOT_FOUND;
      message = MESSAGES.NOT_FOUND;
    } else {
      statusCode = HTTP_STATUS.BAD_REQUEST;
      message = 'Kesalahan basis data';
    }
    details = env.isProduction ? undefined : err.meta;
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    message = 'Kesalahan validasi basis data';
  }

  // Logging: error 5xx sebagai error, 4xx sebagai warn
  const logMeta = { statusCode, path: req.originalUrl, method: req.method };
  if (statusCode >= 500) {
    logger.error(`${message}`, { ...logMeta, stack: (err as Error)?.stack });
  } else {
    logger.warn(`${message}`, logMeta);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { details } : {}),
    ...(env.isDevelopment && err instanceof Error ? { stack: err.stack } : {}),
  });
};

import { Response } from 'express';
import { HTTP_STATUS } from '../config/constants';

export interface Meta {
  page?: number;
  perPage?: number;
  total?: number;
  totalPages?: number;
  [key: string]: unknown;
}

export interface SuccessResponse<T> {
  success: true;
  message: string;
  data: T;
  meta?: Meta;
}

/**
 * Helper response sukses yang konsisten.
 */
export const sendSuccess = <T>(
  res: Response,
  data: T,
  message = 'OK',
  statusCode: number = HTTP_STATUS.OK,
  meta?: Meta
): Response => {
  const body: SuccessResponse<T> = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
};

/**
 * Menghitung meta pagination.
 */
export const buildPaginationMeta = (page: number, perPage: number, total: number): Meta => ({
  page,
  perPage,
  total,
  totalPages: Math.ceil(total / perPage) || 1,
});

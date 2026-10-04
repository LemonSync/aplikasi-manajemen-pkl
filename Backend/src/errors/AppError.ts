import { HTTP_STATUS } from '../config/constants';

/**
 * Base error aplikasi. Semua error bisnis mewarisi kelas ini.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number = HTTP_STATUS.INTERNAL, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Permintaan tidak valid', details?: unknown) {
    super(message, HTTP_STATUS.BAD_REQUEST, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Tidak terautentikasi', details?: unknown) {
    super(message, HTTP_STATUS.UNAUTHORIZED, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Akses ditolak', details?: unknown) {
    super(message, HTTP_STATUS.FORBIDDEN, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Data tidak ditemukan', details?: unknown) {
    super(message, HTTP_STATUS.NOT_FOUND, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Terjadi konflik data', details?: unknown) {
    super(message, HTTP_STATUS.CONFLICT, details);
  }
}

export class UnprocessableError extends AppError {
  constructor(message = 'Data tidak dapat diproses', details?: unknown) {
    super(message, HTTP_STATUS.UNPROCESSABLE, details);
  }
}

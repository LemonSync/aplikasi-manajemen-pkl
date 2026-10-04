import { NextFunction, Request, Response } from 'express';
import { Role, StudentPhase } from '@prisma/client';
import { verifyAccessToken, JwtAccessPayload } from '../utils/jwt';
import { ForbiddenError, UnauthorizedError } from '../errors/AppError';
import { MESSAGES } from '../config/constants';
import { studentWorkflowService } from '../services/studentWorkflow.service';

/**
 * Perluas tipe Request Express dengan data user terautentikasi.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtAccessPayload;
    }
  }
}

/**
 * Middleware autentikasi: memverifikasi Bearer access token.
 * Menyimpan payload ke `req.user`.
 */
export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return next(new UnauthorizedError(MESSAGES.AUTH.UNAUTHORIZED));
  }

  const token = header.slice('Bearer '.length).trim();

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    return next();
  } catch (err) {
    const name = (err as Error).name;
    if (name === 'TokenExpiredError') {
      return next(new UnauthorizedError(MESSAGES.AUTH.TOKEN_EXPIRED));
    }
    return next(new UnauthorizedError(MESSAGES.AUTH.TOKEN_INVALID));
  }
};

/**
 * Middleware otorisasi berbasis role (RBAC).
 * @example authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN)
 */
export const authorizeRoles =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError(MESSAGES.AUTH.UNAUTHORIZED));
    }
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError(MESSAGES.AUTH.FORBIDDEN));
    }
    return next();
  };

/**
 * Middleware Phase Guard: membatasi aksi siswa hanya pada fase tertentu.
 * Role non-siswa otomatis lolos (guard ini hanya relevan untuk siswa).
 * @example requirePhase(StudentPhase.PKL_AKTIF)
 */
export const requirePhase =
  (...phases: StudentPhase[]) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      return next(new UnauthorizedError(MESSAGES.AUTH.UNAUTHORIZED));
    }
    if (req.user.role !== Role.SISWA) {
      return next();
    }
    try {
      // JWT dibuat saat login, sedangkan jadwal fase dapat berubah setelahnya.
      // Selalu gunakan fase terbaru dari database/jadwal untuk aksi siswa.
      const effectivePhase = await studentWorkflowService.syncScheduledPhase(req.user.sub);
      req.user.phase = effectivePhase;
      if (!effectivePhase || !phases.includes(effectivePhase)) {
        return next(new ForbiddenError(MESSAGES.PHASE));
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };

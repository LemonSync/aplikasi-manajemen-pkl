import { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { sendSuccess } from '../utils/response';
import { getRequestContext } from '../utils/request';
import { REFRESH_COOKIE_NAME } from '../config/constants';
import { env } from '../config/env';
import { asyncHandler } from '../utils/asyncHandler';
import { LoginDTO, ChangePasswordDTO } from '../validators/auth.validator';

const refreshCookieOptions = {
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'lax' as const,
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Controller autentikasi.
 */
export class AuthController {
  /** POST /api/auth/login */
  login = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as LoginDTO;
    const ctx = getRequestContext(req);

    const result = await authService.login({
      identifier: dto.identifier,
      password: dto.password,
      userAgent: ctx.userAgent,
      ipAddress: ctx.ipAddress,
    });

    res.cookie(REFRESH_COOKIE_NAME, result.tokens.refreshToken, refreshCookieOptions);
    return sendSuccess(res, result, 'Login berhasil');
  });

  /** POST /api/auth/refresh */
  refresh = asyncHandler(async (req: Request, res: Response) => {
    const token = (req.body?.refreshToken as string) || (req.cookies?.[REFRESH_COOKIE_NAME] as string);
    const ctx = getRequestContext(req);

    const result = await authService.refresh(token, {
      userAgent: ctx.userAgent,
      ipAddress: ctx.ipAddress,
    });

    res.cookie(REFRESH_COOKIE_NAME, result.tokens.refreshToken, refreshCookieOptions);
    return sendSuccess(res, result, 'Token diperbarui');
  });

  /** POST /api/auth/logout */
  logout = asyncHandler(async (req: Request, res: Response) => {
    const token = (req.body?.refreshToken as string) || (req.cookies?.[REFRESH_COOKIE_NAME] as string);
    await authService.logout(token, req.user?.sub);
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
    return sendSuccess(res, null, 'Logout berhasil');
  });

  /** GET /api/auth/me */
  me = asyncHandler(async (req: Request, res: Response) => {
    const user = await authService.me(req.user!.sub);
    return sendSuccess(res, user, 'OK');
  });

  /** POST /api/auth/change-password */
  changePassword = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as ChangePasswordDTO;
    const ctx = getRequestContext(req);
    const user = await authService.changePassword(req.user!.sub, dto.currentPassword, dto.newPassword, {
      userAgent: ctx.userAgent,
      ipAddress: ctx.ipAddress,
    });
    return sendSuccess(res, user, 'Password berhasil diganti');
  });
}

export const authController = new AuthController();

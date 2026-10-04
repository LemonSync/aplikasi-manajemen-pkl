import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { Role, StudentPhase } from '@prisma/client';

export interface JwtAccessPayload {
  sub: string;        // user id
  role: Role;
  phase?: StudentPhase | null;
  cohortId?: string | null;
}

export interface JwtRefreshPayload {
  sub: string;
  jti: string;        // id refresh token (untuk rotation/revoke)
}

export const signAccessToken = (payload: JwtAccessPayload): string => {
  const options: SignOptions = { expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
};

export const signRefreshToken = (payload: JwtRefreshPayload): string => {
  const options: SignOptions = { expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, options);
};

export const verifyAccessToken = (token: string): JwtAccessPayload => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtAccessPayload;
};

export const verifyRefreshToken = (token: string): JwtRefreshPayload => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtRefreshPayload;
};

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
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (!decoded || typeof decoded !== 'object' || typeof decoded.sub !== 'string') {
    throw new Error('Invalid access token claims');
  }
  if (!Object.values(Role).includes(decoded.role as Role)) {
    throw new Error('Invalid access token role');
  }
  if (decoded.phase !== undefined && decoded.phase !== null && !Object.values(StudentPhase).includes(decoded.phase as StudentPhase)) {
    throw new Error('Invalid access token phase');
  }
  return decoded as JwtAccessPayload;
};

export const verifyRefreshToken = (token: string): JwtRefreshPayload => {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
  if (!decoded || typeof decoded !== 'object' || typeof decoded.sub !== 'string' || typeof decoded.jti !== 'string') {
    throw new Error('Invalid refresh token claims');
  }
  return decoded as JwtRefreshPayload;
};

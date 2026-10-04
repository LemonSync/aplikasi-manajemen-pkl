import { Request } from 'express';

/**
 * Ambil IP klien (mendukung reverse proxy).
 */
export const getClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
};

/**
 * Bangun konteks request untuk audit log.
 */
export const getRequestContext = (req: Request) => ({
  ipAddress: getClientIp(req),
  userAgent: (req.headers['user-agent'] ?? '').toString().slice(0, 255),
});

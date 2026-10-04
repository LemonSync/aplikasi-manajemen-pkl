import rateLimit from 'express-rate-limit';
import { HTTP_STATUS } from '../config/constants';
import { env } from '../config/env';

/**
 * Rate limiter global untuk API.
 */
export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Terlalu banyak permintaan, coba lagi nanti.',
  },
});

/**
 * Rate limiter ketat untuk endpoint login (anti brute-force).
 */
export const loginRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  statusCode: HTTP_STATUS.TOO_MANY_REQUESTS,
  message: {
    success: false,
    message: 'Terlalu banyak percobaan login. Silakan coba beberapa saat lagi.',
  },
});

import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { validate } from '../middlewares/validate';
import { authenticate } from '../middlewares/auth';
import { loginRateLimiter, refreshRateLimiter } from '../middlewares/rateLimit';
import { requireTrustedOrigin } from '../middlewares/origin';
import { loginSchema, changePasswordSchema } from '../validators/auth.validator';

/**
 * Router autentikasi — dipasang pada prefix /api/auth
 */
const router = Router();

router.post('/login', loginRateLimiter, validate({ body: loginSchema }), authController.login);
router.post('/refresh', refreshRateLimiter, requireTrustedOrigin, authController.refresh);
router.post('/logout', authenticate, requireTrustedOrigin, authController.logout);
router.get('/me', authenticate, authController.me);
router.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  authController.changePassword
);

export default router;

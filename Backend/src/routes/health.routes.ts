import { Router } from 'express';

const router = Router();

/**
 * GET /api/health — health check untuk monitoring/reverse proxy.
 */
router.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'OK',
    data: {
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;

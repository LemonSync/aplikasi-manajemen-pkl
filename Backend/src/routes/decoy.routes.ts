import { Router } from 'express';
import { randomUUID } from 'crypto';
import { AUDIT_ACTIONS, ENTITY_TYPES, HTTP_STATUS, MESSAGES } from '../config/constants';
import { auditService } from '../services/audit.service';
import { getRequestContext } from '../utils/request';
import { logger } from '../config/logger';

/**
 * Route umpan (honeypot) untuk jalur internal yang tidak pernah dipakai klien.
 * Tidak ada UI/fitur yang memanggil ini — setiap akses dicatat sebagai
 * SECURITY_ALERT lalu dibalas 404 generik. Terdaftar lebih dulu dari router
 * asli agar aktivitas "probe" ke jalur sensitif terekam rapi.
 */
const router = Router();

router.use((req, res) => {
  const ctx = getRequestContext(req);
  const requestId =
    (req as typeof req & { requestId?: string }).requestId ?? req.headers['x-request-id'] ?? randomUUID();

  logger.warn('SECURITY_ALERT: probe jalur umpan', {
    method: req.method,
    path: req.originalUrl,
    ip: ctx.ipAddress,
    requestId,
  });

  void auditService.record({
    action: AUDIT_ACTIONS.SECURITY_ALERT,
    entityType: ENTITY_TYPES.SECURITY,
    entityId: requestId.toString(),
    metadata: {
      reason: 'HONEYPOT_PATH',
      method: req.method,
      path: req.originalUrl,
      query: JSON.stringify(req.query),
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    message: MESSAGES.NOT_FOUND,
    data: null,
  });
});

export default router;
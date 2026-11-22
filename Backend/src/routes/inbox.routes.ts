import { Router } from 'express';
import { inboxController } from '../controllers/inbox.controller';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { Role } from '@prisma/client';
import { listInboxQuerySchema } from '../validators/inbox.validator';

/**
 * Router inbox verifikasi admin — prefix /api/admin/inbox
 */
const router = Router();

router.use(authenticate);
router.use(authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN));

router.get('/', validate({ query: listInboxQuerySchema }), inboxController.list);

export default router;

import { Router } from 'express';
import { Role } from '@prisma/client';
import { auditLogController } from '../controllers/auditLog.controller';
import { authenticate, authorizeRoles } from '../middlewares/auth';

const router = Router();
router.use(authenticate);

router.get('/', authorizeRoles(Role.SUPER_ADMIN), auditLogController.list);

export default router;

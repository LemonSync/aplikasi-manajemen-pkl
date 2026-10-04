import { Router } from 'express';
import { Role } from '@prisma/client';
import { exportController } from '../controllers/export.controller';
import { authenticate, authorizeRoles } from '../middlewares/auth';

const router = Router();
router.use(authenticate);

router.get('/grades', authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), exportController.grades);
router.get('/attendances', authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), exportController.attendances);

export default router;

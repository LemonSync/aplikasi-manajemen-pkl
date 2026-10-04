import { Router } from 'express';
import { Role } from '@prisma/client';
import { studentWorkflowController } from '../controllers/studentWorkflow.controller';
import { authenticate, authorizeRoles } from '../middlewares/auth';

/**
 * Router status workflow siswa/ketua — prefix /api/student
 */
const router = Router();

router.use(authenticate);
router.use(authorizeRoles(Role.SISWA, Role.KETUA));

router.get('/workflow', studentWorkflowController.getWorkflowStatus);

export default router;

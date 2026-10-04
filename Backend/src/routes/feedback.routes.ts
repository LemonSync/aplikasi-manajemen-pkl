import { Router } from 'express';
import { Role } from '@prisma/client';
import { feedbackController } from '../controllers/feedback.controller';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { createFeedbackSchema, listFeedbackQuerySchema } from '../validators/phase4.validator';

/**
 * Router feedback DUDI — prefix /api/feedbacks
 */
const router = Router();

router.use(authenticate);

// DUDI: input feedback
router.post(
  '/',
  authorizeRoles(Role.DUDI, Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: createFeedbackSchema }),
  feedbackController.create
);

// Lihat feedback per siswa
router.get(
  '/student/:studentId',
  authorizeRoles(Role.DUDI, Role.ADMIN, Role.SUPER_ADMIN, Role.GURU_PEMBIMBING),
  feedbackController.listByStudent
);

// Admin: daftar semua feedback
router.get(
  '/',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  validate({ query: listFeedbackQuerySchema }),
  feedbackController.list
);

export default router;

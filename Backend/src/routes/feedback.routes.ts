import { Router } from 'express';
import { Role } from '@prisma/client';
import { feedbackController } from '../controllers/feedback.controller';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { createFeedbackSchema, listFeedbackQuerySchema } from '../validators/phase4.validator';

/**
 * Router feedback untuk siswa — prefix /api/feedbacks
 */
const router = Router();

router.use(authenticate);

// Admin/guru pembimbing: input feedback
// (guru hanya untuk siswa bimbingannya — dicek di service)
router.post(
  '/',
  authorizeRoles(Role.GURU_PEMBIMBING, Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: createFeedbackSchema }),
  feedbackController.create
);

// Lihat feedback per siswa (siswa: miliknya sendiri; guru: bimbingannya; admin: bebas)
router.get(
  '/student/:studentId',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.GURU_PEMBIMBING, Role.SISWA),
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

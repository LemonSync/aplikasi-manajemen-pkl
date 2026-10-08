import { Router } from 'express';
import { Role } from '@prisma/client';
import { visitController } from '../controllers/visit.controller';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { upload } from '../middlewares/upload';
import {
  createVisitSchema,
  markVisitSchema,
  listVisitQuerySchema,
  postponeVisitSchema,
  resumeVisitSchema,
  cancelVisitSchema,
} from '../validators/phase3.validator';

/**
 * Router kunjungan/monitoring guru — prefix /api/visits
 */
const router = Router();

router.use(authenticate);

const staffRoles = [Role.ADMIN, Role.SUPER_ADMIN, Role.GURU_PEMBIMBING, Role.KEPALA_SEKOLAH] as const;

router.post(
  '/',
  authorizeRoles(Role.GURU_PEMBIMBING, Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: createVisitSchema }),
  visitController.create
);
router.get('/me', authorizeRoles(Role.GURU_PEMBIMBING), visitController.myVisits);
router.get(
  '/',
  authorizeRoles(...staffRoles),
  validate({ query: listVisitQuerySchema }),
  visitController.list
);
router.post(
  '/:id/complete',
  authorizeRoles(Role.GURU_PEMBIMBING, Role.ADMIN, Role.SUPER_ADMIN),
  upload.single('photo'),
  validate({ body: markVisitSchema }),
  visitController.complete
);
router.post(
  '/:id/postpone',
  authorizeRoles(Role.GURU_PEMBIMBING, Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: postponeVisitSchema }),
  visitController.postpone
);
router.post(
  '/:id/resume',
  authorizeRoles(Role.GURU_PEMBIMBING, Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: resumeVisitSchema }),
  visitController.resume
);
router.post(
  '/:id/cancel',
  authorizeRoles(Role.GURU_PEMBIMBING, Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: cancelVisitSchema }),
  visitController.cancel
);
// Bukti foto: guru/admin + siswa anggota kelompok yang dimonitor
router.get(
  '/:id/photo',
  authorizeRoles(...staffRoles, Role.SISWA),
  visitController.photo
);

export default router;
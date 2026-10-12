import { Router } from 'express';
import { Role } from '@prisma/client';
import { supervisionController } from '../controllers/supervision.controller';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { assignSupervisionSchema, listSupervisionQuerySchema } from '../validators/supervision.validator';

/**
 * Router pembimbingan per siswa — prefix /api/supervisions
 */
const router = Router();

router.use(authenticate);

// Admin/guru/kepsek: daftar siswa + pembimbing (guru dipaksa miliknya sendiri)
router.get(
  '/',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.KEPALA_SEKOLAH, Role.GURU_PEMBIMBING),
  validate({ query: listSupervisionQuerySchema }),
  supervisionController.list
);

// Admin: tugaskan guru pembimbing (batch)
router.post(
  '/assign',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: assignSupervisionSchema }),
  supervisionController.assign
);

// Pembimbing seorang siswa (dipakai halaman siswa)
router.get('/student/:studentId', supervisionController.forStudent);

// Admin: lepas pembimbingan
router.delete(
  '/:studentId',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  supervisionController.unassign
);

export default router;

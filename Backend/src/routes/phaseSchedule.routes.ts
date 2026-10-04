import { Router } from 'express';
import { Role } from '@prisma/client';
import { phaseScheduleController } from '../controllers/phaseSchedule.controller';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { replacePhaseScheduleSchema } from '../validators/phaseSchedule.validator';

/**
 * Router jadwal fase per gelombang — prefix /api/cohorts/:cohortId/phase-schedule
 *
 * Membaca jadwal: semua role terautentikasi.
 * Mengatur tanggal masa fase: HANYA SUPER_ADMIN & KEPALA_SEKOLAH.
 */
const router = Router({ mergeParams: true });

router.use(authenticate);

router.get('/', phaseScheduleController.list);
router.get('/overview', phaseScheduleController.overview);
router.put(
  '/',
  authorizeRoles(Role.SUPER_ADMIN, Role.KEPALA_SEKOLAH),
  validate({ body: replacePhaseScheduleSchema }),
  phaseScheduleController.replace
);

export default router;
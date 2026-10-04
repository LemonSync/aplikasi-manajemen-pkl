import { Router } from 'express';
import { Role, StudentPhase } from '@prisma/client';
import { attendanceController } from '../controllers/attendance.controller';
import { authenticate, authorizeRoles, requirePhase } from '../middlewares/auth';
import { requireCohortActive } from '../middlewares/cohort';
import { validate } from '../middlewares/validate';
import {
  checkInSchema,
  checkOutSchema,
  listAttendanceQuerySchema,
  listByClassQuerySchema,
  summaryQuerySchema,
  submitAttendanceSchema,
  verifyAttendanceSchema,
  listDudiAttendanceQuerySchema,
} from '../validators/phase3.validator';

/**
 * Router absensi harian — prefix /api/attendances
 */
const router = Router();

router.use(authenticate);

// --- Siswa (Fase 3) ---
router.post(
  '/check-in',
  authorizeRoles(Role.SISWA),
  requirePhase(StudentPhase.PKL_AKTIF),
  requireCohortActive,
  validate({ body: checkInSchema }),
  attendanceController.checkIn
);
router.post(
  '/check-out',
  authorizeRoles(Role.SISWA),
  requirePhase(StudentPhase.PKL_AKTIF),
  requireCohortActive,
  validate({ body: checkOutSchema }),
  attendanceController.checkOut
);
router.post(
  '/submit',
  authorizeRoles(Role.SISWA),
  requirePhase(StudentPhase.PKL_AKTIF),
  requireCohortActive,
  validate({ body: submitAttendanceSchema }),
  attendanceController.submit
);
router.get('/today', authorizeRoles(Role.SISWA), attendanceController.today);
router.get('/me', authorizeRoles(Role.SISWA), attendanceController.myHistory);

// --- Admin / Guru / Kepsek ---
const staffRoles = [Role.ADMIN, Role.SUPER_ADMIN, Role.GURU_PEMBIMBING, Role.KEPALA_SEKOLAH] as const;
router.get(
  '/',
  authorizeRoles(...staffRoles),
  validate({ query: listAttendanceQuerySchema }),
  attendanceController.list
);
router.get(
  '/dudi',
  authorizeRoles(Role.DUDI),
  validate({ query: listDudiAttendanceQuerySchema }),
  attendanceController.listForDudi
);
router.post(
  '/:id/verify',
  authorizeRoles(Role.DUDI),
  validate({ body: verifyAttendanceSchema }),
  attendanceController.verify
);
router.get(
  '/summary',
  authorizeRoles(...staffRoles),
  validate({ query: summaryQuerySchema }),
  attendanceController.summary
);
router.get(
  '/by-class',
  authorizeRoles(...staffRoles),
  validate({ query: listByClassQuerySchema }),
  attendanceController.listByClass
);

export default router;
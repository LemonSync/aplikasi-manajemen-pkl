import { Router } from 'express';
import { Role, StudentPhase } from '@prisma/client';
import { complaintController } from '../controllers/complaint.controller';
import { authenticate, authorizeRoles, requirePhase } from '../middlewares/auth';
import { requireCohortActive } from '../middlewares/cohort';
import { validate } from '../middlewares/validate';
import {
  createComplaintSchema,
  replyComplaintSchema,
  listComplaintQuerySchema,
} from '../validators/phase3.validator';

/**
 * Router pengaduan — prefix /api/complaints
 */
const router = Router();

router.use(authenticate);

// --- Siswa (Fase 3) ---
router.post(
  '/',
  authorizeRoles(Role.SISWA),
  requirePhase(StudentPhase.PKL_AKTIF),
  requireCohortActive,
  validate({ body: createComplaintSchema }),
  complaintController.create
);
router.get('/me', authorizeRoles(Role.SISWA), complaintController.myComplaints);

// --- Guru / Admin / Kepsek ---
const staffRoles = [Role.ADMIN, Role.SUPER_ADMIN, Role.GURU_PEMBIMBING, Role.KEPALA_SEKOLAH] as const;
router.get(
  '/',
  authorizeRoles(...staffRoles),
  validate({ query: listComplaintQuerySchema }),
  complaintController.list
);
router.post(
  '/:id/replies',
  authorizeRoles(...staffRoles, Role.SISWA),
  requirePhase(StudentPhase.PKL_AKTIF),
  validate({ body: replyComplaintSchema }),
  complaintController.reply
);
router.post('/:id/close', complaintController.close);

// Detail (akses dikontrol di service) — letakkan terakhir
router.get('/:id', complaintController.detail);

export default router;

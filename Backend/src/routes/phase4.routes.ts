import { Router } from 'express';
import { Role } from '@prisma/client';
import { phase4Controller } from '../controllers/phase4.controller';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  generateWithdrawalLetterSchema,
  completePhaseSchema,
  generatePengantarLetterSchema,
  generatePenugasanLetterSchema,
} from '../validators/phase4.validator';

/**
 * Router Fase 4 — prefix /api/phase4
 */
const router = Router();

router.use(authenticate);

// Admin: daftar surat hasil generate + unduh PDF-nya
// Siswa: hanya surat milik kelompoknya (scope dicek di controller)
router.get('/letters', authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.SISWA), phase4Controller.listLetters);
router.get(
  '/letters/:id/download',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.SISWA),
  phase4Controller.downloadLetter
);

// Admin: generate surat pengantar PKL ke perusahaan
router.post(
  '/introduction-letter',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: generatePengantarLetterSchema }),
  phase4Controller.generateIntroductionLetter
);

// Admin: generate surat penugasan pembimbing
router.post(
  '/assignment-letter',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: generatePenugasanLetterSchema }),
  phase4Controller.generateAssignmentLetter
);

// Admin: generate surat penarikan siswa
router.post(
  '/withdrawal-letter',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: generateWithdrawalLetterSchema }),
  phase4Controller.generateWithdrawalLetter
);

// Admin: update fase pkl-aktif → pkl-selesai
router.post(
  '/complete',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: completePhaseSchema }),
  phase4Controller.completePhase
);

export default router;

import { Router } from 'express';
import { registrationController } from '../controllers/registration.controller';
import { validate } from '../middlewares/validate';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { requirePhase } from '../middlewares/auth';
import { requireCohortActive } from '../middlewares/cohort';
import { Role, StudentPhase } from '@prisma/client';
import {
  saveRegistrationSchema,
  reviewRegistrationSchema,
  listRegistrationQuerySchema,
} from '../validators/registration.validator';

/**
 * Router pendaftaran PKL — prefix /api/registrations
 */
const router = Router();

router.use(authenticate);

// --- Siswa/Ketua (Fase 1) ---
router.post(
  '/',
  authorizeRoles(Role.SISWA, Role.KETUA),
  requirePhase(StudentPhase.PRA_PKL),
  requireCohortActive,
  validate({ body: saveRegistrationSchema }),
  registrationController.saveDraft
);
router.get('/me', authorizeRoles(Role.SISWA, Role.KETUA), registrationController.myRegistration);
router.post(
  '/:id/submit',
  authorizeRoles(Role.SISWA, Role.KETUA),
  requirePhase(StudentPhase.PRA_PKL),
  registrationController.submit
);

// --- Admin ---
router.get(
  '/',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.KEPALA_SEKOLAH),
  validate({ query: listRegistrationQuerySchema }),
  registrationController.list
);
router.get(
  '/grouped',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.KEPALA_SEKOLAH),
  registrationController.grouped
);
router.post(
  '/:id/review',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: reviewRegistrationSchema }),
  registrationController.review
);

// Detail (pemilik atau admin) — diletakkan paling akhir agar tidak menutupi '/me'
router.get('/:id', registrationController.detail);

export default router;

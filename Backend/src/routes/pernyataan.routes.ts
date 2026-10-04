import { Router } from 'express';
import { Role } from '@prisma/client';
import { pernyataanController } from '../controllers/pernyataan.controller';
import { authenticate, authorizeRoles, requirePhase } from '../middlewares/auth';
import { requireCohortActive } from '../middlewares/cohort';
import { validate } from '../middlewares/validate';
import { generatePernyataanSchema } from '../validators/pernyataan.validator';
import { StudentPhase } from '@prisma/client';

/**
 * Router Surat Pernyataan PKL — prefix /api/pernyataan
 */
const router = Router();

router.use(authenticate);

// --- Siswa (Fase 2: pendaftaran ulang) ---
router.get('/prefill', authorizeRoles(Role.SISWA), pernyataanController.prefill);
router.post(
  '/generate',
  authorizeRoles(Role.SISWA),
  requirePhase(StudentPhase.NON_PKL),
  requireCohortActive,
  validate({ body: generatePernyataanSchema }),
  pernyataanController.generate
);

export default router;
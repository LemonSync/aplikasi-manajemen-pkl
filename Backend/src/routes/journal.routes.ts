import { Router } from 'express';
import { Role, StudentPhase } from '@prisma/client';
import { journalController } from '../controllers/journal.controller';
import { authenticate, authorizeRoles, requirePhase } from '../middlewares/auth';
import { requireCohortActive } from '../middlewares/cohort';
import { validate } from '../middlewares/validate';
import {
  saveJournalSchema,
  updateJournalSchema,
  supervisorNoteSchema,
  listJournalQuerySchema,
  verifyJournalSchema,
} from '../validators/phase3.validator';

/**
 * Router jurnal kegiatan — prefix /api/journals (per siswa, tanpa kelompok PKL)
 */
const router = Router();

router.use(authenticate);

// --- Siswa (Fase 3) ---
router.post(
  '/',
  authorizeRoles(Role.SISWA),
  requirePhase(StudentPhase.PKL_AKTIF),
  requireCohortActive,
  validate({ body: saveJournalSchema }),
  journalController.create
);
router.get('/me', authorizeRoles(Role.SISWA), journalController.myJournals);
router.patch(
  '/:id',
  authorizeRoles(Role.SISWA),
  requirePhase(StudentPhase.PKL_AKTIF),
  validate({ body: updateJournalSchema }),
  journalController.update
);

// --- Guru pembimbing / admin: catatan & pengesahan jurnal siswa bimbingan ---
router.post(
  '/:id/supervisor-note',
  authorizeRoles(Role.GURU_PEMBIMBING, Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: supervisorNoteSchema }),
  journalController.supervisorNote
);
router.post(
  '/:id/verify',
  authorizeRoles(Role.GURU_PEMBIMBING, Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: verifyJournalSchema }),
  journalController.verify
);

// --- Admin / Guru / Kepsek ---
const staffRoles = [Role.ADMIN, Role.SUPER_ADMIN, Role.GURU_PEMBIMBING, Role.KEPALA_SEKOLAH] as const;
router.get(
  '/',
  authorizeRoles(...staffRoles),
  validate({ query: listJournalQuerySchema }),
  journalController.list
);

export default router;

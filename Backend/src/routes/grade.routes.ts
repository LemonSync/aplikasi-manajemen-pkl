import { Router } from 'express';
import { Role } from '@prisma/client';
import { gradeController } from '../controllers/grade.controller';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  createGradeSchema,
  approveGradeSchema,
  listGradeQuerySchema,
  recapByClassQuerySchema,
} from '../validators/phase4.validator';

/**
 * Router penilaian PKL — prefix /api/grades
 */
const router = Router();

router.use(authenticate);

// Definisi butir penilaian (sumber tunggal: konfigurasi sekolah)
router.get('/form', gradeController.form);

// Siswa (fase Pasca PKL) / Admin: input nilai akhir
router.post(
  '/',
  authorizeRoles(Role.SISWA, Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: createGradeSchema }),
  gradeController.inputGrade
);

// Admin: setujui/tolak nilai siswa
router.post(
  '/:id/approve',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: approveGradeSchema }),
  gradeController.approve
);

// Siswa: rekap nilai sendiri
router.get('/me', authorizeRoles(Role.SISWA), gradeController.myGrades);

// Admin: daftar nilai
router.get(
  '/',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.KEPALA_SEKOLAH),
  validate({ query: listGradeQuerySchema }),
  gradeController.list
);

// Admin: rekap semua nilai
router.get(
  '/recap',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.KEPALA_SEKOLAH),
  gradeController.recap
);

// Admin: rekap per kelas → siswa
router.get(
  '/recap-by-class',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.KEPALA_SEKOLAH),
  validate({ query: recapByClassQuerySchema }),
  gradeController.recapByClass
);

// Admin: unduh rekap per kelas sebagai .xlsx (satu worksheet per kelas)
router.get(
  '/recap-by-class/export',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.KEPALA_SEKOLAH),
  validate({ query: recapByClassQuerySchema }),
  gradeController.exportRecapByClass
);

export default router;

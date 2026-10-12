import { Router } from 'express';
import { Role } from '@prisma/client';
import { phase4Controller } from '../controllers/phase4.controller';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { generateBulkLetterSchema, completePhaseSchema } from '../validators/phase4.validator';

/**
 * Router Fase 4 — prefix /api/phase4
 */
const router = Router();

router.use(authenticate);

// Laporan Hasil PKL per siswa (generate-once setelah masa PKL selesai;
// bagian nilai dikosongkan bila belum ada nilai).
// Siswa = laporannya sendiri; guru = siswa bimbingannya; admin/kepsek = semua
router.get(
  '/final-report',
  authorizeRoles(
    Role.SISWA,
    Role.GURU_PEMBIMBING,
    Role.ADMIN,
    Role.SUPER_ADMIN,
    Role.KEPALA_SEKOLAH
  ),
  phase4Controller.downloadFinalReport
);

// Admin/Guru: daftar surat hasil generate + unduh PDF-nya
// (scope: staff = semua, guru = terbitan/atasmnya, siswa = memuat dirinya)
router.get(
  '/letters',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.KEPALA_SEKOLAH, Role.GURU_PEMBIMBING, Role.SISWA),
  phase4Controller.listLetters
);
router.get(
  '/letters/:id/download',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.KEPALA_SEKOLAH, Role.GURU_PEMBIMBING, Role.SISWA),
  phase4Controller.downloadLetter
);

// Guru/Admin: generate surat bulk (pengantar / monitoring / penjemputan)
// sekali terbit berisi daftar seluruh siswa bimbingan + perusahaan
router.post(
  '/bulk-letter',
  authorizeRoles(Role.GURU_PEMBIMBING, Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: generateBulkLetterSchema }),
  phase4Controller.generateBulkLetter
);

// Admin: update fase pkl-aktif → pkl-selesai
router.post(
  '/complete',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: completePhaseSchema }),
  phase4Controller.completePhase
);

export default router;

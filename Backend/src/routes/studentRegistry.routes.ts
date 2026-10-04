import { Router } from 'express';
import { Role } from '@prisma/client';
import { studentRegistryController } from '../controllers/studentRegistry.controller';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { singleFile } from '../middlewares/upload';

/**
 * Router Master Siswa — prefix /api/student-registry
 */
const router = Router();

router.use(authenticate);

// Admin: baca header file Excel (untuk modal pemetaan kolom sebelum import)
router.post(
  '/inspect',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  singleFile('file'),
  studentRegistryController.inspectExcel
);

// Admin: import Excel
router.post(
  '/import',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  singleFile('file'),
  studentRegistryController.importExcel
);

// Admin: tambah siswa manual (dengan cek duplikat NISN)
router.post(
  '/',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  studentRegistryController.create
);

// Admin: daftar master siswa
router.get(
  '/',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  studentRegistryController.list
);

// Admin: hapus data siswa (soft delete, bisa dikembalikan via import ulang)
router.delete(
  '/:id',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  studentRegistryController.remove
);

// Semua: lookup NISN
router.get('/lookup/:nisn', studentRegistryController.lookup);

export default router;

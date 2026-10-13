import { Router } from 'express';
import { Role } from '@prisma/client';
import { teacherRegistryController } from '../controllers/teacherRegistry.controller';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { singleExcelFile } from '../middlewares/upload';

/**
 * Router Master Guru — prefix /api/teacher-registry
 * Akun login (username = NIP) dibuat otomatis saat tambah manual / import.
 */
const router = Router();

router.use(authenticate);

// Admin: baca header file Excel (untuk modal pemetaan kolom sebelum import)
router.post(
  '/inspect',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  singleExcelFile('file'),
  teacherRegistryController.inspectExcel
);

// Admin: import Excel (+ buat akun otomatis)
router.post(
  '/import',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  singleExcelFile('file'),
  teacherRegistryController.importExcel
);

// Admin: tambah guru manual (dengan cek duplikat NIP, akun dibuat otomatis)
router.post(
  '/',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  teacherRegistryController.create
);

// Admin: daftar master guru
router.get(
  '/',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  teacherRegistryController.list
);

// Admin: hapus data guru (soft delete master + hapus permanen akun & data terkait)
router.delete(
  '/:id',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  teacherRegistryController.remove
);

// Semua: lookup NIP
router.get('/lookup/:nip', teacherRegistryController.lookup);

export default router;

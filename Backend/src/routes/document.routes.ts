import { Router } from 'express';
import { documentController } from '../controllers/document.controller';
import { validate } from '../middlewares/validate';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { singleFile } from '../middlewares/upload';
import { Role } from '@prisma/client';
import {
  uploadDocumentSchema,
  verifyDocumentSchema,
  listDocumentQuerySchema,
} from '../validators/registration.validator';

/**
 * Router dokumen — prefix /api/documents
 */
const router = Router();

router.use(authenticate);

// --- Siswa/Ketua: upload & lihat dokumen sendiri ---
router.post(
  '/',
  authorizeRoles(Role.SISWA, Role.KETUA),
  singleFile('file'),
  validate({ body: uploadDocumentSchema }),
  documentController.upload
);
router.get('/me', documentController.myDocuments);
router.get('/type/:type/download', authorizeRoles(Role.SISWA, Role.KETUA), documentController.downloadByType);

// --- Admin/Guru: daftar & verifikasi ---
router.get(
  '/',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.KEPALA_SEKOLAH, Role.GURU_PEMBIMBING),
  validate({ query: listDocumentQuerySchema }),
  documentController.list
);
router.post(
  '/:id/verify',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.GURU_PEMBIMBING),
  validate({ body: verifyDocumentSchema }),
  documentController.verify
);

router.get('/:id', documentController.detail);
router.get('/:id/download', documentController.download);

export default router;

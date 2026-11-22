import { Router } from 'express';
import { Role, StudentPhase } from '@prisma/client';
import { certificateController } from '../controllers/certificate.controller';
import { authenticate, authorizeRoles, requirePhase } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { singleFile } from '../middlewares/upload';
import {
  listCertificateQuerySchema,
  setCertificateNumberSchema,
  setCertificateSignatorySchema,
} from '../validators/phase4.validator';

/**
 * Router sertifikat PKL — prefix /api/sertifikat.
 * Jalur siswa dikunci ke fase Pasca PKL (PKL_SELESAI).
 */
const router = Router();

router.use(authenticate);

const fase4 = requirePhase(StudentPhase.PKL_SELESAI);

router.get('/saya', authorizeRoles(Role.SISWA), fase4, certificateController.status);
router.post('/saya/logo', authorizeRoles(Role.SISWA), fase4, singleFile('file'), certificateController.uploadLogo);
router.put(
  '/saya/penandatangan',
  authorizeRoles(Role.SISWA),
  fase4,
  validate({ body: setCertificateSignatorySchema }),
  certificateController.setSignatory
);
router.get('/saya/pdf', authorizeRoles(Role.SISWA), fase4, certificateController.downloadMine);

router.get(
  '/',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.KEPALA_SEKOLAH, Role.GURU_PEMBIMBING),
  validate({ query: listCertificateQuerySchema }),
  certificateController.list
);

router.get(
  '/siswa/:studentId/pdf',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.KEPALA_SEKOLAH, Role.GURU_PEMBIMBING),
  certificateController.downloadForStudent
);

router.patch(
  '/:id/nomor',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: setCertificateNumberSchema }),
  certificateController.setNumber
);

export default router;

import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { companyRequestController } from '../controllers/companyRequest.controller';
import {
  createCompanyRequestSchema,
  reviewCompanyRequestSchema,
  listCompanyRequestQuerySchema,
} from '../validators/companyRequest.validator';

/**
 * Router usulan tempat PKL — prefix /api/company-requests
 */
const router = Router();
router.use(authenticate);

// Siswa: kirim usulan + lihat riwayat miliknya
router.post(
  '/',
  authorizeRoles(Role.SISWA),
  validate({ body: createCompanyRequestSchema }),
  companyRequestController.create
);
router.get('/mine', authorizeRoles(Role.SISWA), companyRequestController.mine);

// Admin: daftar semua usulan + review (ACC/Tolak)
router.get(
  '/',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  validate({ query: listCompanyRequestQuerySchema }),
  companyRequestController.list
);
router.post(
  '/:id/review',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: reviewCompanyRequestSchema }),
  companyRequestController.review
);

export default router;

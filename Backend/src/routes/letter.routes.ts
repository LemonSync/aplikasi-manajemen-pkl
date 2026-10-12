import { Router } from 'express';
import { Role } from '@prisma/client';
import { letterGeneratorController } from '../controllers/letterGenerator.controller';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  generatePermohonanSchema,
  generatePenugasanSchema,
} from '../validators/letterGenerator.validator';

/**
 * Router generator surat manual admin — prefix /api/letters
 * (daftar/unduh surat terbit tetap di /api/phase4/letters).
 */
const router = Router();

router.use(authenticate, authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN));

router.post(
  '/permohonan',
  validate({ body: generatePermohonanSchema }),
  letterGeneratorController.generatePermohonan
);

router.post(
  '/penugasan',
  validate({ body: generatePenugasanSchema }),
  letterGeneratorController.generatePenugasan
);

export default router;

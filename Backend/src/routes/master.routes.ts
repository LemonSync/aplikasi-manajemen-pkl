import { Router } from 'express';
import { masterDataController, companyController } from '../controllers/master.controller';
import { validate } from '../middlewares/validate';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { Role } from '@prisma/client';
import {
  createCompanySchema,
  updateCompanySchema,
  listCompanyQuerySchema,
} from '../validators/master.validator';

/**
 * Router data master — prefix /api/master
 */
const router = Router();
router.use(authenticate);

router.get('/lookups', masterDataController.lookups);
router.get('/majors', masterDataController.majors);
router.get('/industries', masterDataController.industries);
router.get('/cohorts', masterDataController.cohorts);
router.get('/class-options', masterDataController.classOptions);

export default router;

/**
 * Router perusahaan (DUDI) — prefix /api/companies
 */
export const companyRouter = Router();
companyRouter.use(authenticate);

companyRouter.get(
  '/',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.KEPALA_SEKOLAH, Role.GURU_PEMBIMBING),
  validate({ query: listCompanyQuerySchema }),
  companyController.list
);
companyRouter.post(
  '/',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: createCompanySchema }),
  companyController.create
);
companyRouter.patch(
  '/:id',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: updateCompanySchema }),
  companyController.update
);
companyRouter.get('/:id', companyController.detail);

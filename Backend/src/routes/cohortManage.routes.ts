import { Router } from 'express';
import { Role } from '@prisma/client';
import { cohortManageController } from '../controllers/cohortManage.controller';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { createCohortSchema, updateCohortSchema, listCohortQuerySchema } from '../validators/cohort.validator';

const router = Router();
router.use(authenticate);

router.post('/', authorizeRoles(Role.SUPER_ADMIN, Role.KEPALA_SEKOLAH), validate({ body: createCohortSchema }), cohortManageController.create);
router.patch('/:id', authorizeRoles(Role.SUPER_ADMIN, Role.KEPALA_SEKOLAH), validate({ body: updateCohortSchema }), cohortManageController.update);
router.get('/', validate({ query: listCohortQuerySchema }), cohortManageController.list);
router.get('/:id', cohortManageController.getById);

export default router;

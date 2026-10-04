import { Router } from 'express';
import { Role } from '@prisma/client';
import { jobVacancyController } from '../controllers/jobVacancy.controller';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { createJobVacancySchema, updateJobVacancySchema, listJobVacancyQuerySchema } from '../validators/jobVacancy.validator';

const router = Router();
router.use(authenticate);

router.post('/', authorizeRoles(Role.DUDI, Role.ADMIN), validate({ body: createJobVacancySchema }), jobVacancyController.create);
router.patch('/:id', authorizeRoles(Role.DUDI, Role.ADMIN), validate({ body: updateJobVacancySchema }), jobVacancyController.update);
router.get('/', validate({ query: listJobVacancyQuerySchema }), jobVacancyController.list);
router.get('/:id', jobVacancyController.getById);

export default router;

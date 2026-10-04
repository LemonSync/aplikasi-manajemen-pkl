import { Router } from 'express';
import { Role } from '@prisma/client';
import { visitController } from '../controllers/visit.controller';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { createVisitSchema, markVisitSchema, listVisitQuerySchema } from '../validators/phase3.validator';

/**
 * Router kunjungan/monitoring guru — prefix /api/visits
 */
const router = Router();

router.use(authenticate);

const staffRoles = [Role.ADMIN, Role.SUPER_ADMIN, Role.GURU_PEMBIMBING, Role.KEPALA_SEKOLAH] as const;

router.post(
  '/',
  authorizeRoles(Role.GURU_PEMBIMBING, Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: createVisitSchema }),
  visitController.create
);
router.get('/me', authorizeRoles(Role.GURU_PEMBIMBING), visitController.myVisits);
router.get(
  '/',
  authorizeRoles(...staffRoles),
  validate({ query: listVisitQuerySchema }),
  visitController.list
);
router.post(
  '/:id/complete',
  authorizeRoles(Role.GURU_PEMBIMBING, Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: markVisitSchema }),
  visitController.complete
);

export default router;
import { Router } from 'express';
import { Role } from '@prisma/client';
import { profileController } from '../controllers/profile.controller';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { parentDataSchema } from '../validators/profile.validator';

/**
 * Router profil — prefix /api/profile
 */
const router = Router();

router.use(authenticate);

router.get('/parent', authorizeRoles(Role.SISWA), profileController.getParentData);
router.put(
  '/parent',
  authorizeRoles(Role.SISWA),
  validate({ body: parentDataSchema }),
  profileController.upsertParentData
);

export default router;

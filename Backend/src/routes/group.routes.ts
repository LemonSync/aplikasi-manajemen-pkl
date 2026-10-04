import { Router } from 'express';
import { groupController } from '../controllers/group.controller';
import { validate } from '../middlewares/validate';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { requireCohortActive } from '../middlewares/cohort';
import { Role } from '@prisma/client';
import { createGroupSchema, updateGroupSchema, listGroupQuerySchema, setDudiMentorsSchema, setSupervisorsSchema } from '../validators/group.validator';

/**
 * Router kelompok PKL — prefix /api/groups
 */
const router = Router();

router.use(authenticate);

// --- Guru ---
router.get('/supervised', authorizeRoles(Role.GURU_PEMBIMBING), groupController.supervised);

// --- Siswa ---
router.get('/me', authorizeRoles(Role.SISWA), groupController.myGroups);

// --- Admin / Kepsek / Guru : daftar ---
router.get(
  '/',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN, Role.KEPALA_SEKOLAH, Role.GURU_PEMBIMBING),
  validate({ query: listGroupQuerySchema }),
  groupController.list
);

// --- Admin: pembentukan & perubahan ---
router.post(
  '/',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  requireCohortActive,
  validate({ body: createGroupSchema }),
  groupController.create
);
router.patch(
  '/:id',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  validate({ body: updateGroupSchema }),
  groupController.update
);
router.delete(
  '/:id',
  authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN),
  groupController.delete
);

router.get('/:id/credentials', authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), groupController.credentials);
router.put('/:id/dudi-mentors', authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), validate({ body: setDudiMentorsSchema }), groupController.setDudiMentors);
router.put('/:id/supervisors', authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), validate({ body: setSupervisorsSchema }), groupController.setSupervisors);

router.get('/:id', groupController.detail);

export default router;

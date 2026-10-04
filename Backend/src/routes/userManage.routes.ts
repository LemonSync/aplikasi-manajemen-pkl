import { Router } from 'express';
import { Role } from '@prisma/client';
import { userManageController } from '../controllers/userManage.controller';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { createUserSchema, updateUserSchema, resetPasswordSchema, listUserQuerySchema } from '../validators/user.validator';

const router = Router();
router.use(authenticate);

router.post('/', authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), validate({ body: createUserSchema }), userManageController.create);
router.patch('/:id', authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), validate({ body: updateUserSchema }), userManageController.update);
router.post('/:id/reset-password', authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), validate({ body: resetPasswordSchema }), userManageController.resetPassword);
router.get('/', authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), validate({ query: listUserQuerySchema }), userManageController.list);
router.get('/:id/student-data', authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), userManageController.getStudentData);
router.get('/:id', authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), userManageController.getById);
router.delete('/:id', authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), userManageController.delete);

export default router;

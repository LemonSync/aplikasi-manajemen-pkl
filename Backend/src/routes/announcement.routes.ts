import { Router } from 'express';
import { Role } from '@prisma/client';
import { announcementController } from '../controllers/announcement.controller';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { createAnnouncementSchema, listAnnouncementQuerySchema } from '../validators/announcement.validator';

const router = Router();
router.use(authenticate);

router.post('/', authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN), validate({ body: createAnnouncementSchema }), announcementController.create);
router.get('/', validate({ query: listAnnouncementQuerySchema }), announcementController.list);

export default router;

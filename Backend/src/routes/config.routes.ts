import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { configController } from '../controllers/config.controller';
import { createIndustryConfigSchema, createMajorConfigSchema, signatoryConfigSchema, updateIndustryConfigSchema, updateMajorConfigSchema } from '../validators/config.validator';

const router = Router();
router.use(authenticate, authorizeRoles(Role.SUPER_ADMIN));
router.get('/signatory', configController.signatory);
router.put('/signatory', validate({ body: signatoryConfigSchema }), configController.saveSignatory);
router.put('/signatory/signature', configController.saveSignature);

router.get('/majors', configController.majors);
router.post('/majors', validate({ body: createMajorConfigSchema }), configController.createMajor);
router.patch('/majors/:id', validate({ body: updateMajorConfigSchema }), configController.updateMajor);
router.delete('/majors/:id', configController.deleteMajor);
router.get('/industries', configController.industries);
router.post('/industries', validate({ body: createIndustryConfigSchema }), configController.createIndustry);
router.patch('/industries/:id', validate({ body: updateIndustryConfigSchema }), configController.updateIndustry);
router.delete('/industries/:id', configController.deleteIndustry);

export default router;

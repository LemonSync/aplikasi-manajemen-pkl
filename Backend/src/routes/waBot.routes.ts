import { Router } from 'express';
import { validate } from '../middlewares/validate';
import { waBotController } from '../controllers/waBot.controller';
import {
  createWaGuideSchema,
  listWaMessageQuerySchema,
  updateWaGuideSchema,
  updateWaSettingsSchema,
  waGuideImageSchema,
  waGroupAdminsSchema,
  waGroupAdoptSchema,
  waGroupCreateSchema,
  waPairingSchema,
  waTestReminderSchema,
} from '../validators/wa.validator';

/**
 * Rute konfigurasi bot WhatsApp.
 * Di-mount pada config.routes.ts SETELAH guard SUPER_ADMIN, jadi seluruh
 * endpoint di sini otomatis hanya bisa dipakai super admin.
 */
const router = Router();

router.get('/status', waBotController.status);
router.get('/settings', waBotController.settings);
router.patch('/settings', validate({ body: updateWaSettingsSchema }), waBotController.updateSettings);

router.post('/start', waBotController.start);
router.post('/stop', waBotController.stop);
router.post('/logout', waBotController.logout);
router.get('/qr', waBotController.qr);
router.post('/pairing', validate({ body: waPairingSchema }), waBotController.pairing);

router.get('/groups', waBotController.groups);
router.post('/groups', validate({ body: waGroupCreateSchema }), waBotController.createGroup);
router.post('/groups/sync', waBotController.syncGroups);
router.post('/groups/adopt', validate({ body: waGroupAdoptSchema }), waBotController.adoptGroup);
router.post('/groups/:cohortId/invite', waBotController.refreshInvite);
router.post('/groups/:cohortId/admins', validate({ body: waGroupAdminsSchema }), waBotController.promoteAdmins);

router.post('/test-reminder', validate({ body: waTestReminderSchema }), waBotController.testReminder);
router.post('/reminders/run', waBotController.runReminders);
router.post('/reminders/reset', waBotController.resetReminders);

router.get('/guides', waBotController.guides);
router.post('/guides', validate({ body: createWaGuideSchema }), waBotController.createGuide);
router.patch('/guides/:id', validate({ body: updateWaGuideSchema }), waBotController.updateGuide);
router.delete('/guides/:id', waBotController.deleteGuide);
router.post('/guides/:id/image', validate({ body: waGuideImageSchema }), waBotController.saveGuideImage);
router.delete('/guides/:id/image', waBotController.deleteGuideImage);

router.get('/messages', validate({ query: listWaMessageQuerySchema }), waBotController.messages);

export const waBotRoutes = router;

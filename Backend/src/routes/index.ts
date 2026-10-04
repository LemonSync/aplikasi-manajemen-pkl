import { Router } from 'express';
import authRoutes from './auth.routes';
import healthRoutes from './health.routes';
import registrationRoutes from './registration.routes';
import documentRoutes from './document.routes';
import groupRoutes from './group.routes';
import masterRoutes, { companyRouter } from './master.routes';
import attendanceRoutes from './attendance.routes';
import journalRoutes from './journal.routes';
import complaintRoutes from './complaint.routes';
import visitRoutes from './visit.routes';
import gradeRoutes from './grade.routes';
import feedbackRoutes from './feedback.routes';
import phase4Routes from './phase4.routes';
import profileRoutes from './profile.routes';
import cohortManageRoutes from './cohortManage.routes';
import userManageRoutes from './userManage.routes';
import jobVacancyRoutes from './jobVacancy.routes';
import announcementRoutes from './announcement.routes';
import notificationRoutes from './notification.routes';
import dashboardRoutes from './dashboard.routes';
import auditLogRoutes from './auditLog.routes';
import pernyataanRoutes from './pernyataan.routes';
import phaseScheduleRoutes from './phaseSchedule.routes';
import exportRoutes from './export.routes';
import studentWorkflowRoutes from './studentWorkflow.routes';
import studentRegistryRoutes from './studentRegistry.routes';

/**
 * Router utama API — prefix /api
 */
const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/registrations', registrationRoutes);
router.use('/documents', documentRoutes);
router.use('/groups', groupRoutes);
router.use('/master', masterRoutes);
router.use('/companies', companyRouter);
router.use('/attendances', attendanceRoutes);
router.use('/journals', journalRoutes);
router.use('/complaints', complaintRoutes);
router.use('/visits', visitRoutes);
router.use('/grades', gradeRoutes);
router.use('/feedbacks', feedbackRoutes);
router.use('/phase4', phase4Routes);
router.use('/profile', profileRoutes);
router.use('/cohorts', cohortManageRoutes);
router.use('/users', userManageRoutes);
router.use('/job-vacancies', jobVacancyRoutes);
router.use('/announcements', announcementRoutes);
router.use('/notifications', notificationRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/audit-logs', auditLogRoutes);
router.use('/export', exportRoutes);
router.use('/pernyataan', pernyataanRoutes);
router.use('/cohorts/:cohortId/phase-schedule', phaseScheduleRoutes);
router.use('/student', studentWorkflowRoutes);
router.use('/student-registry', studentRegistryRoutes);
router.use('/student-registry', studentRegistryRoutes);

export default router;

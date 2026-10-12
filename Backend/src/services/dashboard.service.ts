import { prisma } from '../config/prisma';
import { Role } from '@prisma/client';
import { phaseScheduleRepository } from '../repositories/phaseSchedule.repository';

/**
 * Service dashboard — statistik ringkas.
 */
export class DashboardService {
  async getStats(userId: string, role: Role) {
    const stats: Record<string, unknown> = {};

    if (role === Role.ADMIN || role === Role.SUPER_ADMIN) {
      const [
        totalStudents,
        supervisedStudents,
        totalCompanies,
        activeCohorts,
        pendingDocs,
        pendingRegistrations,
      ] = await Promise.all([
        prisma.user.count({ where: { role: Role.SISWA } }),
        prisma.studentSupervisor.count(),
        prisma.company.count({ where: { deletedAt: null } }),
        prisma.cohort.count({ where: { status: 'OPEN' } }),
        prisma.document.count({ where: { status: 'MENUNGGU_VERIFIKASI' } }),
        prisma.registration.count({ where: { status: 'DIAJUKAN' } }),
      ]);

      stats.totalStudents = totalStudents;
      stats.supervisedStudents = supervisedStudents;
      stats.totalCompanies = totalCompanies;
      stats.activeCohorts = activeCohorts;
      stats.pendingDocuments = pendingDocs;
      stats.pendingRegistrations = pendingRegistrations;

      // Fase aktif per gelombang
      const openCohorts = await prisma.cohort.findMany({ where: { status: 'OPEN' } });
      const cohortPhases = await Promise.all(
        openCohorts.map(async (c) => {
          const currentPhase = await phaseScheduleRepository.getCurrentPhase(c.id);
          return { cohortId: c.id, cohortName: c.name, currentPhase };
        })
      );
      stats.cohortPhases = cohortPhases;
    }

    if (role === Role.GURU_PEMBIMBING) {
      const supervisedStudents = await prisma.studentSupervisor.count({
        where: { supervisorId: userId },
      });
      stats.supervisedStudents = supervisedStudents;
    }

    if (role === Role.SISWA) {
      const [attendanceCount, journalCount, complaintCount] = await Promise.all([
        prisma.attendance.count({ where: { userId: userId } }),
        prisma.journal.count({ where: { userId: userId } }),
        prisma.complaint.count({ where: { authorId: userId } }),
      ]);
      stats.attendanceDays = attendanceCount;
      stats.journalCount = journalCount;
      stats.complaintCount = complaintCount;
    }

    return stats;
  }
}

export const dashboardService = new DashboardService();

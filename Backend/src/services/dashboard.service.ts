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
      const [totalStudents, totalGroups, totalCompanies, activeCohorts, pendingDocs, pendingRegistrations] = await Promise.all([
        prisma.user.count({ where: { role: Role.SISWA } }),
        prisma.group.count({ where: { deletedAt: null } }),
        prisma.company.count({ where: { deletedAt: null } }),
        prisma.cohort.count({ where: { status: 'OPEN' } }),
        prisma.document.count({ where: { status: 'MENUNGGU_VERIFIKASI' } }),
        prisma.registration.count({ where: { status: 'DIAJUKAN' } }),
      ]);

      stats.totalStudents = totalStudents;
      stats.totalGroups = totalGroups;
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
      const supervisedGroups = await prisma.groupSupervisor.count({ where: { userId: userId } });
      stats.supervisedGroups = supervisedGroups;
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

    if (role === Role.DUDI) {
      const company = await prisma.companyMentor.findUnique({ where: { userId } });
      if (company) {
        const groupCount = await prisma.group.count({ where: { companyId: company.companyId } });
        stats.companyGroups = groupCount;
      }
    }

    return stats;
  }
}

export const dashboardService = new DashboardService();

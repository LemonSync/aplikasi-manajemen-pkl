import { PhaseSchedule, StudentPhase } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Repository jadwal fase per gelombang.
 */
export class PhaseScheduleRepository {
  async findByCohort(cohortId: string): Promise<PhaseSchedule[]> {
    return prisma.phaseSchedule.findMany({
      where: { cohortId },
      orderBy: { phase: 'asc' },
    });
  }

  async findByCohortAndPhase(cohortId: string, phase: StudentPhase): Promise<PhaseSchedule | null> {
    return prisma.phaseSchedule.findUnique({
      where: { cohortId_phase: { cohortId, phase } },
    });
  }

  async upsert(
    cohortId: string,
    phase: StudentPhase,
    startDate: Date | null,
    endDate: Date | null
  ): Promise<PhaseSchedule> {
    return prisma.phaseSchedule.upsert({
      where: { cohortId_phase: { cohortId, phase } },
      update: { startDate, endDate },
      create: { cohortId, phase, startDate, endDate },
    });
  }

  async deleteByCohort(cohortId: string): Promise<void> {
    await prisma.phaseSchedule.deleteMany({ where: { cohortId } });
  }

  /** Menentukan fase aktif sebuah gelombang pada tanggal hari ini. */
  async getCurrentPhase(cohortId: string): Promise<StudentPhase | null> {
    const schedules = await this.findByCohort(cohortId);
    const now = new Date();
    for (const s of schedules) {
      if (s.startDate && s.endDate && now >= s.startDate && now <= s.endDate) {
        return s.phase;
      }
    }
    return null;
  }
}

export const phaseScheduleRepository = new PhaseScheduleRepository();
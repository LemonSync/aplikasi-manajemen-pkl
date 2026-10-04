import { StudentPhase } from '@prisma/client';
import { phaseScheduleRepository } from '../repositories/phaseSchedule.repository';
import { cohortRepository } from '../repositories/cohort.repository';
import { auditService } from './audit.service';
import { AUDIT_ACTIONS, ENTITY_TYPES } from '../config/constants';
import { BadRequestError, NotFoundError } from '../errors/AppError';

export interface PhaseScheduleInput {
  phase: StudentPhase;
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * Service jadwal fase per gelombang.
 * Hanya SUPER_ADMIN & KEPALA_SEKOLAH yang boleh mengatur (dipisah di route).
 * Digunakan untuk menentukan "fase aktif" sebuah gelombang berdasarkan tanggal.
 */
export class PhaseScheduleService {
  /** Ambil semua jadwal fase untuk sebuah gelombang. */
  async listByCohort(cohortId: string) {
    const cohort = await cohortRepository.findById(cohortId);
    if (!cohort) throw new NotFoundError('Gelombang tidak ditemukan');
    return phaseScheduleRepository.findByCohort(cohortId);
  }

  /** Simpan/ubah banyak jadwal fase sekaligus untuk sebuah gelombang. */
  async replace(
    cohortId: string,
    items: PhaseScheduleInput[],
    actorId: string,
    ctx: { ipAddress?: string; userAgent?: string }
  ) {
    const cohort = await cohortRepository.findById(cohortId);
    if (!cohort) throw new NotFoundError('Gelombang tidak ditemukan');

    // Validasi per fase: tanggal selesai tidak boleh sebelum tanggal mulai.
    // (Antar fase diperbolehkan over-lap; sekolah yang menentukan jadwalnya.)
    const order: StudentPhase[] = [
      StudentPhase.PRA_PKL,
      StudentPhase.NON_PKL,
      StudentPhase.PKL_AKTIF,
      StudentPhase.PKL_SELESAI,
    ];
    const sorted = [...items].sort(
      (a, b) => order.indexOf(a.phase) - order.indexOf(b.phase)
    );
    for (const item of sorted) {
      if (item.startDate && item.endDate) {
        const start = new Date(item.startDate);
        const end = new Date(item.endDate);
        if (end < start) throw new BadRequestError('Tanggal selesai tidak boleh sebelum tanggal mulai');
      }
    }

    const result = [];
    for (const item of sorted) {
      const start = item.startDate ? new Date(item.startDate) : null;
      const end = item.endDate ? new Date(item.endDate) : null;
      result.push(
        await phaseScheduleRepository.upsert(cohortId, item.phase, start, end)
      );
    }

    await auditService.record({
      actorId,
      action: AUDIT_ACTIONS.CREATE_COHORT,
      entityType: ENTITY_TYPES.COHORT,
      entityId: cohortId,
      metadata: { phaseSchedule: sorted.map((s) => ({ phase: s.phase, start: s.startDate, end: s.endDate })) },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return result;
  }

  /**
   * Tentukan fase aktif sebuah gelombang pada tanggal hari ini.
   * Membandingkan tanggal saja (tanpa jam) menggunakan timezone lokal.
   */
  async getCurrentPhase(cohortId: string): Promise<StudentPhase | null> {
    const schedules = await phaseScheduleRepository.findByCohort(cohortId);
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA'); // YYYY-MM-DD dalam timezone lokal
    for (const s of schedules) {
      if (s.startDate && s.endDate) {
        const startStr = new Date(s.startDate).toLocaleDateString('en-CA');
        const endStr = new Date(s.endDate).toLocaleDateString('en-CA');
        if (todayStr >= startStr && todayStr <= endStr) {
          return s.phase;
        }
      }
    }
    return null;
  }

  /** Jadwal fase + fase aktif untuk dashboard/hint. */
  async getOverview(cohortId: string) {
    const schedules = await this.listByCohort(cohortId);
    const currentPhase = await this.getCurrentPhase(cohortId);
    return { schedules, currentPhase };
  }

  /** Helper statis: nama fase untuk tampilan. */
  static phaseLabel(phase: StudentPhase): string {
    const map: Record<StudentPhase, string> = {
      PRA_PKL: 'Pra-Pendaftaran PKL',
      NON_PKL: 'Pendaftaran Ulang PKL',
      PKL_AKTIF: 'Masa PKL',
      PKL_SELESAI: 'Pasca-PKL',
    };
    return map[phase];
  }
}

export const phaseScheduleService = new PhaseScheduleService();
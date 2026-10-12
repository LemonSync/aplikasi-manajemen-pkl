import { DocumentType, DocumentStatus, RegistrationStatus, StudentPhase, Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { phaseScheduleRepository } from '../repositories/phaseSchedule.repository';
import { NotFoundError } from '../errors/AppError';
import { MESSAGES, PHASE_ORDER, ALLOWED_PHASE_TRANSITIONS } from '../config/constants';

export interface WorkflowPhaseInfo {
  phase: StudentPhase;
  startDate: Date | null;
  endDate: Date | null;
}

export interface StudentWorkflowStatus {
  effectivePhase: StudentPhase | null;
  hasCompleted: boolean;
  currentSchedule: WorkflowPhaseInfo | null;
  nextSchedule: WorkflowPhaseInfo | null;
  registrationStatus: string | null;
  registrationDocumentId: string | null;
  /** Gerbang Fase 1 → Fase 2: siswa sudah mengunduh Surat Permohonan? */
  permohonanDownloaded: boolean;
  hasParentData: boolean;
  hasSuratPenerimaan: boolean;
  hasSuratPenerimaanPending: boolean;
  suratPenerimaanStatus: string | null;
  suratPenerimaanNote: string | null;
  hasSuratPernyataan: boolean;
  hasLaporanAkhir: boolean;
}

/**
 * Service yang menentukan fase efektif siswa berdasarkan jadwal fase (PhaseSchedule).
 * Fase efektif ditentukan oleh tanggal hari ini vs tanggal mulai/selesai fase pada gelombang siswa.
 * Bukan berdasarkan field User.phase, melainkan berdasarkan schedule.
 */
export class StudentWorkflowService {
  /**
   * Maju bertahap dari `fromPhase` ke `maxPhase` (fase jadwal hari ini).
   * Setiap langkah hanya dilakukan jika fase yang DITINGGALKAN sudah
   * diselesaikan (syarat dokumen), sehingga siswa tidak bisa meloncat
   * melewati tahap yang belum lengkap hanya karena kalender bergeser.
   * Tidak pernah menurunkan fase.
   */
  private async advancePhase(
    userId: string,
    fromPhase: StudentPhase,
    maxPhase: StudentPhase
  ): Promise<StudentPhase> {
    let phase: StudentPhase = fromPhase;
    while ((PHASE_ORDER[phase] ?? 0) < (PHASE_ORDER[maxPhase] ?? 0)) {
      const completed = await this.checkPhaseCompletion(userId, phase);
      if (!completed) break;
      const next = ALLOWED_PHASE_TRANSITIONS[phase]?.[0] as StudentPhase | undefined;
      if (!next) break;
      phase = next;
    }
    return phase;
  }

  /**
   * Sinkronkan fase database siswa dengan jadwal gelombangnya. Dipanggil oleh
   * phase guard agar aksi tidak bergantung pada nilai phase lama di JWT.
   * Fase hanya maju jika syarat dokumen fase sebelumnya terpenuhi.
   */
  async syncScheduledPhase(userId: string): Promise<StudentPhase | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { cohortId: true, phase: true, role: true },
    });
    if (!user || user.role !== Role.SISWA || !user.cohortId) return user?.phase ?? null;

    const currentSchedule = await this.getCurrentSchedule(user.cohortId);
    if (!currentSchedule) return user.phase;

    const startPhase = user.phase ?? StudentPhase.PRA_PKL;
    const target = await this.advancePhase(userId, startPhase, currentSchedule.phase);
    if (target !== user.phase) {
      await prisma.user.update({ where: { id: userId }, data: { phase: target } });
      return target;
    }
    return user.phase;
  }

  /**
   * Menentukan fase aktif sebuah gelombang pada tanggal hari ini.
   * Membandingkan tanggal saja (tanpa jam) menggunakan timezone lokal (WIB).
   * Ini memastikan "17 September" berarti sepanjang hari 17 Sep di WIB.
   */
  private async getCurrentSchedule(cohortId: string): Promise<WorkflowPhaseInfo | null> {
    const schedules = await phaseScheduleRepository.findByCohort(cohortId);
    // Bandingkan tanggal saja (ignore jam) menggunakan timezone lokal
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA'); // YYYY-MM-DD dalam timezone lokal
    for (const s of schedules) {
      if (s.startDate && s.endDate) {
        const startStr = new Date(s.startDate).toLocaleDateString('en-CA');
        const endStr = new Date(s.endDate).toLocaleDateString('en-CA');
        if (todayStr >= startStr && todayStr <= endStr) {
          return { phase: s.phase, startDate: s.startDate, endDate: s.endDate };
        }
      }
    }
    return null;
  }

  /**
   * Mencari jadwal fase berikutnya (setelah fase aktif saat ini).
   */
  private async getNextSchedule(cohortId: string, currentPhase: StudentPhase): Promise<WorkflowPhaseInfo | null> {
    const schedules = await phaseScheduleRepository.findByCohort(cohortId);
    const order: StudentPhase[] = [
      StudentPhase.PRA_PKL,
      StudentPhase.NON_PKL,
      StudentPhase.PKL_AKTIF,
      StudentPhase.PKL_SELESAI,
    ];
    const currentIdx = order.indexOf(currentPhase);

    for (let i = currentIdx + 1; i < order.length; i++) {
      const phase = order[i];
      const schedule = schedules.find((s) => s.phase === phase);
      if (schedule && schedule.startDate) {
        return { phase, startDate: schedule.startDate, endDate: schedule.endDate };
      }
    }
    return null;
  }

  /**
   * Mengecek apakah siswa sudah menyelesaikan persyaratan fase tertentu.
   */
  private async checkPhaseCompletion(userId: string, phase: StudentPhase): Promise<boolean> {
    switch (phase) {
      case StudentPhase.PRA_PKL: {
        // Selesai bila: pendaftaran SISWA SUDAH DISETUJUI admin DAN Surat
        // Permohonan sudah diunduh (gerbang Fase 1 → Fase 2 — tanpa surat ini
        // siswa tidak bisa memperoleh Surat Penerimaan dari perusahaan).
        // Pendaftaran DIAJUKAN tetap dianggap belum selesai: surat permohonan
        // baru dibuat saat disetujui, jadi pengguna telat menunggu di Fase 1.
        const registration = await prisma.registration.findFirst({
          where: {
            studentId: userId,
            deletedAt: null,
            status: RegistrationStatus.DISETUJUI,
            permohonanDownloadedAt: { not: null },
          },
          select: { id: true },
        });
        return registration !== null;
      }

      case StudentPhase.NON_PKL: {
        // Selesai jika surat pernyataan sudah disetujui admin
        const suratPernyataan = await prisma.document.findFirst({
          where: {
            ownerId: userId,
            type: DocumentType.SURAT_PERNYATAAN,
            status: DocumentStatus.DISETUJUI,
          },
        });
        return suratPernyataan !== null;
      }

      case StudentPhase.PKL_AKTIF: {
        // Masuk Fase 3 setelah Surat Penerimaan dari perusahaan disetujui.
        const penerimaan = await prisma.document.findFirst({
          where: {
            ownerId: userId,
            type: DocumentType.SURAT_PENERIMAAN,
            status: DocumentStatus.DISETUJUI,
          },
        });
        return penerimaan !== null;
      }

      case StudentPhase.PKL_SELESAI: {
        const laporan = await prisma.document.findFirst({
          where: {
            ownerId: userId,
            type: DocumentType.LAPORAN_AKHIR,
            status: { in: [DocumentStatus.DISETUJUI, DocumentStatus.DIUNGGAH, DocumentStatus.MENUNGGU_VERIFIKASI] },
          },
        });
        return laporan !== null;
      }

      default:
        return false;
    }
  }

  /**
   * Mendapatkan status workflow siswa berdasarkan jadwal fase.
   * Ini adalah endpoint utama yang menentukan apa yang harus ditampilkan di UI siswa.
   */
  async getWorkflowStatus(userId: string): Promise<StudentWorkflowStatus> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError(MESSAGES.NOT_FOUND);
    if (!user.cohortId) {
      return {
        effectivePhase: null,
        hasCompleted: false,
        currentSchedule: null,
        nextSchedule: null,
        registrationStatus: null,
        registrationDocumentId: null,
        permohonanDownloaded: false,
        hasParentData: false,
        hasSuratPenerimaan: false,
        hasSuratPenerimaanPending: false,
        suratPenerimaanStatus: null,
        suratPenerimaanNote: null,
        hasSuratPernyataan: false,
        hasLaporanAkhir: false,
      };
    }

    // Pendaftaran milik siswa ini (per-orang).
    const registration = await prisma.registration.findFirst({
      where: { studentId: userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    const currentSchedule = await this.getCurrentSchedule(user.cohortId);
    let effectivePhase = currentSchedule?.phase ?? null;

    // Fase efektif = jadwal hari ini, maju BERTAHAP mengikuti kelengkapan
    // dokumen. Siswa yang syaratnya belum lengkap tetap berada pada fase
    // sebelumnya (bahkan kalender sudah bergeser) sehingga tugas fase
    // sebelumnya masih bisa diselesaikan.
    if (effectivePhase && user.role === Role.SISWA) {
      const startPhase = user.phase ?? StudentPhase.PRA_PKL;
      const target = await this.advancePhase(userId, startPhase, effectivePhase);
      if (target !== user.phase) {
        await prisma.user.update({ where: { id: userId }, data: { phase: target } });
      }
      effectivePhase = target;
    }

    // Cek dokumen surat permohonan (terkait pendaftaran)
    let registrationDocumentId: string | null = null;
    if (registration) {
      const suratPermohonan = await prisma.document.findFirst({
        where: { registrationId: registration.id, type: DocumentType.SURAT_PERMOHONAN },
      });
      registrationDocumentId = suratPermohonan?.id ?? null;
    }

    // Cek data orang tua
    const studentProfile = await prisma.studentProfile.findFirst({
      where: { userId },
      include: { parentData: true },
    });

    // Cek dokumen — surat penerimaan harus DISETUJUI (bukan cuma ada)
    const [suratPenerimaan, suratPenerimaanDoc, suratPernyataan, laporanAkhir] = await Promise.all([
      prisma.document.findFirst({
        where: { ownerId: userId, type: DocumentType.SURAT_PENERIMAAN, status: DocumentStatus.DISETUJUI },
      }),
      prisma.document.findFirst({
        where: { ownerId: userId, type: DocumentType.SURAT_PENERIMAAN, status: { not: DocumentStatus.DISETUJUI } },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.document.findFirst({
        where: {
          ownerId: userId,
          type: DocumentType.SURAT_PERNYATAAN,
          status: { not: DocumentStatus.DITOLAK },
        },
      }),
      prisma.document.findFirst({
        where: {
          ownerId: userId,
          type: DocumentType.LAPORAN_AKHIR,
          status: { not: DocumentStatus.DITOLAK },
        },
      }),
    ]);

    const hasCompleted = effectivePhase
      ? await this.checkPhaseCompletion(userId, effectivePhase)
      : false;

    const nextSchedule = effectivePhase
      ? await this.getNextSchedule(user.cohortId, effectivePhase)
      : null;

    // Dokumen surat penerimaan yang belum disetujui: sedang menunggu verifikasi
    // (terkunci, tidak boleh diganti) atau sudah ditolak (boleh upload ulang).
    const pendingDoc =
      !suratPenerimaan && suratPenerimaanDoc && (suratPenerimaanDoc.status === DocumentStatus.MENUNGGU_VERIFIKASI || suratPenerimaanDoc.status === DocumentStatus.DIUNGGAH)
        ? suratPenerimaanDoc
        : null;

    return {
      effectivePhase,
      hasCompleted,
      currentSchedule,
      nextSchedule,
      registrationStatus: registration?.status ?? null,
      registrationDocumentId,
      permohonanDownloaded: registration?.permohonanDownloadedAt != null,
      hasParentData: studentProfile?.parentData !== null && studentProfile?.parentData !== undefined,
      hasSuratPenerimaan: suratPenerimaan !== null,
      hasSuratPenerimaanPending: pendingDoc !== null,
      suratPenerimaanStatus: suratPenerimaanDoc?.status ?? null,
      suratPenerimaanNote: suratPenerimaanDoc?.note ?? null,
      hasSuratPernyataan: suratPernyataan !== null,
      hasLaporanAkhir: laporanAkhir !== null,
    };
  }
}

export const studentWorkflowService = new StudentWorkflowService();

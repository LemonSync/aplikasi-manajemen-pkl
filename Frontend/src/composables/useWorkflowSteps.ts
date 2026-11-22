import { computed, type ComputedRef, type Ref } from 'vue';
import type { StudentWorkflowStatus } from '@/services/api.service';

export const PHASE_LABELS: Record<string, string> = {
  PRA_PKL: 'Pra-Pendaftaran PKL',
  NON_PKL: 'Pendaftaran Ulang PKL',
  PKL_AKTIF: 'Masa PKL',
  PKL_SELESAI: 'Pasca-PKL',
};

export const PHASE_ORDER: Record<string, number> = { PRA_PKL: 0, NON_PKL: 1, PKL_AKTIF: 2, PKL_SELESAI: 3 };

export const PHASE_BLURB: Record<string, string> = {
  PRA_PKL: 'Pilih perusahaan tujuan dan ajukan pendaftaran. Setelah disetujui, sistem membuat Surat Permohonan PKL.',
  NON_PKL: 'Lengkapi persyaratan pendaftaran ulang PKL.',
  PKL_AKTIF: 'Masa PKL sedang berjalan.',
  PKL_SELESAI: 'PKL telah selesai. Lengkapi tahap akhir: laporan dan input nilai PKL.',
};

/** Satu langkah pada alur PKL per-orang. */
export interface WorkflowStep {
  key: StepKey;
  label: string;
  description: string;
  done: boolean;
  pending?: boolean;
  routeName?: string;
  routeVisible?: boolean;
}

export type StepKey =
  | 'pendaftaran'
  | 'surat-permohonan'
  | 'surat-penerimaan'
  | 'data-ortu'
  | 'surat-pernyataan'
  | 'laporan-akhir';

export const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

/**
 * Aturan tampilan alur PKL: urutan langkah, penanda selesai, dan posisi fase.
 *
 * Dicabut dari `StudentWorkflowView` karena dipakai dua mode sekaligus (panggung
 * kuis & Mode Daftar). Sumbernya tetap satu: status dari `GET /student/workflow`
 * — mode hanya menata ulang, tidak pernah menyimpan progresnya sendiri.
 */
export const useWorkflowSteps = (
  status: Readonly<Ref<StudentWorkflowStatus | null>>
): {
  phaseIndex: ComputedRef<number>;
  phasePercent: ComputedRef<number>;
  isBehindSchedule: ComputedRef<boolean>;
  steps: ComputedRef<WorkflowStep[]>;
  currentStep: ComputedRef<WorkflowStep | null>;
  doneCount: ComputedRef<number>;
  waitingMessage: ComputedRef<{ nextPhase: string; startDate: string } | null>;
} => {
  /** Posisi tahap sekarang (0-based) — dipakai label "Tahap N dari 4" dan bar progres. */
  const phaseIndex = computed(() => PHASE_ORDER[String(status.value?.effectivePhase)] ?? 0);
  const phasePercent = computed(() => Math.round(((phaseIndex.value + 1) / 4) * 100));

  /** Jadwal sudah pindah fase, tapi syarat fase ini belum lengkap → siswa tertinggal. */
  const isBehindSchedule = computed(() => {
    if (!status.value || !status.value.effectivePhase || !status.value.currentSchedule) return false;
    const current = PHASE_ORDER[status.value.effectivePhase];
    const scheduled = PHASE_ORDER[String(status.value.currentSchedule.phase)];
    return current !== undefined && scheduled !== undefined && current < scheduled;
  });

  /**
   * Alur pra-PKL: pendaftaran → unduh Surat Permohonan → Surat Penerimaan →
   * Data Orang Tua → Surat Pernyataan → Laporan Akhir. Fase 3 dan 4 memakai sidebar.
   */
  const steps = computed<WorkflowStep[]>(() => {
    const s = status.value;
    if (!s) return [];
    const phase = s.effectivePhase;
    const list: WorkflowStep[] = [
      {
        key: 'pendaftaran',
        label: 'Pendaftaran PKL',
        description: 'Pilih perusahaan tujuan lalu ajukan pendaftaran.',
        done: s.registrationStatus === 'DISETUJUI',
        pending: s.registrationStatus === 'DIAJUKAN',
      },
      {
        key: 'surat-permohonan',
        label: 'Unduh Surat Permohonan',
        description:
          'Surat Permohonan dibuat setelah pendaftaran disetujui admin. Unduh, cetak, dan serahkan ke perusahaan.',
        done: s.permohonanDownloaded,
      },
      {
        key: 'surat-penerimaan',
        label: 'Surat Penerimaan dari Perusahaan',
        description: 'Unggah surat balasan/penerimaan dari perusahaan, lalu tunggu verifikasi admin.',
        done: s.hasSuratPenerimaan,
        pending: s.hasSuratPenerimaanPending,
      },
      {
        key: 'data-ortu',
        label: 'Data Orang Tua',
        description: 'Lengkapi data ayah/ibu/wali untuk keperluan surat & laporan.',
        done: s.hasParentData,
        routeName: 'parent-data',
        routeVisible: true,
      },
      {
        key: 'surat-pernyataan',
        label: 'Surat Pernyataan',
        description: 'Buat Surat Pernyataan PDF, tanda tangan + materai, lalu unggah kembali untuk diverifikasi.',
        done: s.hasSuratPernyataan,
        routeName: 'surat-pernyataan',
        routeVisible: phase !== 'PRA_PKL',
      },
      {
        key: 'laporan-akhir',
        label: 'Laporan Akhir',
        description: 'Unggah laporan akhir PKL untuk diverifikasi sekolah.',
        done: s.hasLaporanAkhir,
        routeName: 'my-report',
        routeVisible: phase === 'PKL_AKTIF' || phase === 'PKL_SELESAI',
      },
    ];
    return list;
  });

  /**
   * Langkah pertama yang belum selesai DAN bisa dibuka pada fase ini.
   *
   * Langkah fase berikutnya (`routeVisible === false`) sengaja dilewati.
   * Menandainya sebagai "aktif" membuat alur melompat ke Laporan Akhir saat
   * siswa masih menunggu verifikasi Surat Pernyataan di Fase 2 — padahal
   * jalan balik ke surat pernyataan justru hilang dari layar.
   */
  const currentStep = computed(() => steps.value.find((st) => !st.done && st.routeVisible !== false) ?? null);
  const doneCount = computed(() => steps.value.filter((st) => st.done).length);

  const waitingMessage = computed(() => {
    const s = status.value;
    if (!s || !s.hasCompleted || !s.nextSchedule) return null;
    return {
      nextPhase: PHASE_LABELS[s.nextSchedule.phase] ?? s.nextSchedule.phase,
      startDate: formatDate(s.nextSchedule.startDate),
    };
  });

  return { phaseIndex, phasePercent, isBehindSchedule, steps, currentStep, doneCount, waitingMessage };
};

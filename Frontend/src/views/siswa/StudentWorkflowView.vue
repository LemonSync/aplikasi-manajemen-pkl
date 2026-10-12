<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import {
  studentWorkflowService,
  documentService,
  downloadFile,
  type StudentWorkflowStatus,
} from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import RegistrationView from './RegistrationView.vue';

const auth = useAuthStore();
const router = useRouter();
const status = ref<StudentWorkflowStatus | null>(null);
const loading = ref(true);
const error = ref('');
const success = ref('');

// --- Surat Penerimaan ---
const penerimaanFile = ref<File | null>(null);
const uploadingPenerimaan = ref(false);

const PHASE_LABELS: Record<string, string> = {
  PRA_PKL: 'Pra-Pendaftaran PKL',
  NON_PKL: 'Pendaftaran Ulang PKL',
  PKL_AKTIF: 'Masa PKL',
  PKL_SELESAI: 'Pasca-PKL',
};

const PHASE_ORDER: Record<string, number> = { PRA_PKL: 0, NON_PKL: 1, PKL_AKTIF: 2, PKL_SELESAI: 3 };

/** Jadwal sudah pindah fase, tapi syarat fase ini belum lengkap → siswa tertinggal. */
const isBehindSchedule = computed(() => {
  if (!status.value || !status.value.effectivePhase || !status.value.currentSchedule) return false;
  const current = PHASE_ORDER[status.value.effectivePhase];
  const scheduled = PHASE_ORDER[String(status.value.currentSchedule.phase)];
  return current !== undefined && scheduled !== undefined && current < scheduled;
});

/** Satu langkah pada stepper alur PKL per-orang. */
interface WorkflowStep {
  key: string;
  label: string;
  description: string;
  done: boolean;
  pending?: boolean;
  routeName?: string;
  routeVisible?: boolean;
}

/** Stepper: pendaftaran → unduh Surat Permohonan → Surat Penerimaan → Data Orang Tua → Surat Pernyataan → Laporan Akhir (+ Input Nilai saat Pasca-PKL). */
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
  if (phase === 'PKL_SELESAI') {
    list.push({
      key: 'input-nilai',
      label: 'Input Nilai PKL',
      description: 'Isi nilai PKL Anda (nilai DUDI + aspek penilaian) pada fase Pasca-PKL.',
      done: false,
      routeName: 'grade-input',
      routeVisible: true,
    });
  }
  return list;
});

/** Langkah pertama yang belum selesai (penanda "Langkah Aktif"). */
const currentStepKey = computed(() => steps.value.find((st) => !st.done)?.key ?? '');

const load = async () => {
  loading.value = true;
  error.value = '';
  try {
    status.value = await studentWorkflowService.getStatus();
    await auth.fetchMe();

    // Masa PKL aktif: gunakan sidebar (dashboard), bukan guided workflow
    if (status.value?.effectivePhase === 'PKL_AKTIF') {
      void router.push({ name: 'dashboard' });
      return;
    }
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

// --- Surat Penerimaan ---
const onPenerimaanFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement;
  penerimaanFile.value = input.files?.[0] ?? null;
};

const uploadSuratPenerimaan = async () => {
  if (!penerimaanFile.value) return;
  if (status.value?.hasSuratPenerimaanPending) {
    error.value = 'Surat Penerimaan sedang menunggu verifikasi admin dan tidak dapat diganti.';
    return;
  }
  uploadingPenerimaan.value = true;
  error.value = '';
  success.value = '';
  try {
    await documentService.upload('SURAT_PENERIMAAN', penerimaanFile.value, 'Surat Penerimaan PKL dari Perusahaan');
    success.value = 'Surat Penerimaan berhasil diunggah. Menunggu verifikasi admin.';
    penerimaanFile.value = null;
    status.value = await studentWorkflowService.getStatus();
    await auth.fetchMe();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    uploadingPenerimaan.value = false;
  }
};

// --- Download Surat Permohonan ---
const downloadSurat = async () => {
  if (!status.value?.registrationDocumentId) return;
  try {
    await downloadFile(`/documents/${status.value.registrationDocumentId}/download`, 'surat-permohonan-pkl.pdf');
    // Unduhan menandai permohonanDownloaded di backend → refresh status
    status.value = await studentWorkflowService.getStatus();
    await auth.fetchMe();
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

const waitingMessage = computed(() => {
  if (!status.value || !status.value.hasCompleted || !status.value.nextSchedule) return null;
  return {
    nextPhase: PHASE_LABELS[status.value.nextSchedule.phase] ?? status.value.nextSchedule.phase,
    startDate: formatDate(status.value.nextSchedule.startDate),
  };
});

// Cek apakah siswa "tertinggal" (jadwal sudah pindah ke fase berikutnya tapi belum selesai)
const isBehind = computed(() => {
  if (!status.value || !status.value.currentSchedule || !status.value.hasCompleted) return false;
  const now = new Date();
  const endDate = status.value.currentSchedule.endDate ? new Date(status.value.currentSchedule.endDate) : null;
  return endDate && now > endDate;
});

onMounted(load);
</script>

<template>
  <div v-if="loading" class="mx-auto max-w-4xl space-y-6">
    <div class="loading" />
  </div>

  <div v-else-if="error && !status" class="mx-auto max-w-4xl space-y-6">
    <div class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
  </div>

  <div v-else-if="!status?.effectivePhase" class="mx-auto max-w-4xl space-y-6">
    <div class="card text-center">
      <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
        <svg class="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 class="text-lg font-semibold text-gray-800">Belum Ada Jadwal Aktif</h2>
      <p class="mt-2 text-sm text-gray-500">Saat ini belum ada masa/jadwal PKL yang aktif untuk gelombang Anda.</p>
    </div>
  </div>

  <div v-else class="mx-auto max-w-4xl space-y-6">
    <!-- Header -->
    <section class="rounded-2xl bg-primary-800 p-6 text-white shadow-sm sm:p-8">
      <p class="text-sm font-medium text-primary-200">
        {{ status.effectivePhase === 'PRA_PKL' ? 'Tahap 1 dari 4' : status.effectivePhase === 'NON_PKL' ? 'Tahap 2 dari 4' : '' }}
        · {{ PHASE_LABELS[status.effectivePhase] }}
      </p>
      <h2 class="mt-2 text-2xl font-bold">
        {{ status.effectivePhase === 'PRA_PKL' ? 'Pra-Pendaftaran PKL' : status.effectivePhase === 'PKL_SELESAI' ? 'Pasca-PKL' : 'Pendaftaran Ulang PKL' }}
      </h2>
      <p class="mt-3 max-w-2xl text-sm leading-6 text-primary-100">
        {{ status.effectivePhase === 'PRA_PKL'
          ? 'Pilih perusahaan tujuan dan ajukan pendaftaran. Setelah disetujui, sistem membuat Surat Permohonan PKL.'
          : status.effectivePhase === 'PKL_SELESAI'
            ? 'PKL telah selesai. Lengkapi tahap akhir: laporan dan input nilai PKL.'
            : 'Lengkapi persyaratan pendaftaran ulang PKL.' }}
      </p>
      <div v-if="status.currentSchedule" class="mt-3 flex items-center gap-4 text-xs text-primary-200">
        <span>Masa: {{ formatDate(status.currentSchedule.startDate) }} — {{ formatDate(status.currentSchedule.endDate) }}</span>
      </div>
    </section>

    <!-- Notifikasi -->
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <!-- Peringatan: jadwal sudah pindah fase tapi syarat belum lengkap -->
    <div v-if="isBehindSchedule" class="card border-l-4 border-l-red-500 bg-red-50">
      <div class="flex items-start gap-3">
        <svg class="mt-0.5 h-5 w-5 shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <h3 class="text-sm font-semibold text-red-800">Syarat Tahap Ini Belum Lengkap</h3>
          <p class="mt-1 text-sm text-red-700">
            Jadwal sekolah sudah memasuki masa
            <strong>{{ PHASE_LABELS[String(status.currentSchedule?.phase)] ?? status.currentSchedule?.phase }}</strong>,
            tetapi persyaratan tahap Anda masih
            <strong>{{ PHASE_LABELS[status.effectivePhase] }}</strong>.
            Lengkapi segera agar tahap Anda dapat diteruskan.
          </p>
        </div>
      </div>
    </div>

    <!-- Peringatan: Siswa tertinggal -->
    <div v-if="isBehind" class="card border-l-4 border-l-red-500 bg-red-50">
      <div class="flex items-start gap-3">
        <svg class="mt-0.5 h-5 w-5 shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <h3 class="text-sm font-semibold text-red-800">Anda Tertinggal!</h3>
          <p class="mt-1 text-sm text-red-700">
            Masa ini sudah berakhir, tapi Anda belum menyelesaikan tahap ini.
            Silakan selesaikan tahap ini terlebih dahulu.
          </p>
        </div>
      </div>
    </div>

    <!-- Menunggu -->
    <div v-if="status.hasCompleted && waitingMessage" class="card border-l-4 border-l-blue-500 bg-blue-50">
      <div class="flex items-start gap-3">
        <svg class="mt-0.5 h-5 w-5 shrink-0 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <h3 class="text-sm font-semibold text-blue-800">Tahap ini sudah selesai</h3>
          <p class="mt-1 text-sm text-blue-700">Silakan tunggu masa berikutnya.</p>
          <p class="mt-1 text-sm font-medium text-blue-800">{{ waitingMessage.nextPhase }} dimulai pada {{ waitingMessage.startDate }}.</p>
        </div>
      </div>
    </div>

    <!-- ==================== STEPPER ==================== -->
    <div v-if="status.effectivePhase === 'PRA_PKL' || status.effectivePhase === 'NON_PKL' || status.effectivePhase === 'PKL_SELESAI'" class="card">
      <h2 class="mb-1 text-lg font-semibold text-gray-800">Langkah Alur PKL</h2>
      <p class="mb-4 text-sm text-gray-500">Selesaikan setiap langkah secara berurutan.</p>
      <ol class="space-y-3">
        <li
          v-for="(step, i) in steps"
          :key="step.key"
          class="flex items-start gap-3 rounded-lg border p-3"
          :class="step.done ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200'"
        >
          <span
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
            :class="step.done ? 'bg-emerald-100 text-emerald-700' : 'bg-primary-100 text-primary-700'"
          >
            {{ i + 1 }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-sm font-semibold" :class="step.done ? 'text-emerald-800' : 'text-gray-800'">
                {{ step.label }}
              </p>
              <span v-if="step.done" class="badge bg-emerald-100 text-emerald-700">Selesai</span>
              <span v-else-if="step.pending" class="badge bg-amber-100 text-amber-700">Menunggu Verifikasi</span>
              <span v-else-if="step.key === currentStepKey" class="badge bg-primary-100 text-primary-700">Langkah Aktif</span>
            </div>
            <p class="mt-0.5 text-sm" :class="step.done ? 'text-emerald-700' : 'text-gray-500'">
              {{ step.description }}
            </p>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <!-- Unduh Surat Permohonan (gerbang Fase 1 → 2) -->
              <template v-if="step.key === 'surat-permohonan'">
                <button
                  v-if="status.registrationDocumentId"
                  class="btn-primary"
                  @click="downloadSurat"
                >
                  {{ step.done ? 'Download Ulang Surat Permohonan' : 'Download Surat Permohonan' }}
                </button>
                <span v-else-if="status.registrationStatus === 'DISETUJUI'" class="text-xs text-gray-500">
                  Surat sedang disiapkan sekolah.
                </span>
              </template>
              <!-- Link ke halaman tugas (workflowTask) -->
              <RouterLink
                v-if="step.routeName && !step.done && step.routeVisible"
                :to="{ name: step.routeName }"
                class="btn-secondary"
              >
                Buka {{ step.label }}
              </RouterLink>
              <span v-if="step.key === 'laporan-akhir' && !step.routeVisible && !step.done" class="text-xs text-gray-400">
                Tersedia saat masa PKL.
              </span>
            </div>
          </div>
        </li>
      </ol>
    </div>

    <!-- ==================== PRA_PKL ==================== -->
    <RegistrationView v-if="status.effectivePhase === 'PRA_PKL' && !status.hasCompleted" @downloaded="load" />

    <div v-else-if="status.effectivePhase === 'PRA_PKL' && status.hasCompleted" class="card">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-gray-800">Pendaftaran PKL</h2>
          <p class="text-sm text-gray-500">Pengajuan pendaftaran Anda.</p>
        </div>
        <span class="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">Selesai</span>
      </div>
      <p class="mt-3 text-sm text-gray-600">
        Pendaftaran sudah disetujui. Pastikan Surat Permohonan sudah diunduh dan diserahkan ke perusahaan.
      </p>
    </div>

    <!-- ==================== NON_PKL ==================== -->
    <!-- Upload Surat Penerimaan (belum disetujui) -->
    <div v-if="status.effectivePhase === 'NON_PKL' && !status.hasSuratPenerimaan" class="card">
      <div class="mb-4 flex items-center gap-3">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">3</span>
        <div>
          <h2 class="text-lg font-semibold text-gray-800">Upload Surat Penerimaan PKL</h2>
          <p class="text-sm text-gray-500">Upload surat balasan/penerimaan dari perusahaan tujuan Anda.</p>
        </div>
      </div>

      <!-- Sedang menunggu verifikasi: file terkunci, tidak boleh diganti -->
      <div v-if="status.hasSuratPenerimaanPending" class="rounded-lg bg-amber-50 p-3">
        <p class="text-sm font-medium text-amber-700">Menunggu verifikasi admin...</p>
        <p class="mt-1 text-sm text-amber-600">
          File yang sudah diunggah tidak dapat diganti selama menunggu verifikasi.
          Unggah ulang hanya dapat dilakukan setelah admin menolak.
        </p>
      </div>

      <template v-else>
        <!-- Ditolak admin: tampilkan alasan + boleh upload ulang -->
        <div v-if="status.suratPenerimaanStatus === 'DITOLAK'" class="mb-3 rounded-lg bg-red-50 p-3">
          <p class="text-sm font-medium text-red-700">Surat Penerimaan ditolak admin.</p>
          <p v-if="status.suratPenerimaanNote" class="mt-1 text-sm text-red-600">Alasan: {{ status.suratPenerimaanNote }}</p>
          <p class="mt-1 text-xs text-red-500">Perbaiki lalu upload ulang surat yang benar.</p>
        </div>
        <input class="input" type="file" accept=".pdf,.jpg,.jpeg,.png" @change="onPenerimaanFileChange" />
        <button class="btn-primary mt-4" :disabled="uploadingPenerimaan || !penerimaanFile" @click="uploadSuratPenerimaan">
          {{ uploadingPenerimaan ? 'Mengunggah...' : 'Upload Surat Penerimaan' }}
        </button>
      </template>
    </div>

    <!-- Surat Penerimaan sudah disetujui -->
    <div
      v-if="status.effectivePhase === 'NON_PKL' && status.hasSuratPenerimaan"
      class="card border-l-4 border-l-emerald-500 bg-emerald-50"
    >
      <div class="flex items-center gap-3">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">✓</span>
        <div>
          <h3 class="text-sm font-semibold text-emerald-800">Surat Penerimaan PKL — Selesai</h3>
          <p class="text-sm text-emerald-700">Sudah disetujui admin. Lanjutkan ke langkah berikutnya.</p>
        </div>
      </div>
    </div>

    <!-- NON_PKL selesai -->
    <div v-if="status.effectivePhase === 'NON_PKL' && status.hasCompleted" class="card">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-gray-800">Daftar Ulang PKL</h2>
          <p class="text-sm text-gray-500">Semua persyaratan sudah selesai.</p>
        </div>
        <span class="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">Selesai</span>
      </div>
      <div v-if="waitingMessage" class="mt-4 rounded-lg bg-blue-50 p-4">
        <div class="flex items-start gap-3">
          <svg class="mt-0.5 h-5 w-5 shrink-0 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 class="text-sm font-semibold text-blue-800">Menunggu Masa PKL Dimulai</h3>
            <p class="mt-1 text-sm text-blue-700">{{ waitingMessage.nextPhase }} dimulai pada {{ waitingMessage.startDate }}.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== PKL_SELESAI ==================== -->
    <div v-if="status.effectivePhase === 'PKL_SELESAI'" class="card border-l-4 border-l-primary-600">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="text-lg font-semibold text-gray-800">Input Nilai PKL</h2>
          <p class="mt-1 text-sm text-gray-500">
            Pada fase Pasca-PKL, isi nilai PKL Anda (nilai DUDI + aspek penilaian).
            Nilai akan ditinjau dan disetujui oleh guru pembimbing.
          </p>
        </div>
        <RouterLink :to="{ name: 'grade-input' }" class="btn-primary shrink-0">
          Buka Input Nilai PKL
        </RouterLink>
      </div>
    </div>
  </div>
</template>

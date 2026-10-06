<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import {
  studentWorkflowService,
  pernyataanService,
  documentService,
  downloadFile,
  phase4Service,
  type StudentWorkflowStatus,
  type PernyataanPrefill,
  type LetterRecord,
} from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import RegistrationView from './RegistrationView.vue';
import StatusBadge from '@/components/StatusBadge.vue';

const auth = useAuthStore();
const router = useRouter();
const status = ref<StudentWorkflowStatus | null>(null);
const loading = ref(true);
const error = ref('');
const success = ref('');

// --- NON_PKL: Surat Pernyataan ---
const prefill = ref<PernyataanPrefill>({
  namaSiswa: '', kelasJurusan: '', namaOrtu: '', alamatSiswa: '',
  hpOrtu: '', hpSiswa: '', tempatPkl: '', tanggalPkl: '', tahunPelajaran: '',
});
const generating = ref(false);
const uploading = ref(false);
const generatedDocId = ref<string | null>(null);
const signedFile = ref<File | null>(null);
const docs = ref<Array<{ id: string; type: string; status: string; title: string | null; note: string | null }>>([]);

// --- Surat Penerimaan (ketua) ---
const penerimaanFile = ref<File | null>(null);
const uploadingPenerimaan = ref(false);

// --- Anggota kelompok (untuk ketua) ---
const groupMembers = ref<Array<{ username: string; fullName: string; temporaryPassword: string }>>([]);
const dudiCredential = ref<{ fullName: string; username: string } | null>(null);

// --- Surat kelompok milik siswa (pengantar/penugasan/penarikan) ---
const myLetters = ref<LetterRecord[]>([]);
const downloadingLetterId = ref('');

const PHASE_LABELS: Record<string, string> = {
  PRA_PKL: 'Pra-Pendaftaran PKL',
  NON_PKL: 'Pendaftaran Ulang PKL',
  PKL_AKTIF: 'Masa PKL',
  PKL_SELESAI: 'Pasca-PKL',
};

const isKetua = computed(() => auth.role === 'KETUA');

const PHASE_ORDER: Record<string, number> = { PRA_PKL: 0, NON_PKL: 1, PKL_AKTIF: 2, PKL_SELESAI: 3 };

/** Jadwal sudah pindah fase, tapi syarat fase ini belum lengkap → siswa tertinggal. */
const isBehindSchedule = computed(() => {
  if (!status.value || !status.value.effectivePhase || !status.value.currentSchedule) return false;
  const current = PHASE_ORDER[status.value.effectivePhase];
  const scheduled = PHASE_ORDER[String(status.value.currentSchedule.phase)];
  return current !== undefined && scheduled !== undefined && current < scheduled;
});

const load = async () => {
  loading.value = true;
  error.value = '';
  try {
    status.value = await studentWorkflowService.getStatus();
    await auth.fetchMe();

    // KETUA selalu di guided workflow (tidak perlu redirect)
    if (!isKetua.value && (status.value?.effectivePhase === 'PKL_AKTIF' || status.value?.effectivePhase === 'PKL_SELESAI')) {
      void router.push({ name: 'dashboard' });
      return;
    }

    // Load data untuk NON_PKL
    if (status.value?.effectivePhase === 'NON_PKL') {
      await loadNonPklData();
    }

    // Surat kelompok (pengantar/penugasan) yang sudah diterbitkan admin
    if (status.value?.hasGroup) {
      try {
        myLetters.value = await phase4Service.listLetters();
      } catch {
        myLetters.value = [];
      }
    }
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const downloadMyLetter = async (letter: LetterRecord): Promise<void> => {
  downloadingLetterId.value = letter.id;
  error.value = '';
  try {
    await phase4Service.downloadLetter(letter);
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    downloadingLetterId.value = '';
  }
};

const loadNonPklData = async () => {
  try {
    // KETUA tidak perlu load prefill surat pernyataan
    if (!isKetua.value) {
      const [p, d] = await Promise.all([pernyataanService.prefill(), documentService.listMine()]);
      prefill.value = { ...prefill.value, ...p };
      docs.value = d;
      const suratPernyataan = d.find((x) => x.type === 'SURAT_PERNYATAAN');
      if (suratPernyataan) generatedDocId.value = suratPernyataan.id;
    } else {
      const d = await documentService.listMine();
      docs.value = d;
    }

    // Load anggota kelompok dari workflow status
    if (status.value?.groupMembers) {
      groupMembers.value = status.value.groupMembers;
    dudiCredential.value = status.value.dudiCredential;
    }
  } catch (e) {
    error.value = extractErrorMessage(e);
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

// --- Surat Pernyataan ---
const generateSuratPernyataan = async () => {
  generating.value = true;
  error.value = '';
  success.value = '';
  try {
    const result = await pernyataanService.generate({
      namaOrtu: prefill.value?.namaOrtu,
      alamatSiswa: prefill.value?.alamatSiswa,
      hpOrtu: prefill.value?.hpOrtu,
    });
    generatedDocId.value = result.documentId;
    success.value = 'Surat Pernyataan PDF berhasil dibuat.';
    await loadNonPklData();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    generating.value = false;
  }
};

const downloadPernyataan = async () => {
  if (!generatedDocId.value) return;
  try {
    await downloadFile(`/documents/${generatedDocId.value}/download`, 'surat-pernyataan-pkl.pdf');
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

const onFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement;
  signedFile.value = input.files?.[0] ?? null;
};

const uploadSigned = async () => {
  if (!signedFile.value) return;
  uploading.value = true;
  error.value = '';
  success.value = '';
  try {
    await documentService.upload('SURAT_PERNYATAAN', signedFile.value, 'Surat Pernyataan bermaterai (foto/scan)');
    success.value = 'Surat Pernyataan bermaterai berhasil diunggah.';
    signedFile.value = null;
    await loadNonPklData();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    uploading.value = false;
  }
};

// --- Download Surat Permohonan ---
const downloadSurat = async () => {
  if (!status.value?.registrationDocumentId) return;
  try {
    await downloadFile(`/documents/${status.value.registrationDocumentId}/download`, 'surat-permohonan-pkl.pdf');
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
    <!-- KETUA di fase 3/4: arahkan ke akun SISWA (NISN) -->
    <div v-if="isKetua && (status.effectivePhase === 'PKL_AKTIF' || status.effectivePhase === 'PKL_SELESAI')" class="card border-l-4 border-l-amber-500 bg-amber-50">
      <div class="flex items-start gap-3">
        <svg class="mt-0.5 h-5 w-5 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <h3 class="text-sm font-semibold text-amber-800">Gunakan Akun Siswa Anda</h3>
          <p class="mt-1 text-sm text-amber-700">
            Akun Ketua hanya digunakan untuk pendaftaran (Tahap 1–2). Untuk masa PKL dan pasca-PKL,
            silakan login dengan akun SISWA (username = NISN) Anda.
          </p>
        </div>
      </div>
    </div>

    <!-- Header -->
    <section class="rounded-2xl bg-primary-800 p-6 text-white shadow-sm sm:p-8">
      <p class="text-sm font-medium text-primary-200">
        {{ status.effectivePhase === 'PRA_PKL' ? 'Tahap 1 dari 4' : status.effectivePhase === 'NON_PKL' ? 'Tahap 2 dari 4' : '' }}
        · {{ PHASE_LABELS[status.effectivePhase] }}
      </p>
      <h2 class="mt-2 text-2xl font-bold">
        {{ status.effectivePhase === 'PRA_PKL' ? 'Pra-Pendaftaran PKL' : 'Pendaftaran Ulang PKL' }}
      </h2>
      <p class="mt-3 max-w-2xl text-sm leading-6 text-primary-100">
        {{ status.effectivePhase === 'PRA_PKL'
          ? 'Isi data kelompok dan perusahaan. Setelah disetujui, sistem membuat Surat Permohonan PKL.'
          : 'Lengkapi persyaratan pendaftaran ulang PKL.' }}
      </p>
      <div v-if="status.currentSchedule" class="mt-3 flex items-center gap-4 text-xs text-primary-200">
        <span>Masa: {{ formatDate(status.currentSchedule.startDate) }} — {{ formatDate(status.currentSchedule.endDate) }}</span>
      </div>
    </section>

    <!-- Surat kelompok yang sudah terbit (pengantar/penugasan/penarikan) -->
    <div v-if="myLetters.length > 0" class="card">
      <div class="mb-3 flex items-center justify-between">
        <div>
          <h3 class="text-base font-semibold text-gray-900">Surat Kelompok Anda</h3>
          <p class="text-sm text-gray-500">Surat resmi yang diterbitkan sekolah untuk kelompok Anda.</p>
        </div>
        <span class="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">{{ myLetters.length }} surat</span>
      </div>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-gray-500">
            <th>Tanggal</th>
            <th>Jenis</th>
            <th>Nomor</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in myLetters" :key="l.id" class="border-t">
            <td>{{ new Date(l.createdAt).toLocaleDateString('id-ID') }}</td>
            <td>{{ l.type.replace(/_/g, ' ') }}</td>
            <td class="font-mono">{{ l.number ?? '-' }}</td>
            <td class="text-right">
              <button
                class="text-primary-600 hover:underline disabled:opacity-50"
                :disabled="downloadingLetterId === l.id"
                @click="downloadMyLetter(l)"
              >
                {{ downloadingLetterId === l.id ? 'Mengunduh…' : 'Unduh PDF' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

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

    <!-- Peringatan: kelompok belum terhubung akun DUDI -->
    <div v-if="status.hasGroup && !status.dudiConnected" class="card border-l-4 border-l-amber-500 bg-amber-50">
      <div class="flex items-start gap-3">
        <svg class="mt-0.5 h-5 w-5 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-1.732-2.667-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <h3 class="text-sm font-semibold text-amber-800">Akun DUDI Belum Terhubung</h3>
          <p class="mt-1 text-sm text-amber-700">
            Kelompok Anda belum terkoneksi dengan akun pembimbing perusahaan (DUDI), sehingga mentor
            belum dapat melakukan absensi, verifikasi jurnal, dan penilaian.
          </p>
          <p class="mt-1 text-sm text-amber-700">
            Hubungi <strong>Admin sekolah</strong> untuk pembuatan akun DUDI. Admin akan meminta
            nomor HP pembimbing perusahaan, lalu menyerahkan username &amp; password akunnya kepada Anda.
          </p>
        </div>
      </div>
    </div>

    <!-- ==================== PRA_PKL ==================== -->
    <RegistrationView v-if="status.effectivePhase === 'PRA_PKL' && !status.hasCompleted" />

    <div v-else-if="status.effectivePhase === 'PRA_PKL' && status.hasCompleted" class="card">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-gray-800">Pendaftaran PKL</h2>
          <p class="text-sm text-gray-500">Pengajuan pendaftaran kelompok Anda.</p>
        </div>
        <StatusBadge :status="status.registrationStatus ?? 'DIAJUKAN'" />
      </div>
      <div v-if="status.registrationStatus === 'DISETUJUI' && status.registrationDocumentId" class="mt-4 rounded-lg bg-emerald-50 p-4">
        <p class="text-sm font-medium text-emerald-800">Pendaftaran disetujui! Surat Permohonan sudah dibuat.</p>
        <p class="mt-1 text-sm text-emerald-700">Download, cetak, dan serahkan ke perusahaan tujuan.</p>
        <button class="btn-primary mt-3" @click="downloadSurat">Download Surat Permohonan (PDF)</button>
      </div>
      <div v-else-if="status.registrationStatus === 'DIAJUKAN'" class="mt-4 rounded-lg bg-amber-50 p-4">
        <p class="text-sm text-amber-700">Menunggu persetujuan admin...</p>
      </div>
    </div>

    <!-- ==================== NON_PKL ==================== -->
    <template v-if="status.effectivePhase === 'NON_PKL' && !status.hasCompleted">

      <!-- ===== KETUA ===== -->
      <template v-if="isKetua">
        <!-- Step 1: Upload Surat Penerimaan -->
        <div v-if="!status.hasSuratPenerimaan" class="card">
          <div class="flex items-center gap-3 mb-4">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">1</span>
            <div>
              <h2 class="text-lg font-semibold text-gray-800">Upload Surat Penerimaan PKL</h2>
              <p class="text-sm text-gray-500">Upload surat balasan dari perusahaan untuk kelompok Anda.</p>
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
        <div v-if="status.hasSuratPenerimaan" class="card border-l-4 border-l-emerald-500 bg-emerald-50">
          <div class="flex items-center gap-3">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">1</span>
            <div>
              <h3 class="text-sm font-semibold text-emerald-800">Surat Penerimaan PKL — Selesai</h3>
              <p class="text-sm text-emerald-700">Sudah disetujui admin. Berikan info login kepada anggota.</p>
            </div>
          </div>
        </div>

        <!-- Step 2: Daftar Akun Anggota -->
        <div v-if="status.hasSuratPenerimaan && groupMembers.length > 0" class="card">
          <div class="flex items-center gap-3 mb-4">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">2</span>
            <div>
              <h2 class="text-lg font-semibold text-gray-800">Akun Anggota Kelompok</h2>
              <p class="text-sm text-gray-500">Berikan informasi login ini kepada anggota. Mereka akan login untuk mengisi Surat Pernyataan.</p>
            </div>
          </div>
          <table class="table">
            <thead><tr><th>Nama</th><th>Username (NISN)</th><th>Password</th></tr></thead>
            <tbody>
              <tr v-for="m in groupMembers" :key="m.username">
                <td>{{ m.fullName }}</td>
                <td class="font-mono">{{ m.username }}</td>
                <td class="font-mono text-amber-600">{{ m.temporaryPassword }}</td>
              </tr>
            </tbody>
          </table>
          <p class="mt-3 text-xs text-gray-500">Semua anggota wajib ganti password saat login pertama.</p>
        </div>

        <!-- Step 3: Akun DUDI (dibuat otomatis dari data mentor Fase 1) -->
        <div v-if="status.hasSuratPenerimaan && dudiCredential" class="card">
          <div class="flex items-center gap-3 mb-4">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">3</span>
            <div>
              <h2 class="text-lg font-semibold text-gray-800">Akun DUDI (Pembimbing Perusahaan)</h2>
              <p class="text-sm text-gray-500">Akun ini dibuat otomatis bersama akun anggota. Serahkan username-nya ke pembimbing perusahaan — password hanya diberikan Admin sekolah, dipakai mentor untuk absensi, jurnal, dan penilaian siswa kelompok Anda.</p>
            </div>
          </div>
          <table class="table">
            <thead><tr><th>Nama</th><th>Username</th><th>Password</th></tr></thead>
            <tbody>
              <tr>
                <td>{{ dudiCredential.fullName }}</td>
                <td class="font-mono">{{ dudiCredential.username }}</td>
                <td class="text-gray-500">Hubungi Admin sekolah</td>
              </tr>
            </tbody>
          </table>
          <p class="mt-3 text-xs text-gray-500">Password akun DUDI hanya diberikan Admin kepada pembimbing perusahaan (tidak dibagikan lewat aplikasi). Mentor wajib ganti password saat login pertama.</p>
        </div>

        <!-- Ketua: menunggu anggota mengisi surat pernyataan -->
        <div v-if="status.hasSuratPenerimaan && !status.hasSuratPernyataan" class="card border-l-4 border-l-blue-500 bg-blue-50">
          <div class="flex items-start gap-3">
            <svg class="mt-0.5 h-5 w-5 shrink-0 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 class="text-sm font-semibold text-blue-800">Menunggu Anggota</h3>
              <p class="mt-1 text-sm text-blue-700">Anggota sedang mengisi Surat Pernyataan masing-masing.</p>
            </div>
          </div>
        </div>
      </template>

      <!-- ===== ANGGOTA (bukan ketua) ===== -->
      <template v-else>
        <!-- Langsung Form Surat Pernyataan -->
        <div class="card">
          <div class="flex items-center gap-3 mb-4">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">1</span>
            <div>
              <h2 class="text-lg font-semibold text-gray-800">Form Surat Pernyataan PKL</h2>
              <p class="text-sm text-gray-500">Isi data, klik "Buat Surat Pernyataan", download PDF, print, tanda tangan + materai, lalu upload.</p>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label class="label">Nama Siswa/I</label>
              <input v-model="prefill.namaSiswa" class="input bg-gray-50" readonly />
              <p class="mt-1 text-xs text-gray-400">Otomatis dari data master siswa (NISN).</p>
            </div>
            <div>
              <label class="label">Kelas / Program Keahlian</label>
              <input v-model="prefill.kelasJurusan" class="input bg-gray-50" readonly />
              <p class="mt-1 text-xs text-gray-400">Otomatis dari data master siswa (NISN).</p>
            </div>
            <div><label class="label">Nama Orang Tua/Wali</label><input v-model="prefill.namaOrtu" class="input" /></div>
            <div><label class="label">Alamat Siswa/I</label><input v-model="prefill.alamatSiswa" class="input" /></div>
            <div><label class="label">No. HP Orang Tua/Wali</label><input v-model="prefill.hpOrtu" class="input" /></div>
            <div>
              <label class="label">No. HP Siswa</label>
              <input v-model="prefill.hpSiswa" class="input bg-gray-50" readonly />
              <p class="mt-1 text-xs text-gray-400">Otomatis dari pendaftaran Fase 1.</p>
            </div>
            <div class="sm:col-span-2">
              <label class="label">Tempat PKL</label>
              <input v-model="prefill.tempatPkl" class="input bg-gray-50" readonly />
              <p class="mt-1 text-xs text-gray-400">Otomatis dari pendaftaran Fase 1.</p>
            </div>
          </div>

          <div class="mt-5 flex flex-wrap gap-2">
            <button class="btn-primary" :disabled="generating" @click="generateSuratPernyataan">
              {{ generating ? 'Membuat surat...' : 'Buat Surat Pernyataan (PDF)' }}
            </button>
            <button v-if="generatedDocId" class="btn-secondary" @click="downloadPernyataan">Download PDF</button>
          </div>
        </div>

        <!-- Upload Surat Bermaterai -->
        <div v-if="generatedDocId" class="card">
          <div class="flex items-center gap-3 mb-4">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">2</span>
            <div>
              <h2 class="text-lg font-semibold text-gray-800">Upload Surat yang Sudah Ditandatangani</h2>
              <p class="text-sm text-gray-500">Print, tanda tangan + materai, lalu foto/scan dan upload.</p>
            </div>
          </div>
          <input class="input" type="file" accept=".pdf,.jpg,.jpeg,.png" @change="onFileChange" />
          <button class="btn-primary mt-4" :disabled="uploading || !signedFile" @click="uploadSigned">
            {{ uploading ? 'Mengunggah...' : 'Upload Surat Bermaterai' }}
          </button>
        </div>

        <!-- Status -->
        <div v-if="docs.filter(x => x.type === 'SURAT_PERNYATAAN').length > 0" class="card">
          <h2 class="mb-4 text-lg font-semibold text-gray-800">Status Dokumen</h2>
          <table class="table">
            <thead><tr><th>Jenis</th><th>Status</th><th>Catatan</th></tr></thead>
            <tbody>
              <tr v-for="d in docs.filter(x => x.type === 'SURAT_PERNYATAAN')" :key="d.id">
                <td>{{ d.title ?? d.type }}</td>
                <td><StatusBadge :status="d.status" /></td>
                <td class="text-gray-500">{{ d.note ?? '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>

    <!-- NON_PKL selesai -->
    <div v-else-if="status.effectivePhase === 'NON_PKL' && status.hasCompleted" class="card">
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
  </div>
</template>

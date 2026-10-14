<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  pernyataanService,
  documentService,
  studentWorkflowService,
  downloadFile,
  type PernyataanPrefill,
  type StudentWorkflowStatus,
} from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import StatusBadge from '@/components/StatusBadge.vue';

const prefill = ref<PernyataanPrefill>({
  namaSiswa: '',
  kelasJurusan: '',
  namaOrtu: '',
  alamatSiswa: '',
  hpOrtu: '',
  hpSiswa: '',
  tempatPkl: '',
  tanggalPkl: '',
  tahunPelajaran: '',
});
const loading = ref(true);
const generating = ref(false);
const uploading = ref(false);
const error = ref('');
const success = ref('');
const generatedDocId = ref<string | null>(null);
const docs = ref<Array<{ id: string; type: string; status: string; title: string | null; note: string | null }>>([]);
const signedFile = ref<File | null>(null);
const workflow = ref<StudentWorkflowStatus | null>(null);

// Form hanya boleh diisi saat siswa berada di Fase 2 (NON_PKL).
// Setelah fase berpindah (Fase 3+), tugas Fase 2 dianggap selesai dan terkunci.
const phaseLocked = computed(() => workflow.value?.effectivePhase !== 'NON_PKL');
const isBeforePhase2 = computed(() => {
  const p = workflow.value?.effectivePhase;
  return p === null || p === undefined || p === 'PRA_PKL';
});

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    const [p, d, w] = await Promise.all([
      pernyataanService.prefill(),
      documentService.listMine(),
      studentWorkflowService.getStatus(),
    ]);
    prefill.value = { ...prefill.value, ...p };
    docs.value = d.filter((x) => x.type === 'SURAT_PERNYATAAN');
    if (docs.value.length > 0) generatedDocId.value = docs.value[0].id;
    workflow.value = w;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const generate = async (): Promise<void> => {
  if (phaseLocked.value) return;
  // Semua data yang dicetak ke surat wajib terisi (sinkron dengan backend).
  if (!prefill.value?.namaOrtu?.trim()) {
    error.value = 'Nama orang tua/wali wajib diisi.';
    return;
  }
  if (!prefill.value?.alamatSiswa?.trim()) {
    error.value = 'Alamat siswa wajib diisi.';
    return;
  }
  if (!prefill.value?.hpOrtu?.trim()) {
    error.value = 'No. HP orang tua/wali wajib diisi.';
    return;
  }
  if (!prefill.value?.hpSiswa?.trim()) {
    error.value = 'No. HP siswa wajib diisi.';
    return;
  }
  generating.value = true;
  error.value = '';
  success.value = '';
  try {
    const result = await pernyataanService.generate({
      namaOrtu: prefill.value?.namaOrtu,
      alamatSiswa: prefill.value?.alamatSiswa,
      hpOrtu: prefill.value?.hpOrtu,
      hpSiswa: prefill.value?.hpSiswa,
    });
    generatedDocId.value = result.documentId;
    success.value = 'Surat Pernyataan PDF berhasil dibuat. Silakan unduh, print, tanda tangan di atas materai, lalu unggah kembali.';
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    generating.value = false;
  }
};

const downloadPdf = async (): Promise<void> => {
  if (!generatedDocId.value) return;
  try {
    await downloadFile(`/documents/${generatedDocId.value}/download`, 'surat-pernyataan-pkl.pdf');
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

const onFileChange = (event: Event): void => {
  const input = event.target as HTMLInputElement;
  signedFile.value = input.files?.[0] ?? null;
};

const uploadSigned = async (): Promise<void> => {
  if (!signedFile.value || phaseLocked.value) return;
  uploading.value = true;
  error.value = '';
  success.value = '';
  try {
    await documentService.upload('SURAT_PERNYATAAN', signedFile.value, 'Surat Pernyataan bermaterai (foto/scan)');
    success.value = 'Surat Pernyataan bermaterai berhasil diunggah dan menunggu verifikasi admin.';
    signedFile.value = null;
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    uploading.value = false;
  }
};

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <!-- Penguncian form di luar Fase 2 -->
    <div v-if="!loading && phaseLocked" class="rounded-lg border-l-4 border-l-blue-500 bg-blue-50 p-4">
      <p class="text-sm font-medium text-blue-800">
        <template v-if="isBeforePhase2">Form Surat Pernyataan terkunci.</template>
        <template v-else>Tugas Fase 2 (Surat Pernyataan) sudah selesai — form terkunci.</template>
      </p>
      <p class="mt-1 text-sm text-blue-700">
        <template v-if="isBeforePhase2">
          Surat Pernyataan hanya dapat diisi saat siswa berada di Fase 2 (masa pendaftaran ulang PKL).
        </template>
        <template v-else>
          Dokumen Surat Pernyataan Anda tetap dapat dilihat dan diunduh pada tabel status di bawah.
        </template>
      </p>
      <div v-if="!isBeforePhase2" class="mt-3">
        <RouterLink
          to="/"
          class="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Kembali ke Dashboard
        </RouterLink>
      </div>
    </div>

    <div class="card">
      <h2 class="mb-2 text-lg font-semibold text-gray-800">Surat Pernyataan Peserta PKL</h2>
      <p class="mb-4 text-sm text-gray-500">
        Isi data di bawah, lalu tekan <strong>"Buat Surat Pernyataan"</strong>. Sistem akan membuat file PDF
        berisi peraturan, data Anda, dan blok tanda tangan (siswa + materai, ortu, wali kelas).
        Setelah itu: <strong>unduh &rarr; print &rarr; tanda tangan &rarr; tempel materai &rarr;
        foto/scan &rarr; unggah kembali</strong> untuk diverifikasi admin.
      </p>
      <p class="mb-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
        <strong>Nama siswa</strong> &amp; <strong>kelas/program keahlian</strong> diambil dari data master siswa (NISN),
        sedangkan <strong>tempat PKL</strong> diambil dari pendaftaran Fase 1 —
        keduanya tidak dapat diubah.
      </p>

      <div v-if="loading" class="loading" />
      <template v-else>
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
          <div>
            <label class="label">Nama Orang Tua/Wali <span class="text-red-500">*</span></label>
            <input v-model="prefill.namaOrtu" class="input" :disabled="phaseLocked" />
          </div>
          <div>
            <label class="label">Alamat Siswa/I <span class="text-red-500">*</span></label>
            <input v-model="prefill.alamatSiswa" class="input" :disabled="phaseLocked" />
          </div>
          <div>
            <label class="label">No. HP Orang Tua/Wali <span class="text-red-500">*</span></label>
            <input v-model="prefill.hpOrtu" class="input" :disabled="phaseLocked" />
          </div>
          <div>
            <label class="label">No. HP Siswa <span class="text-red-500">*</span></label>
            <input v-model="prefill.hpSiswa" class="input" placeholder="Masukkan No. HP siswa" :disabled="phaseLocked" />
            <p class="mt-1 text-xs text-gray-400">Diisi siswa. Bila dikosongkan, diambil dari profil siswa.</p>
          </div>
          <div>
            <label class="label">Tempat PKL</label>
            <input v-model="prefill.tempatPkl" class="input bg-gray-50" readonly />
            <p class="mt-1 text-xs text-gray-400">Otomatis dari pendaftaran Fase 1.</p>
          </div>
          <div>
            <label class="label">Tanggal PKL</label>
            <input :value="prefill.tanggalPkl" class="input bg-gray-50" readonly />
            <p class="mt-1 text-xs text-gray-400">Otomatis dari jadwal Fase 3 (masa PKL) gelombang ini.</p>
          </div>
          <div>
            <label class="label">Tahun Pelajaran</label>
            <input :value="prefill.tahunPelajaran" class="input bg-gray-50" readonly />
          </div>
        </div>

        <div class="mt-5 flex flex-wrap gap-2">
          <button v-if="!phaseLocked" class="btn-primary" :disabled="generating" @click="generate">
            {{ generating ? 'Membuat surat...' : 'Buat Surat Pernyataan (PDF)' }}
          </button>
          <button v-if="generatedDocId" class="btn-secondary" @click="downloadPdf">
            Unduh PDF
          </button>
        </div>
      </template>
    </div>

    <div v-if="!loading && !phaseLocked" class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Unggah Surat yang Sudah Ditandatangani</h2>
      <p class="mb-3 text-sm text-gray-500">
        Setelah print, tanda tangan, dan tempel materai, foto/scan surat lalu unggah di sini.
        Admin akan memverifikasi kebenaran dan kelengkapan materai.
      </p>
      <input
        class="input"
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        :disabled="!generatedDocId"
        @change="onFileChange"
      />
      <button class="btn-primary mt-4" :disabled="uploading || !signedFile || !generatedDocId" @click="uploadSigned">
        {{ uploading ? 'Mengunggah...' : 'Unggah Surat Bermaterai' }}
      </button>
    </div>

    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Status Surat Pernyataan</h2>
      <table class="table">
        <thead>
          <tr>
            <th>Jenis</th>
            <th>Judul</th>
            <th>Status</th>
            <th>Catatan</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in docs" :key="d.id">
            <td>{{ d.type }}</td>
            <td>{{ d.title ?? '-' }}</td>
            <td><StatusBadge :status="d.status" /></td>
            <td class="text-gray-500">{{ d.note ?? '-' }}</td>
          </tr>
          <tr v-if="docs.length === 0">
            <td colspan="4" class="py-4 text-center text-gray-400">Belum ada surat pernyataan.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

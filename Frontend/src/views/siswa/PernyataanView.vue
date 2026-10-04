<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { pernyataanService, documentService, downloadFile, type PernyataanPrefill } from '@/services/api.service';
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

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    const [p, d] = await Promise.all([pernyataanService.prefill(), documentService.listMine()]);
    prefill.value = { ...prefill.value, ...p };
    docs.value = d.filter((x) => x.type === 'SURAT_PERNYATAAN');
    if (docs.value.length > 0) generatedDocId.value = docs.value[0].id;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const generate = async (): Promise<void> => {
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
  if (!signedFile.value) return;
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
        sedangkan <strong>No. HP siswa</strong> &amp; <strong>tempat PKL</strong> diambil dari pendaftaran Fase 1 —
        keempatnya tidak dapat diubah.
      </p>

      <div v-if="loading" class="text-sm text-gray-500">Memuat data...</div>
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
            <label class="label">Nama Orang Tua/Wali</label>
            <input v-model="prefill.namaOrtu" class="input" />
          </div>
          <div>
            <label class="label">Alamat Siswa/I</label>
            <input v-model="prefill.alamatSiswa" class="input" />
          </div>
          <div>
            <label class="label">No. HP Orang Tua/Wali</label>
            <input v-model="prefill.hpOrtu" class="input" />
          </div>
          <div>
            <label class="label">No. HP Siswa</label>
            <input v-model="prefill.hpSiswa" class="input bg-gray-50" readonly />
            <p class="mt-1 text-xs text-gray-400">Otomatis dari pendaftaran Fase 1.</p>
          </div>
          <div>
            <label class="label">Tempat PKL</label>
            <input v-model="prefill.tempatPkl" class="input bg-gray-50" readonly />
            <p class="mt-1 text-xs text-gray-400">Otomatis dari pendaftaran Fase 1.</p>
          </div>
          <div>
            <label class="label">Tanggal PKL</label>
            <input :value="prefill.tanggalPkl" class="input bg-gray-50" readonly />
          </div>
          <div>
            <label class="label">Tahun Pelajaran</label>
            <input :value="prefill.tahunPelajaran" class="input bg-gray-50" readonly />
          </div>
        </div>

        <div class="mt-5 flex flex-wrap gap-2">
          <button class="btn-primary" :disabled="generating" @click="generate">
            {{ generating ? 'Membuat surat...' : 'Buat Surat Pernyataan (PDF)' }}
          </button>
          <button v-if="generatedDocId" class="btn-secondary" @click="downloadPdf">
            Unduh PDF
          </button>
        </div>
      </template>
    </div>

    <div class="card">
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

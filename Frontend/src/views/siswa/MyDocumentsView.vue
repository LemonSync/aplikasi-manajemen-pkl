<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { documentService, downloadFile, type DocumentRecord } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import StatusBadge from '@/components/StatusBadge.vue';

const docs = ref<DocumentRecord[]>([]);
const loading = ref(true);
const uploading = ref(false);
const error = ref('');
const success = ref('');

const uploadType = ref('LAINNYA');
const uploadTitle = ref('');
const selectedFile = ref<File | null>(null);

const TYPE_LABELS: Record<string, string> = {
  SURAT_PERMOHONAN: 'Surat Permohonan',
  SURAT_PENERIMAAN: 'Surat Penerimaan',
  SURAT_PERNYATAAN: 'Surat Pernyataan',
  LAPORAN_AKHIR: 'Laporan Akhir',
  LAINNYA: 'Lainnya',
};

const load = async (): Promise<void> => {
  loading.value = true;
  try {
    docs.value = await documentService.listMine();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const onFileChange = (event: Event): void => {
  const input = event.target as HTMLInputElement;
  selectedFile.value = input.files?.[0] ?? null;
};

const upload = async (): Promise<void> => {
  if (!selectedFile.value) return;
  uploading.value = true;
  error.value = '';
  success.value = '';
  try {
    await documentService.upload(uploadType.value, selectedFile.value, uploadTitle.value || undefined);
    success.value = 'Dokumen berhasil diunggah dan menunggu verifikasi admin.';
    selectedFile.value = null;
    uploadTitle.value = '';
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    uploading.value = false;
  }
};

const download = async (id: string, title?: string | null, type?: string): Promise<void> => {
  try {
    await downloadFile(`/documents/${id}/download`, title ?? `${type ?? 'dokumen'}.pdf`);
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div class="card">
      <div class="mb-4">
        <h2 class="text-lg font-semibold text-gray-800">Unggah Dokumen</h2>
        <p class="text-sm text-gray-500">
          Untuk berkas umum (sertifikat, piagam, dsb). Surat Permohonan/Penerimaan/Pernyataan
          diurus otomatis lewat <b>Alur PKL</b>, dan laporan akhir lewat menu <b>Laporan Akhir</b>.
        </p>
      </div>
      <div v-if="error" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
      <div v-if="success" class="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label class="label">Judul (opsional)</label>
          <input v-model="uploadTitle" class="input" placeholder="Judul dokumen" />
        </div>
        <div>
          <label class="label">File (PDF/Gambar)</label>
          <input class="input" type="file" accept=".pdf,.jpg,.jpeg,.png" @change="onFileChange" />
        </div>
      </div>
      <button class="btn-primary mt-4" :disabled="uploading || !selectedFile" @click="upload">
        {{ uploading ? 'Mengunggah…' : 'Unggah' }}
      </button>
    </div>

    <div class="card">
      <div class="mb-4">
        <h2 class="text-lg font-semibold text-gray-800">Dokumen Saya</h2>
        <p class="text-sm text-gray-500">Semua dokumen milik Anda beserta status verifikasinya.</p>
      </div>
      <div v-if="loading" class="loading" />
      <table v-else class="table">
        <thead>
          <tr>
            <th>Jenis</th>
            <th>Judul</th>
            <th>Status</th>
            <th>Catatan</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in docs" :key="d.id">
            <td>{{ TYPE_LABELS[d.type] ?? d.type }}</td>
            <td>{{ d.title ?? '-' }}</td>
            <td><StatusBadge :status="d.status" /></td>
            <td class="text-gray-500">{{ d.note ?? '-' }}</td>
            <td class="text-right">
              <button class="text-primary-600 hover:underline" @click="download(d.id, d.title, d.type)">Unduh</button>
            </td>
          </tr>
          <tr v-if="docs.length === 0">
            <td colspan="5" class="py-4 text-center text-gray-400">Belum ada dokumen.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
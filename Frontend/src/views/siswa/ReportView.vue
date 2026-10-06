<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { gradeService, documentService, downloadFile, type GradeRecord, type DocumentRecord } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import StatusBadge from '@/components/StatusBadge.vue';

const grades = ref<GradeRecord[]>([]);
const docs = ref<DocumentRecord[]>([]);
const loading = ref(true);
const uploading = ref(false);
const error = ref('');
const success = ref('');

const selectedFile = ref<File | null>(null);

const load = async (): Promise<void> => {
  loading.value = true;
  try {
    const [gradesData, docsData] = await Promise.all([
      gradeService.myGrades(),
      documentService.listMine(),
    ]);
    grades.value = gradesData;
    docs.value = docsData.filter((d) => d.type === 'LAPORAN_AKHIR');
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

const uploadReport = async (): Promise<void> => {
  if (!selectedFile.value) return;
  uploading.value = true;
  error.value = '';
  success.value = '';
  try {
    await documentService.upload('LAPORAN_AKHIR', selectedFile.value, 'Laporan Akhir PKL');
    success.value = 'Laporan akhir berhasil diunggah dan menunggu verifikasi.';
    selectedFile.value = null;
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    uploading.value = false;
  }
};

const download = async (id: string, title?: string | null): Promise<void> => {
  try {
    await downloadFile(`/documents/${id}/download`, title ?? 'laporan-akhir.pdf');
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Unggah Laporan Akhir</h2>
      <div v-if="error" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
      <div v-if="success" class="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label class="label">File Laporan Akhir (PDF)</label>
          <input class="input" type="file" accept=".pdf" @change="onFileChange" />
        </div>
      </div>
      <button class="btn-primary mt-4" :disabled="uploading || !selectedFile" @click="uploadReport">
        {{ uploading ? 'Mengunggah…' : 'Unggah Laporan Akhir' }}
      </button>
    </div>

    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Dokumen Laporan Akhir</h2>
      <div v-if="loading" class="loading" />
      <table v-else class="table">
        <thead>
          <tr>
            <th>Judul</th>
            <th>Status</th>
            <th>Catatan</th>
            <th>Tanggal</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in docs" :key="d.id">
            <td>{{ d.title ?? 'Laporan Akhir' }}</td>
            <td><StatusBadge :status="d.status" /></td>
            <td class="text-gray-500">{{ d.note ?? '-' }}</td>
            <td>{{ new Date(d.createdAt).toLocaleDateString('id-ID') }}</td>
            <td class="text-right">
              <button class="text-primary-600 hover:underline" @click="download(d.id, d.title)">Unduh</button>
            </td>
          </tr>
          <tr v-if="docs.length === 0">
            <td colspan="5" class="py-4 text-center text-gray-400">Belum ada laporan akhir.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Rekap Nilai Saya</h2>
      <div v-if="loading" class="loading" />
      <table v-else class="table">
        <thead>
          <tr>
            <th>Nilai DUDI</th>
            <th>Nilai Bimbingan</th>
            <th>Nilai Akhir</th>
            <th>Predikat</th>
            <th>Catatan</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in grades" :key="g.id">
            <td>{{ g.scoreDudi ?? '-' }}</td>
            <td>{{ g.scoreGuidance ?? '-' }}</td>
            <td>{{ g.finalScore ?? '-' }}</td>
            <td><StatusBadge :status="g.predicate ?? '-'" /></td>
            <td class="text-gray-500">{{ g.note ?? '-' }}</td>
          </tr>
          <tr v-if="grades.length === 0">
            <td colspan="5" class="py-4 text-center text-gray-400">Belum ada data nilai.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

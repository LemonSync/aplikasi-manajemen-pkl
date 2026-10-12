<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  documentService,
  downloadFile,
  type DocumentRecord,
  type DocumentPlacement,
} from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import StatusBadge from '@/components/StatusBadge.vue';
import Modal from '@/components/Modal.vue';

type DocumentDetail = DocumentRecord & { placement: DocumentPlacement | null };

const docs = ref<DocumentRecord[]>([]);
const loading = ref(true);
const uploading = ref(false);
const error = ref('');
const success = ref('');

const uploadType = ref('LAINNYA');
const uploadTitle = ref('');
const selectedFile = ref<File | null>(null);

// Detail dokumen + info penempatan per-orang (siswa, perusahaan, pembimbing)
const showDetail = ref(false);
const detailLoading = ref(false);
const detail = ref<DocumentDetail | null>(null);

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

/** Buka detail dokumen — menampilkan info penempatan per-orang. */
const openDetail = async (id: string): Promise<void> => {
  showDetail.value = true;
  detailLoading.value = true;
  detail.value = null;
  try {
    detail.value = await documentService.getDetail(id);
  } catch (e) {
    error.value = extractErrorMessage(e);
    showDetail.value = false;
  } finally {
    detailLoading.value = false;
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
              <button class="mr-3 text-primary-600 hover:underline" @click="openDetail(d.id)">Detail</button>
              <button class="text-primary-600 hover:underline" @click="download(d.id, d.title, d.type)">Unduh</button>
            </td>
          </tr>
          <tr v-if="docs.length === 0">
            <td colspan="5" class="py-4 text-center text-gray-400">Belum ada dokumen.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal Detail: info penempatan per-orang -->
    <Modal :open="showDetail" title="Detail Dokumen" size="md" @close="showDetail = false">
      <div v-if="detailLoading" class="loading" />
      <template v-else-if="detail">
        <div class="mb-4 flex items-center justify-between">
          <div>
            <p class="text-sm font-semibold text-gray-800">{{ TYPE_LABELS[detail.type] ?? detail.type }}</p>
            <p class="text-xs text-gray-500">Kode: {{ detail.placement?.code ?? '-' }}</p>
          </div>
          <StatusBadge :status="detail.status" />
        </div>

        <!-- Siswa -->
        <div class="mb-4 rounded-lg bg-gray-50 p-3">
          <p class="text-xs font-semibold uppercase tracking-wider text-gray-500">Siswa</p>
          <p class="mt-1 text-sm font-medium text-gray-800">{{ detail.placement?.student.fullName ?? '-' }}</p>
          <p class="text-xs text-gray-500">
            NISN: {{ detail.placement?.student.nisn ?? '-' }}
            · Username: {{ detail.placement?.student.username }}
            <span v-if="detail.placement?.student.className"> · Kelas: {{ detail.placement.student.className }}</span>
          </p>
        </div>

        <!-- Perusahaan -->
        <div class="mb-4 rounded-lg bg-gray-50 p-3">
          <p class="text-xs font-semibold uppercase tracking-wider text-gray-500">Perusahaan</p>
          <template v-if="detail.placement?.company">
            <p class="mt-1 text-sm font-medium text-gray-800">{{ detail.placement.company.name }}</p>
            <p class="text-xs text-gray-500">
              {{ detail.placement.company.address }}<span v-if="detail.placement.company.city">, {{ detail.placement.company.city }}</span>
            </p>
            <p v-if="detail.placement.company.industryName" class="text-xs text-gray-500">
              Bidang: {{ detail.placement.company.industryName }}
            </p>
            <p v-if="detail.placement.company.phone" class="text-xs text-gray-500">
              Telp: {{ detail.placement.company.phone }}
            </p>
          </template>
          <p v-else class="mt-1 text-sm text-gray-500">-</p>
        </div>

        <!-- Pembimbing & Jurusan -->
        <div class="rounded-lg bg-gray-50 p-3">
          <p class="text-xs font-semibold uppercase tracking-wider text-gray-500">Pembimbing</p>
          <p class="mt-1 text-sm font-medium text-gray-800">{{ detail.placement?.supervisorName ?? 'Belum ditentukan' }}</p>
          <p v-if="detail.placement?.majorName" class="text-xs text-gray-500">Program Keahlian: {{ detail.placement.majorName }}</p>
        </div>
      </template>
    </Modal>
  </div>
</template>

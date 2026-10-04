<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { documentService, downloadFile, type DocumentRecord } from '@/services/api.service';
import { useCohortStore } from '@/stores/cohort.store';
import { extractErrorMessage } from '@/services/http';
import StatusBadge from '@/components/StatusBadge.vue';

const docs = ref<DocumentRecord[]>([]);
const loading = ref(true);
const error = ref('');
const success = ref('');
const noteFor = ref<Record<string, string>>({});
const statusFilter = ref('MENUNGGU_VERIFIKASI');
const cohortStore = useCohortStore();

const emptyText = computed(() => {
  switch (statusFilter.value) {
    case 'MENUNGGU_VERIFIKASI':
      return 'Tidak ada surat pernyataan yang menunggu verifikasi.';
    case 'DISETUJUI':
      return 'Belum ada surat pernyataan yang disetujui.';
    case 'DITOLAK':
      return 'Belum ada surat pernyataan yang ditolak.';
    default:
      return 'Belum ada surat pernyataan.';
  }
});

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    const result = await documentService.list(
      statusFilter.value || undefined,
      'SURAT_PERNYATAAN',
      cohortStore.activeCohortId || undefined
    );
    docs.value = result.items;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const verify = async (doc: DocumentRecord, action: 'APPROVE' | 'REJECT'): Promise<void> => {
  error.value = '';
  success.value = '';
  try {
    const note = noteFor.value[doc.id];
    if (action === 'REJECT' && !note) {
      error.value = 'Alasan penolakan wajib diisi.';
      return;
    }
    await documentService.verify(doc.id, action, note);
    success.value = `Surat Pernyataan ${action === 'APPROVE' ? 'disetujui' : 'ditolak'}.`;
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

const download = async (id: string, filename?: string): Promise<void> => {
  try {
    await downloadFile(`/documents/${id}/download`, filename ?? 'surat-pernyataan.pdf');
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

onMounted(async () => {
  await cohortStore.ensureLoaded();
  await load();
});

watch(
  () => cohortStore.activeCohortId,
  () => void load()
);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <div class="card">
      <h2 class="mb-2 text-lg font-semibold text-gray-800">Verifikasi Surat Pernyataan PKL</h2>
      <p class="mb-4 text-sm text-gray-500">Surat pernyataan bermaterai dari siswa. Jika disetujui, siswa boleh melanjutkan ke masa PKL.</p>

      <div class="mb-4 flex items-center gap-3">
        <label class="label mb-0">Filter Status</label>
        <select v-model="statusFilter" class="input max-w-xs" @change="load">
          <option value="">Semua</option>
          <option value="MENUNGGU_VERIFIKASI">Menunggu Verifikasi</option>
          <option value="DISETUJUI">Disetujui</option>
          <option value="DITOLAK">Ditolak</option>
        </select>
      </div>

      <div v-if="loading" class="text-sm text-gray-500">Memuat...</div>
      <table v-else class="table">
        <thead>
          <tr>
            <th>Siswa</th>
            <th>Dokumen</th>
            <th>Versi</th>
            <th>Tanggal</th>
            <th>Status</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in docs" :key="d.id">
            <td class="font-medium">{{ d.title ?? '-' }}</td>
            <td>{{ d.type }}</td>
            <td>v{{ d.files?.[0]?.version ?? '-' }}</td>
            <td>{{ new Date(d.createdAt).toLocaleDateString('id-ID') }}</td>
            <td>
              <StatusBadge :status="d.status" />
              <p v-if="d.status === 'DITOLAK' && d.note" class="mt-1 max-w-xs text-xs text-red-500">
                Alasan: {{ d.note }}
              </p>
            </td>
            <td class="text-right">
              <button class="text-primary-600 hover:underline" @click="download(d.id, `surat-pernyataan-${d.id}.pdf`)">Lihat</button>
              <template v-if="d.status === 'MENUNGGU_VERIFIKASI'">
                <span class="mx-1 text-gray-300">|</span>
                <button class="text-emerald-600 hover:underline" @click="verify(d, 'APPROVE')">Setujui</button>
                <span class="mx-1 text-gray-300">|</span>
                <button class="text-red-600 hover:underline" @click="verify(d, 'REJECT')">Tolak</button>
                <input v-model="noteFor[d.id]" class="input mt-1 text-xs" placeholder="Alasan tolak" />
              </template>
            </td>
          </tr>
          <tr v-if="docs.length === 0">
            <td colspan="6" class="py-4 text-center text-gray-400">{{ emptyText }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

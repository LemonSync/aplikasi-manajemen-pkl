<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { documentService, downloadFile, type DocumentRecord } from '@/services/api.service';
import { useCohortStore } from '@/stores/cohort.store';
import { extractErrorMessage } from '@/services/http';
import StatusBadge from '@/components/StatusBadge.vue';

const docs = ref<DocumentRecord[]>([]);
const cohortStore = useCohortStore();
const loading = ref(true);
const error = ref('');
const success = ref('');
const filterStatus = ref('MENUNGGU_VERIFIKASI');
const noteFor = ref<Record<string, string>>({});

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    const result = await documentService.list(filterStatus.value || undefined, undefined, cohortStore.activeCohortId || undefined);
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
    success.value = `Dokumen ${action === 'APPROVE' ? 'disetujui' : 'ditolak'}.`;
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

const download = async (id: string, filename?: string): Promise<void> => {
  try {
    await downloadFile(`/documents/${id}/download`, filename ?? 'document.pdf');
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
      <div class="mb-4 flex items-center gap-3">
        <label class="label mb-0">Filter Status</label>
        <select v-model="filterStatus" class="input max-w-xs" @change="load">
          <option value="">Semua</option>
          <option value="MENUNGGU_VERIFIKASI">Menunggu Verifikasi</option>
          <option value="DISETUJUI">Disetujui</option>
          <option value="DITOLAK">Ditolak</option>
        </select>
      </div>

      <div v-if="loading" class="text-sm text-gray-500">Memuat…</div>
      <table v-else class="table">
        <thead>
          <tr>
            <th>Jenis</th>
            <th>Judul</th>
            <th>Status</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in docs" :key="d.id">
            <td>{{ d.type }}</td>
            <td>{{ d.title ?? '-' }}</td>
            <td>
              <StatusBadge :status="d.status" />
              <p v-if="d.status === 'DITOLAK' && d.note" class="mt-1 max-w-xs text-xs text-red-500">
                Alasan: {{ d.note }}
              </p>
            </td>
            <td class="text-right">
              <button class="text-primary-600 hover:underline" @click="download(d.id)">Unduh</button>
              <template v-if="d.status === 'MENUNGGU_VERIFIKASI'">
                <input
                  v-model="noteFor[d.id]"
                  class="input my-2 max-w-xs text-xs"
                  placeholder="Catatan (wajib bila tolak)"
                />
                <div class="flex justify-end gap-2">
                  <button class="btn-success" @click="verify(d, 'APPROVE')">Setujui</button>
                  <button class="btn-danger" @click="verify(d, 'REJECT')">Tolak</button>
                </div>
              </template>
            </td>
          </tr>
          <tr v-if="docs.length === 0">
            <td colspan="4" class="py-4 text-center text-gray-400">Tidak ada data.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
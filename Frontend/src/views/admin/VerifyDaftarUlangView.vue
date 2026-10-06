<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { documentService, downloadFile, type DocumentRecord } from '@/services/api.service';
import { useCohortStore } from '@/stores/cohort.store';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';
import StatusBadge from '@/components/StatusBadge.vue';

const docs = ref<DocumentRecord[]>([]);
const loading = ref(true);
const error = ref('');
const success = ref('');
const statusFilter = ref('MENUNGGU_VERIFIKASI');
const cohortStore = useCohortStore();
const activeId = ref<string | null>(null);
const noteInput = ref('');
const busy = ref(false);

const active = computed<DocumentRecord | null>(
  () => docs.value.find((d) => d.id === activeId.value) ?? null
);

const emptyText = computed(() => {
  switch (statusFilter.value) {
    case 'MENUNGGU_VERIFIKASI':
      return 'Tidak ada surat yang menunggu.';
    case 'DISETUJUI':
      return 'Belum ada surat yang disetujui.';
    case 'DITOLAK':
      return 'Belum ada surat yang ditolak.';
    default:
      return 'Belum ada surat.';
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

const open = (d: DocumentRecord): void => {
  activeId.value = d.id;
  noteInput.value = '';
};

const verify = async (action: 'APPROVE' | 'REJECT'): Promise<void> => {
  if (!activeId.value) return;
  if (action === 'REJECT' && !noteInput.value.trim()) {
    error.value = 'Alasan penolakan wajib diisi.';
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    await documentService.verify(activeId.value, action, noteInput.value.trim());
    success.value = action === 'APPROVE' ? 'Surat disetujui.' : 'Surat ditolak.';
    activeId.value = null;
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    busy.value = false;
  }
};

const download = async (id: string): Promise<void> => {
  try {
    await downloadFile(`/documents/${id}/download`, `surat-pernyataan-${id}.pdf`);
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
    <div v-if="error" class="bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <div class="card">
      <div class="mb-4 flex items-center gap-3">
        <label class="label mb-0">Status</label>
        <select v-model="statusFilter" class="input max-w-xs" @change="load">
          <option value="">Semua</option>
          <option value="MENUNGGU_VERIFIKASI">Menunggu</option>
          <option value="DISETUJUI">Disetujui</option>
          <option value="DITOLAK">Ditolak</option>
        </select>
      </div>

      <SkeletonTable v-if="loading" :rows="6" :cols="5" />
      <table v-else class="table">
        <thead>
          <tr>
            <th>Siswa</th>
            <th>Versi</th>
            <th>Tanggal</th>
            <th>Status</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in docs" :key="d.id" class="cursor-pointer hover:bg-gray-50" @click="open(d)">
            <td class="font-medium">{{ d.title ?? '-' }}</td>
            <td>v{{ d.files?.[0]?.version ?? '-' }}</td>
            <td>{{ new Date(d.createdAt).toLocaleDateString('id-ID') }}</td>
            <td>
              <StatusBadge :status="d.status" />
              <p v-if="d.status === 'DITOLAK' && d.note" class="mt-1 max-w-xs text-xs text-red-500">
                {{ d.note }}
              </p>
            </td>
            <td class="text-right">
              <button class="text-primary-600 hover:underline" @click.stop="download(d.id)">Lihat</button>
            </td>
          </tr>
          <tr v-if="docs.length === 0">
            <td colspan="5" class="py-4 text-center text-gray-400">{{ emptyText }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <Modal :open="!!activeId" :title="active?.title ?? 'Surat Pernyataan'" size="md" :busy="busy" @close="activeId = null">
      <template v-if="active">
        <div class="mb-4 space-y-1 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-500">Versi</span>
            <span>v{{ active.files?.[0]?.version ?? '-' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Tanggal</span>
            <span>{{ new Date(active.createdAt).toLocaleDateString('id-ID') }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Status</span>
            <StatusBadge :status="active.status" />
          </div>
          <div v-if="active.status === 'DITOLAK' && active.note" class="mt-2 bg-red-50 px-3 py-2 text-red-700">
            {{ active.note }}
          </div>
        </div>

        <div v-if="active.status === 'MENUNGGU_VERIFIKASI'">
          <label class="label">Catatan</label>
          <input v-model="noteInput" class="input" placeholder="Wajib bila tolak" />
        </div>
      </template>

      <template #footer>
        <button class="btn-secondary" @click="download(active!.id)">Lihat</button>
        <template v-if="active?.status === 'MENUNGGU_VERIFIKASI'">
          <button class="btn-danger" :disabled="busy" @click="verify('REJECT')">Tolak</button>
          <button class="btn-success" :disabled="busy" @click="verify('APPROVE')">
            <LoadingSpinner v-if="busy" inline />
            Setujui
          </button>
        </template>
      </template>
    </Modal>
  </div>
</template>

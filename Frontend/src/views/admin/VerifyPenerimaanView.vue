<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  documentService,
  downloadFile,
  type DocumentRecord,
  type DocumentGroupDetail,
} from '@/services/api.service';
import { useCohortStore } from '@/stores/cohort.store';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';
import StatusBadge from '@/components/StatusBadge.vue';

type DocWithGroup = DocumentRecord & { group: DocumentGroupDetail | null };

const docs = ref<DocumentRecord[]>([]);
const loading = ref(true);
const error = ref('');
const success = ref('');
const statusFilter = ref('MENUNGGU_VERIFIKASI');
const cohortStore = useCohortStore();
const activeId = ref<string | null>(null);
const noteInput = ref('');
const busy = ref(false);
const detail = ref<DocWithGroup | null>(null);
const loadingDetail = ref(false);
const detailError = ref('');

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
      'SURAT_PENERIMAAN',
      cohortStore.activeCohortId || undefined
    );
    docs.value = result.items;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const open = async (d: DocumentRecord): Promise<void> => {
  activeId.value = d.id;
  noteInput.value = '';
  detail.value = null;
  detailError.value = '';
  loadingDetail.value = true;
  try {
    detail.value = await documentService.getDetail(d.id);
  } catch (e) {
    detailError.value = extractErrorMessage(e);
  } finally {
    loadingDetail.value = false;
  }
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
    await downloadFile(`/documents/${id}/download`, `surat-penerimaan-${id}.pdf`);
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
            <th>Tanggal</th>
            <th>Status</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in docs" :key="d.id" class="cursor-pointer hover:bg-gray-50" @click="open(d)">
            <td class="font-medium">{{ d.title ?? '-' }}</td>
            <td>{{ new Date(d.createdAt).toLocaleDateString('id-ID') }}</td>
            <td>
              <StatusBadge :status="d.status" />
              <p v-if="d.status === 'DITOLAK' && d.note" class="mt-1 max-w-xs text-xs text-red-500">
                {{ d.note }}
              </p>
            </td>
            <td class="text-right">
              <button class="text-primary-600 hover:underline" @click.stop="open(d)">Detail</button>
            </td>
          </tr>
          <tr v-if="docs.length === 0">
            <td colspan="4" class="py-4 text-center text-gray-400">{{ emptyText }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <Modal :open="!!activeId" :title="active?.title ?? 'Surat Penerimaan'" size="lg" :busy="busy" @close="activeId = null">
      <template v-if="active">
        <div class="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span><span class="text-gray-500">Tanggal:</span> {{ new Date(active.createdAt).toLocaleDateString('id-ID') }}</span>
          <span class="flex items-center gap-2">
            <span class="text-gray-500">Status:</span>
            <StatusBadge :status="active.status" />
          </span>
        </div>
        <div v-if="active.status === 'DITOLAK' && active.note" class="mb-4 bg-red-50 px-3 py-2 text-sm text-red-700">
          {{ active.note }}
        </div>

        <div v-if="active.status === 'MENUNGGU_VERIFIKASI'" class="mb-4">
          <label class="label">Catatan</label>
          <input v-model="noteInput" class="input" placeholder="Wajib bila tolak" />
        </div>

        <div class="border-t border-gray-100 pt-4">
          <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Kelompok &amp; Perusahaan</div>

          <LoadingSpinner v-if="loadingDetail" />
          <div v-else-if="detailError" class="bg-red-50 px-3 py-2 text-sm text-red-700">{{ detailError }}</div>

          <template v-else-if="detail">
            <div class="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <b>{{ detail.group?.name ?? 'Kelompok belum terbentuk' }}</b>
              <span v-if="detail.group" class="text-gray-500">({{ detail.group.code }})</span>
              <span v-if="detail.group?.source === 'REGISTRATION'" class="badge bg-sky-100 text-sky-800">Fase 1</span>
              <span v-if="detail.group?.majorName" class="text-gray-500">· {{ detail.group.majorName }}</span>
            </div>

            <table v-if="detail.group && detail.group.members.length > 0" class="table mb-3">
              <thead>
                <tr>
                  <th class="w-8">#</th>
                  <th>Nama</th>
                  <th>NISN</th>
                  <th>Kelas</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(m, i) in detail.group.members" :key="m.userId">
                  <td>{{ i + 1 }}</td>
                  <td class="font-medium">
                    {{ m.fullName }}
                    <span v-if="m.isLeader" class="badge ml-1 bg-amber-100 text-amber-800">Ketua</span>
                  </td>
                  <td>{{ m.nisn ?? '-' }}</td>
                  <td>{{ m.className ?? '-' }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="mb-3 text-sm text-gray-400">Belum ada daftar anggota.</p>

            <div v-if="detail.group?.company" class="border border-gray-200 p-3 text-sm">
              <p class="mb-1 font-medium">{{ detail.group.company.name }}</p>
              <p class="text-gray-600">{{ detail.group.company.address ?? '-' }}</p>
              <p class="text-gray-600">
                {{ detail.group.company.city ?? '-' }}
                <template v-if="detail.group.company.industryName"> · {{ detail.group.company.industryName }}</template>
                <template v-if="detail.group.company.phone"> · {{ detail.group.company.phone }}</template>
              </p>
              <p v-if="detail.group.company.website" class="text-gray-600">{{ detail.group.company.website }}</p>
              <p v-if="detail.group.company.contacts?.length" class="text-gray-600">
                WA: {{ detail.group.company.contacts.join(', ') }}
              </p>
            </div>
            <p v-else class="text-sm text-gray-400">Perusahaan belum ditautkan.</p>
          </template>
        </div>
      </template>

      <template #footer>
        <button class="btn-secondary" @click="download(active!.id)">Unduh</button>
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

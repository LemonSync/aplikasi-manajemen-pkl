<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  documentService,
  downloadFile,
  type DocumentRecord,
  type DocumentPlacement,
} from '@/services/api.service';
import { useCohortStore } from '@/stores/cohort.store';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';
import StatusBadge from '@/components/StatusBadge.vue';

const docs = ref<DocumentRecord[]>([]);
const cohortStore = useCohortStore();
const loading = ref(true);
const error = ref('');
const success = ref('');
const filterStatus = ref('MENUNGGU_VERIFIKASI');
const filterType = ref('');
const search = ref('');
const activeId = ref<string | null>(null);
const noteInput = ref('');
const busy = ref(false);
const detail = ref<(DocumentRecord & { placement: DocumentPlacement | null }) | null>(null);
const loadingDetail = ref(false);
const detailError = ref('');

const TYPE_LABELS: Record<string, string> = {
  SURAT_PENERIMAAN: 'Surat Penerimaan',
  SURAT_PERNYATAAN: 'Surat Pernyataan',
  LAPORAN_AKHIR: 'Laporan Akhir',
  SURAT_PERMOHONAN: 'Surat Permohonan',
  LAINNYA: 'Lainnya',
};

const active = computed<DocumentRecord | null>(
  () => docs.value.find((d) => d.id === activeId.value) ?? null
);

/** Cari judul/jenis dokumen (FE-side, daftar sudah difilter server). */
const filteredDocs = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return docs.value;
  return docs.value.filter((d) =>
    [d.title ?? '', TYPE_LABELS[d.type] ?? d.type, d.type, d.note ?? ''].join(' ').toLowerCase().includes(q)
  );
});

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    const result = await documentService.list(
      filterStatus.value || undefined,
      filterType.value || undefined,
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
    success.value = action === 'APPROVE' ? 'Disetujui.' : 'Ditolak.';
    activeId.value = null;
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    busy.value = false;
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
    <div v-if="error" class="bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <div class="card">
      <div class="mb-4">
        <h2 class="text-lg font-semibold text-gray-800">Verifikasi Dokumen</h2>
        <p class="text-sm text-gray-500">
          Satu tempat memeriksa semua dokumen siswa: Surat Penerimaan, Surat Pernyataan, Laporan Akhir, dan berkas lain.
        </p>
      </div>

      <div class="mb-4 flex flex-wrap items-center gap-3">
        <input
          v-model="search"
          class="input min-w-64 flex-1"
          type="search"
          placeholder="Cari judul atau jenis dokumen…"
        />
        <div class="flex items-center gap-2">
          <label class="label mb-0">Jenis</label>
          <select v-model="filterType" class="input w-auto" @change="load">
            <option value="">Semua Jenis</option>
            <option value="SURAT_PENERIMAAN">Surat Penerimaan (balasan DUDI)</option>
            <option value="SURAT_PERNYATAAN">Surat Pernyataan (bermaterai)</option>
            <option value="LAPORAN_AKHIR">Laporan Akhir siswa</option>
            <option value="LAINNYA">Lainnya</option>
          </select>
        </div>
        <div class="flex items-center gap-2">
          <label class="label mb-0">Status</label>
          <select v-model="filterStatus" class="input w-auto" @change="load">
            <option value="">Semua</option>
            <option value="MENUNGGU_VERIFIKASI">Menunggu</option>
            <option value="DISETUJUI">Disetujui</option>
            <option value="DITOLAK">Ditolak</option>
          </select>
        </div>
      </div>

      <SkeletonTable v-if="loading" :rows="6" :cols="4" />
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
          <tr v-for="d in filteredDocs" :key="d.id" class="cursor-pointer hover:bg-gray-50" @click="open(d)">
            <td>{{ TYPE_LABELS[d.type] ?? d.type }}</td>
            <td>{{ d.title ?? '-' }}</td>
            <td>
              <StatusBadge :status="d.status" />
              <p v-if="d.status === 'DITOLAK' && d.note" class="mt-1 max-w-xs text-xs text-red-500">
                {{ d.note }}
              </p>
            </td>
            <td class="text-right">
              <button class="text-primary-600 hover:underline" @click.stop="download(d.id)">Unduh</button>
            </td>
          </tr>
          <tr v-if="filteredDocs.length === 0">
            <td colspan="4" class="py-4 text-center text-gray-400">
              {{ search.trim() ? 'Tidak ada dokumen yang cocok dengan pencarian.' : 'Tidak ada data.' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Modal :open="!!activeId" :title="active?.title ?? 'Dokumen'" size="lg" :busy="busy" @close="activeId = null">
      <template v-if="active">
        <div class="mb-4 space-y-1 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-500">Jenis</span>
            <span class="font-medium">{{ TYPE_LABELS[active.type] ?? active.type }}</span>
          </div>
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

        <!-- Penempatan pemilik dokumen: siswa, perusahaan, pembimbing -->
        <div class="mt-4 border-t border-gray-100 pt-4">
          <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Penempatan Dokumen</div>
          <LoadingSpinner v-if="loadingDetail" />
          <div v-else-if="detailError" class="bg-red-50 px-3 py-2 text-sm text-red-700">{{ detailError }}</div>
          <template v-else-if="detail">
            <div v-if="detail.placement" class="space-y-3">
              <!-- Siswa pemilik dokumen -->
              <div class="border border-gray-200 p-3 text-sm">
                <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Siswa</p>
                <p class="font-medium">
                  {{ detail.placement.student.fullName ?? detail.placement.student.username }}
                </p>
                <p class="text-gray-600">
                  <span class="font-mono">{{ detail.placement.student.username }}</span>
                  <template v-if="detail.placement.student.nisn"> · NISN {{ detail.placement.student.nisn }}</template>
                  <template v-if="detail.placement.student.className"> · {{ detail.placement.student.className }}</template>
                </p>
                <p class="flex flex-wrap items-center gap-2 text-gray-600">
                  Kode pendaftaran: <span class="font-mono">{{ detail.placement.code }}</span>
                  <StatusBadge :status="detail.placement.status" />
                </p>
                <p v-if="detail.placement.majorName" class="text-gray-600">
                  Jurusan: {{ detail.placement.majorName }}
                </p>
              </div>

              <!-- Perusahaan tempat PKL -->
              <div v-if="detail.placement.company" class="border border-gray-200 p-3 text-sm">
                <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Perusahaan</p>
                <p class="font-medium">{{ detail.placement.company.name }}</p>
                <p class="text-gray-600">{{ detail.placement.company.address ?? '-' }}</p>
                <p class="text-gray-600">
                  {{ detail.placement.company.city ?? '-' }}
                  <template v-if="detail.placement.company.industryName"> · {{ detail.placement.company.industryName }}</template>
                </p>
                <p v-if="detail.placement.company.phone" class="text-gray-600">
                  Telp: {{ detail.placement.company.phone }}
                </p>
              </div>
              <p v-else class="text-sm text-gray-400">Perusahaan belum ditautkan.</p>

              <!-- Guru pembimbing -->
              <div class="border border-gray-200 p-3 text-sm">
                <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Guru Pembimbing</p>
                <p v-if="detail.placement.supervisorName" class="font-medium">
                  {{ detail.placement.supervisorName }}
                </p>
                <p v-else class="text-gray-400">Belum ada pembimbing.</p>
              </div>
            </div>
            <p v-else class="text-sm text-gray-400">Penempatan tidak tersedia untuk dokumen ini.</p>
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

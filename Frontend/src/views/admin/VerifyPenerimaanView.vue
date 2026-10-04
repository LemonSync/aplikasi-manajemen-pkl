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
import StatusBadge from '@/components/StatusBadge.vue';

type DocWithGroup = DocumentRecord & { group: DocumentGroupDetail | null };

const docs = ref<DocumentRecord[]>([]);
const loading = ref(true);
const error = ref('');
const success = ref('');
const noteFor = ref<Record<string, string>>({});
const detailFor = ref<string | null>(null);
const detail = ref<DocWithGroup | null>(null);
const loadingDetail = ref(false);
const detailError = ref('');
const statusFilter = ref('MENUNGGU_VERIFIKASI');
const cohortStore = useCohortStore();

const emptyText = computed(() => {
  switch (statusFilter.value) {
    case 'MENUNGGU_VERIFIKASI':
      return 'Tidak ada surat penerimaan yang menunggu verifikasi.';
    case 'DISETUJUI':
      return 'Belum ada surat penerimaan yang disetujui.';
    case 'DITOLAK':
      return 'Belum ada surat penerimaan yang ditolak.';
    default:
      return 'Belum ada surat penerimaan.';
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
    success.value = `Surat Penerimaan ${action === 'APPROVE' ? 'disetujui' : 'ditolak'}.`;
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

const download = async (id: string, filename?: string): Promise<void> => {
  try {
    await downloadFile(`/documents/${id}/download`, filename ?? 'surat-penerimaan.pdf');
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

const openDetail = async (d: DocumentRecord): Promise<void> => {
  detailFor.value = d.id;
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

const closeDetail = (): void => {
  detailFor.value = null;
  detail.value = null;
  detailError.value = '';
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
      <h2 class="mb-2 text-lg font-semibold text-gray-800">Verifikasi Surat Penerimaan PKL</h2>
      <p class="mb-4 text-sm text-gray-500">Surat balasan dari perusahaan yang menyatakan bersedia menerima siswa PKL.</p>

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
            <th>Tanggal Upload</th>
            <th>Status</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in docs" :key="d.id">
            <td class="font-medium">{{ d.title ?? '-' }}</td>
            <td>{{ d.type }}</td>
            <td>{{ new Date(d.createdAt).toLocaleDateString('id-ID') }}</td>
            <td>
              <StatusBadge :status="d.status" />
              <p v-if="d.status === 'DITOLAK' && d.note" class="mt-1 max-w-xs text-xs text-red-500">
                Alasan: {{ d.note }}
              </p>
            </td>
            <td class="text-right">
              <button class="text-primary-600 hover:underline" @click="openDetail(d)">Detail</button>
              <span class="mx-1 text-gray-300">|</span>
              <button class="text-primary-600 hover:underline" @click="download(d.id, `surat-penerimaan-${d.id}.pdf`)">Lihat</button>
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
            <td colspan="5" class="py-4 text-center text-gray-400">{{ emptyText }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal Detail: daftar siswa + data perusahaan + unduh surat -->
    <div v-if="detailFor" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div class="card max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-800">Detail Surat Penerimaan</h3>
          <button class="text-gray-400 hover:text-gray-600" @click="closeDetail">&times;</button>
        </div>

        <div v-if="loadingDetail" class="text-sm text-gray-500">Memuat detail...</div>
        <div v-else-if="detailError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ detailError }}</div>

        <template v-else-if="detail">
          <div class="rounded-lg bg-gray-50 p-3 text-sm">
            <p>
              <span class="text-gray-500">Kelompok:</span>
              <b>{{ detail.group?.name ?? '-' }}</b>
              <span v-if="detail.group" class="text-gray-500">({{ detail.group.code }})</span>
              <span
                v-if="detail.group?.source === 'REGISTRATION'"
                class="badge ml-2 bg-sky-100 text-sky-800"
              >Fase 1</span>
            </p>
            <p v-if="detail.group?.majorName">
              <span class="text-gray-500">Jurusan:</span> {{ detail.group.majorName }}
            </p>
            <p><span class="text-gray-500">Tanggal Upload:</span> {{ new Date(detail.createdAt).toLocaleDateString('id-ID') }}</p>
            <p v-if="detail.group?.source === 'REGISTRATION'" class="mt-1 text-xs text-gray-400">
              Kelompok dibentuk setelah surat penerimaan disetujui — data ditampilkan dari pendaftaran Fase 1.
            </p>
          </div>

          <div>
            <h4 class="mb-2 text-sm font-semibold text-gray-700">Daftar Siswa Anggota</h4>
            <p v-if="!detail.group || detail.group.members.length === 0" class="text-sm text-gray-400">
              Kelompok belum terbentuk untuk dokumen ini.
            </p>
            <table v-else class="table">
              <thead>
                <tr>
                  <th class="w-8">#</th>
                  <th>Nama Siswa</th>
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
          </div>

          <div>
            <h4 class="mb-2 text-sm font-semibold text-gray-700">Data Perusahaan Tempat PKL</h4>
            <p v-if="!detail.group?.company" class="text-sm text-gray-400">
              Perusahaan belum ditautkan ke kelompok ini.
            </p>
            <div v-else class="rounded-lg border border-gray-200 p-3 text-sm">
              <p><span class="text-gray-500">Nama:</span> <b>{{ detail.group.company.name }}</b></p>
              <p><span class="text-gray-500">Alamat:</span> {{ detail.group.company.address ?? '-' }}</p>
              <p><span class="text-gray-500">Kota:</span> {{ detail.group.company.city ?? '-' }}</p>
              <p><span class="text-gray-500">Industri:</span> {{ detail.group.company.industryName ?? '-' }}</p>
              <p><span class="text-gray-500">Telepon:</span> {{ detail.group.company.phone ?? '-' }}</p>
              <p><span class="text-gray-500">Email:</span> {{ detail.group.company.email ?? '-' }}</p>
              <p><span class="text-gray-500">Website:</span> {{ detail.group.company.website ?? '-' }}</p>
              <p>
                <span class="text-gray-500">Kontak WA:</span>
                {{ detail.group.company.contacts?.length ? detail.group.company.contacts.join(', ') : '-' }}
              </p>
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <button class="btn-secondary" @click="closeDetail">Tutup</button>
            <button
              class="btn-primary"
              @click="download(detail.id, `surat-penerimaan-${detail.id}.pdf`)"
            >
              Unduh Surat
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { registrationService, type GroupedRegistration } from '@/services/api.service';
import { useCohortStore } from '@/stores/cohort.store';
import { extractErrorMessage } from '@/services/http';
import StatusBadge from '@/components/StatusBadge.vue';

const groups = ref<GroupedRegistration[]>([]);
const loading = ref(true);
const error = ref('');
const success = ref('');

// Filter gelombang: mengikuti konteks global di header (cohortStore).
const cohortStore = useCohortStore();

const showDetail = ref(false);
const detailGroup = ref<GroupedRegistration | null>(null);

const rejectingId = ref<string | null>(null);
const rejectNote = ref('');

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    groups.value = await registrationService.grouped(cohortStore.activeCohortId || undefined);
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const openDetail = (g: GroupedRegistration): void => {
  detailGroup.value = g;
  rejectingId.value = null;
  rejectNote.value = '';
  showDetail.value = true;
};

const closeDetail = (): void => {
  showDetail.value = false;
  detailGroup.value = null;
  rejectingId.value = null;
  rejectNote.value = '';
};

const doReview = async (regId: string, action: 'APPROVE' | 'REJECT', note?: string): Promise<void> => {
  error.value = '';
  success.value = '';
  try {
    await registrationService.review(regId, action, note);
    success.value = `Pendaftaran ${action === 'APPROVE' ? 'disetujui' : 'ditolak'}.`;
    rejectingId.value = null;
    rejectNote.value = '';
    await load();
    if (detailGroup.value) {
      const fresh = groups.value.find((g) => g.groupName === detailGroup.value!.groupName);
      if (fresh) detailGroup.value = fresh;
    }
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

const approve = (regId: string): Promise<void> => doReview(regId, 'APPROVE');

const startReject = (regId: string): void => {
  rejectingId.value = regId;
  rejectNote.value = '';
  error.value = '';
};

const cancelReject = (): void => {
  rejectingId.value = null;
  rejectNote.value = '';
};

const submitReject = (regId: string): Promise<void> => {
  if (!rejectNote.value.trim()) {
    error.value = 'Alasan penolakan wajib diisi.';
    return Promise.resolve();
  }
  return doReview(regId, 'REJECT', rejectNote.value.trim());
};

onMounted(async () => {
  await cohortStore.ensureLoaded();
  await load();
});

watch(
  () => cohortStore.activeCohortId,
  () => {
    closeDetail();
    void load();
  }
);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <div class="card">
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-gray-800">Pendaftaran per Kelompok</h2>
          <p class="text-sm text-gray-500">
            Pendaftaran digrup otomatis berdasarkan nama kelompok yang sama. Klik Detail untuk melihat data
            identitas (NISN, nama, no. HP, kelas) dan tempat PKL yang diisi akun ketua saat Fase 1.
            Data mengikuti gelombang yang dipilih di header.
          </p>
        </div>
      </div>

      <div v-if="loading" class="text-sm text-gray-500">Memuat...</div>
      <table v-else class="table">
        <thead>
          <tr>
            <th>Nama Kelompok</th>
            <th>Perusahaan</th>
            <th>Jumlah</th>
            <th>Status</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in groups" :key="g.groupName">
            <td class="font-medium">{{ g.groupName }}</td>
            <td>{{ g.companyName }}</td>
            <td>{{ g.approvedCount }}/{{ g.totalCount }} disetujui</td>
            <td>
              <span v-if="g.approvedCount === g.totalCount" class="text-xs font-medium text-emerald-600">Lengkap</span>
              <span v-else-if="g.approvedCount > 0" class="text-xs font-medium text-amber-600">Sebagian</span>
              <span v-else class="text-xs text-gray-400">Menunggu</span>
            </td>
            <td class="text-right">
              <button class="text-primary-600 hover:underline" @click="openDetail(g)">Detail</button>
            </td>
          </tr>
          <tr v-if="groups.length === 0">
            <td colspan="5" class="py-4 text-center text-gray-400">Belum ada pendaftaran.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal Detail Kelompok -->
    <div v-if="showDetail && detailGroup" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div class="card mx-4 max-h-[85vh] w-full max-w-4xl space-y-4 overflow-y-auto">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-800">Detail Kelompok: {{ detailGroup.groupName }}</h3>
          <button class="text-gray-400 hover:text-gray-600" @click="closeDetail">&times;</button>
        </div>

        <!-- Tempat PKL (diisi ketua saat Fase 1) -->
        <div class="rounded-lg bg-gray-50 p-3">
          <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Tempat PKL (Fase 1)</h4>
          <div class="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            <div><span class="text-gray-500">Perusahaan:</span> {{ detailGroup.companyName }}</div>
            <div><span class="text-gray-500">Kota:</span> {{ detailGroup.companyCity ?? '-' }}</div>
            <div class="sm:col-span-2"><span class="text-gray-500">Alamat:</span> {{ detailGroup.companyAddress }}</div>
            <div><span class="text-gray-500">Bidang Industri:</span> {{ detailGroup.companyIndustry ?? '-' }}</div>
            <div><span class="text-gray-500">Telepon Perusahaan:</span> {{ detailGroup.companyPhone ?? '-' }}</div>
            <div><span class="text-gray-500">Website:</span> {{ detailGroup.companyWebsite ?? '-' }}</div>
            <div>
              <span class="text-gray-500">Kontak (WA):</span>
              {{ detailGroup.companyContacts && detailGroup.companyContacts.length > 0 ? detailGroup.companyContacts.join(', ') : '-' }}
            </div>
            <div><span class="text-gray-500">Jurusan:</span> {{ detailGroup.majorName ?? '-' }}</div>
            <div><span class="text-gray-500">Gelombang:</span> {{ detailGroup.cohortName ?? '-' }}</div>
          </div>
        </div>

        <!-- Per pendaftaran: identitas anggota + aksi verifikasi -->
        <div
          v-for="r in detailGroup.registrations"
          :key="r.id"
          class="rounded-lg border border-gray-200 p-3"
        >
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <span class="font-mono text-xs text-gray-500">{{ r.code }}</span>
              <span class="font-medium text-gray-700">Pengaju: {{ r.leaderName }}</span>
              <StatusBadge :status="r.status" />
              <span class="text-xs text-gray-400">
                diajukan {{ new Date(r.createdAt).toLocaleDateString('id-ID') }}
              </span>
            </div>
            <div class="flex items-center gap-2 text-sm">
              <template v-if="r.status === 'DIAJUKAN' && rejectingId !== r.id">
                <button class="text-emerald-600 hover:underline" @click="approve(r.id)">Setujui</button>
                <span class="text-gray-300">|</span>
                <button class="text-red-600 hover:underline" @click="startReject(r.id)">Tolak</button>
              </template>
              <span v-else-if="r.status !== 'DIAJUKAN'" class="text-xs text-gray-400">Sudah ditinjau</span>
            </div>
          </div>

          <div v-if="rejectingId === r.id" class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start">
            <textarea
              v-model="rejectNote"
              rows="2"
              class="input flex-1"
              placeholder="Alasan penolakan (wajib diisi)"
            ></textarea>
            <div class="flex gap-2">
              <button class="btn-danger" @click="submitReject(r.id)">Kirim Tolak</button>
              <button class="btn-secondary" @click="cancelReject">Batal</button>
            </div>
          </div>

          <h4 class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Anggota Kelompok ({{ r.members.length }})
          </h4>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-gray-500">
                <th class="pb-1">NISN</th>
                <th class="pb-1">Nama</th>
                <th class="pb-1">Kelas</th>
                <th class="pb-1">No. HP</th>
                <th class="pb-1">Alamat</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in r.members" :key="m.id ?? `${m.nisn}-${m.fullName}`" class="border-t border-gray-100">
                <td class="py-1.5 font-mono text-xs">{{ m.nisn ?? '-' }}</td>
                <td class="py-1.5">
                  {{ m.fullName }}
                  <span
                    v-if="m.isLeader"
                    class="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                  >Ketua</span>
                </td>
                <td class="py-1.5">{{ m.className ?? '-' }}</td>
                <td class="whitespace-nowrap py-1.5">{{ m.phone ?? '-' }}</td>
                <td class="py-1.5 text-gray-500">{{ m.address ?? '-' }}</td>
              </tr>
              <tr v-if="r.members.length === 0">
                <td colspan="5" class="py-2 text-center text-gray-400">Tidak ada data anggota.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

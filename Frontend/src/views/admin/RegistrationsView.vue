<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { registrationService, type Registration } from '@/services/api.service';
import { useCohortStore } from '@/stores/cohort.store';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import { notify } from '@/composables/useNotify';

const loading = ref(true);

// Filter gelombang: mengikuti konteks global di header (cohortStore).
const cohortStore = useCohortStore();

// Filter status tinjauan. Default: belum ditinjau (menunggu verifikasi).
type StatusFilter = 'DIAJUKAN' | 'DISETUJUI' | 'DITOLAK' | 'SEMUA';
const statusFilter = ref<StatusFilter>('DIAJUKAN');
const search = ref('');

const FILTER_TABS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'DIAJUKAN', label: 'Belum Ditinjau' },
  { value: 'DISETUJUI', label: 'Disetujui' },
  { value: 'DITOLAK', label: 'Ditolak' },
  { value: 'SEMUA', label: 'Semua' },
];

const EMPTY_TEXT: Record<StatusFilter, string> = {
  DIAJUKAN: 'Tidak ada pendaftaran yang menunggu ditinjau.',
  DISETUJUI: 'Belum ada pendaftaran yang disetujui.',
  DITOLAK: 'Tidak ada pendaftaran yang ditolak.',
  SEMUA: 'Belum ada pendaftaran.',
};

// Batas baris per permintaan server (parser backend juga memotong di 100).
const MAX_ROWS = 100;

// Daftar pendaftaran flat per tab status + jumlah total per status (meta.total).
const itemsByStatus = ref<Record<StatusFilter, Registration[]>>({
  DIAJUKAN: [],
  DISETUJUI: [],
  DITOLAK: [],
  SEMUA: [],
});
const counts = ref<Record<StatusFilter, number>>({ DIAJUKAN: 0, DISETUJUI: 0, DITOLAK: 0, SEMUA: 0 });

const studentName = (r: Registration): string =>
  r.student?.studentProfile?.fullName ?? r.student?.username ?? '-';

const fmtDate = (v?: string | null): string =>
  v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const load = async (): Promise<void> => {
  loading.value = true;
  notify.clear();
  try {
    const cohortId = cohortStore.activeCohortId || undefined;
    // perPage = batas server: pencarian di bawah menyaring hasil di sisi klien,
    // jadi ambil sebanyak mungkin agar siswa yang antre duluan tidak terpotong.
    const [dDiajukan, dDisetujui, dDitolak, dSemua] = await Promise.all([
      registrationService.list('DIAJUKAN', cohortId, MAX_ROWS),
      registrationService.list('DISETUJUI', cohortId, MAX_ROWS),
      registrationService.list('DITOLAK', cohortId, MAX_ROWS),
      registrationService.list(undefined, cohortId, MAX_ROWS),
    ]);
    itemsByStatus.value = {
      DIAJUKAN: dDiajukan.items,
      DISETUJUI: dDisetujui.items,
      DITOLAK: dDitolak.items,
      SEMUA: dSemua.items,
    };
    counts.value = {
      DIAJUKAN: dDiajukan.meta?.total ?? dDiajukan.items.length,
      DISETUJUI: dDisetujui.meta?.total ?? dDisetujui.items.length,
      DITOLAK: dDitolak.meta?.total ?? dDitolak.items.length,
      SEMUA: dSemua.meta?.total ?? dSemua.items.length,
    };
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    loading.value = false;
  }
};

/** Pendaftaran sesuai tab status + pencarian (FE-side). */
const filteredRegs = computed<Registration[]>(() => {
  const q = search.value.trim().toLowerCase();
  const list = itemsByStatus.value[statusFilter.value];
  if (!q) return list;
  return list.filter((r) =>
    [
      r.code,
      studentName(r),
      r.student?.studentProfile?.nisn ?? '',
      r.company?.name ?? '',
      r.major?.name ?? r.major?.code ?? '',
    ]
      .join(' ')
      .toLowerCase()
      .includes(q)
  );
});

// --- Tinjauan: setujui / tolak ---
const rejecting = ref<Registration | null>(null);
const rejectNote = ref('');
const approving = ref<Registration | null>(null);
const letterNumber = ref('');
const reviewing = ref(false);

const doReview = async (
  regId: string,
  action: 'APPROVE' | 'REJECT',
  note?: string,
  number?: string | null
): Promise<void> => {
  notify.clear();
  reviewing.value = true;
  try {
    await registrationService.review(regId, action, note, number);
    notify.success(`Pendaftaran ${action === 'APPROVE' ? 'disetujui' : 'ditolak'}.`);
    rejecting.value = null;
    rejectNote.value = '';
    approving.value = null;
    letterNumber.value = '';
    await load();
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    reviewing.value = false;
  }
};

const startApprove = (reg: Registration): void => {
  approving.value = reg;
  letterNumber.value = '';
  notify.clear();
};

const cancelApprove = (): void => {
  approving.value = null;
  letterNumber.value = '';
};

const submitApprove = (): Promise<void> => {
  if (!approving.value) return Promise.resolve();
  const number = letterNumber.value.trim();
  if (number.length > 80) {
    notify.error('Nomor surat maksimal 80 karakter.');
    return Promise.resolve();
  }
  return doReview(approving.value.id, 'APPROVE', undefined, number || null);
};

const startReject = (reg: Registration): void => {
  rejecting.value = reg;
  rejectNote.value = '';
  notify.clear();
};

const cancelReject = (): void => {
  rejecting.value = null;
  rejectNote.value = '';
};

const submitReject = (): Promise<void> => {
  if (!rejecting.value) return Promise.resolve();
  if (!rejectNote.value.trim()) {
    notify.error('Alasan penolakan wajib diisi.');
    return Promise.resolve();
  }
  return doReview(rejecting.value.id, 'REJECT', rejectNote.value.trim());
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

    <div class="card">
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div class="flex flex-1 flex-wrap items-end gap-3">
          <div>
            <h2 class="text-lg font-semibold text-gray-800">Pendaftaran Siswa</h2>
            <p class="text-sm text-gray-500">
              Satu baris untuk satu pendaftaran (per siswa), diurutkan dari yang paling awal mengajukan.
              Ajuan ulang setelah ditolak otomatis kembali ke belakang antrean.
            </p>
          </div>
          <input
            v-model="search"
            class="input ml-auto w-72"
            type="search"
            placeholder="Cari kode, nama siswa, NISN, perusahaan…"
          />
        </div>

        <!-- Filter status tinjauan -->
        <div class="flex flex-wrap gap-1 border border-gray-200 p-1">
          <button
            v-for="tab in FILTER_TABS"
            :key="tab.value"
            class="px-3 py-1.5 text-xs font-semibold transition"
            :class="
              statusFilter === tab.value
                ? 'bg-primary-600 text-white'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            "
            @click="statusFilter = tab.value"
          >
            {{ tab.label }}
            <span
              class="ml-1 font-mono"
              :class="statusFilter === tab.value ? 'text-primary-100' : 'text-gray-400'"
            >
              {{ counts[tab.value] }}
            </span>
          </button>
        </div>
      </div>

      <div v-if="loading" class="loading" />
      <table v-else class="table">
        <thead>
          <tr>
            <th>Kode</th>
            <th>Nama Siswa</th>
            <th>Perusahaan</th>
            <th>Jurusan</th>
            <th>Status</th>
            <th>Diajukan</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in filteredRegs" :key="r.id">
            <td class="font-mono text-xs text-gray-500">{{ r.code }}</td>
            <td class="font-medium">
              {{ studentName(r) }}
              <p v-if="r.student?.studentProfile?.nisn" class="font-mono text-xs text-gray-400">
                {{ r.student.studentProfile.nisn }}
              </p>
            </td>
            <td>
              <span :class="r.company ? '' : 'text-amber-600'">{{ r.company?.name ?? 'Perusahaan dihapus' }}</span>
            </td>
            <td>{{ r.major?.name ?? r.major?.code ?? '-' }}</td>
            <td><StatusBadge :status="r.status" /></td>
            <td class="whitespace-nowrap text-sm">{{ fmtDate(r.submittedAt) }}</td>
            <td class="text-right">
              <template v-if="r.status === 'DIAJUKAN'">
                <button class="text-sm text-emerald-600 hover:underline" @click="startApprove(r)">Setujui</button>
                <span class="mx-1 text-gray-300">|</span>
                <button class="text-sm text-red-600 hover:underline" @click="startReject(r)">Tolak</button>
              </template>
              <span v-else class="text-xs text-gray-400">Sudah ditinjau</span>
            </td>
          </tr>
          <tr v-if="filteredRegs.length === 0 && !loading">
            <td colspan="7" class="py-4 text-center text-gray-400">
              {{ search.trim() ? 'Tidak ada pendaftaran yang cocok dengan pencarian.' : EMPTY_TEXT[statusFilter] }}
            </td>
          </tr>
        </tbody>
      </table>

      <p
        v-if="!loading && counts[statusFilter] > itemsByStatus[statusFilter].length"
        class="mt-2 text-xs text-gray-400"
      >
        Menampilkan {{ itemsByStatus[statusFilter].length }} tertua dari
        {{ counts[statusFilter] }} pendaftaran — persempit dengan filter status atau gelombang.
      </p>
    </div>

    <!-- Modal Persetujuan: nomor Surat Permohonan diisi manual (opsional) -->
    <Modal
      :open="!!approving"
      title="Setujui Pendaftaran"
      size="md"
      :busy="reviewing"
      @close="cancelApprove"
    >
      <template v-if="approving">
        <p class="mb-3 text-sm text-gray-600">
          Pendaftaran <span class="font-mono">{{ approving.code }}</span> milik
          <strong>{{ studentName(approving) }}</strong>
          ({{ approving.company?.name ?? 'perusahaan sudah dihapus' }}). Surat Permohonan akan diterbitkan
          setelah disetujui.
        </p>
        <label class="label" for="approve-number">Nomor Surat Permohonan (opsional)</label>
        <input
          id="approve-number"
          v-model="letterNumber"
          class="input font-mono"
          maxlength="80"
          placeholder="421/123/SMKN-9MDN/2026"
        />
        <p class="mt-1 text-xs text-gray-500">
          Kosongkan bila nomor belum tersedia — surat tetap terbit tanpa nomor.
        </p>
      </template>
      <template #footer>
        <button class="btn-secondary" :disabled="reviewing" @click="cancelApprove">Batal</button>
        <button class="btn-success" :disabled="reviewing" @click="submitApprove">
          <LoadingSpinner v-if="reviewing" inline />
          {{ reviewing ? 'Menyetujui…' : 'Setujui & Terbitkan Surat' }}
        </button>
      </template>
    </Modal>

    <!-- Modal Penolakan -->
    <Modal
      :open="!!rejecting"
      title="Tolak Pendaftaran"
      size="md"
      :busy="reviewing"
      @close="cancelReject"
    >
      <template v-if="rejecting">
        <p class="mb-3 text-sm text-gray-600">
          Pendaftaran <span class="font-mono">{{ rejecting.code }}</span> milik
          <strong>{{ studentName(rejecting) }}</strong> ({{ rejecting.company?.name ?? 'perusahaan sudah dihapus' }}).
        </p>
        <label class="label">Alasan Penolakan</label>
        <textarea
          v-model="rejectNote"
          rows="3"
          class="input"
          placeholder="Alasan penolakan (wajib diisi)"
        ></textarea>
      </template>
      <template #footer>
        <button class="btn-secondary" :disabled="reviewing" @click="cancelReject">Batal</button>
        <button class="btn-danger" :disabled="reviewing || !rejectNote.trim()" @click="submitReject">
          <LoadingSpinner v-if="reviewing" inline />
          {{ reviewing ? 'Mengirim…' : 'Kirim Tolak' }}
        </button>
      </template>
    </Modal>
  </div>
</template>

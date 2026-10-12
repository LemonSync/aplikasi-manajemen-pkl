<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { attendanceService, type AttendanceRecord } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import type { PaginationMeta } from '@/types';
import Modal from '@/components/Modal.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';

/**
 * Verifikasi absensi siswa bimbingan.
 * Backend otomatis membatasi daftar absensi ke siswa bimbingan guru yang login.
 */
const rows = ref<AttendanceRecord[]>([]);
const meta = ref<PaginationMeta | undefined>(undefined);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');

const page = ref(1);
const perPage = 10;
const statusFilter = ref('');
const from = ref('');
const to = ref('');

// Modal verifikasi
const verifyTarget = ref<AttendanceRecord | null>(null);
const verifyAction = ref<'APPROVE' | 'REJECT'>('APPROVE');
const verifyNote = ref('');

const STATUS_OPTIONS = [
  { value: 'HADIR', label: 'Hadir' },
  { value: 'IZIN', label: 'Izin' },
  { value: 'SAKIT', label: 'Sakit' },
  { value: 'ALPHA', label: 'Alpha' },
];

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    const res = await attendanceService.list({
      page: page.value,
      perPage,
      status: statusFilter.value || undefined,
      from: from.value || undefined,
      to: to.value || undefined,
    });
    rows.value = res.items;
    meta.value = res.meta;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const applyFilter = (): void => {
  page.value = 1;
  void load();
};

const goPage = (p: number): void => {
  if (p < 1) return;
  if (meta.value && p > meta.value.totalPages) return;
  page.value = p;
  void load();
};

const studentName = (r: AttendanceRecord): string =>
  r.user?.studentProfile?.fullName ?? r.user?.username ?? '-';

const fmtDate = (v?: string | null): string => (v ? new Date(v).toLocaleDateString('id-ID') : '-');
const fmtTime = (v?: string | null): string => (v ? new Date(v).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-');

const openVerify = (action: 'APPROVE' | 'REJECT', row: AttendanceRecord): void => {
  verifyTarget.value = row;
  verifyAction.value = action;
  verifyNote.value = '';
  error.value = '';
};

const closeVerify = (): void => {
  if (saving.value) return;
  verifyTarget.value = null;
  verifyNote.value = '';
};

const submitVerify = async (): Promise<void> => {
  const target = verifyTarget.value;
  if (!target) return;
  // Backend mewajibkan alasan saat penolakan.
  if (verifyAction.value === 'REJECT' && !verifyNote.value.trim()) {
    error.value = 'Alasan penolakan wajib diisi.';
    return;
  }
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    await attendanceService.verify(
      target.id,
      verifyAction.value,
      verifyNote.value.trim() || undefined
    );
    success.value = verifyAction.value === 'APPROVE' ? 'Absensi disetujui.' : 'Absensi ditolak.';
    verifyTarget.value = null;
    verifyNote.value = '';
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

const totalPages = (): number => meta.value?.totalPages ?? 1;

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <div class="card">
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-gray-800">Verifikasi Absensi</h2>
          <p class="text-sm text-gray-500">Absensi harian seluruh siswa yang berada dalam bimbingan Anda.</p>
        </div>
        <div class="flex flex-wrap items-end gap-2">
          <div>
            <label class="label">Status</label>
            <select v-model="statusFilter" class="input w-auto" @change="applyFilter">
              <option value="">Semua</option>
              <option v-for="s in STATUS_OPTIONS" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
          </div>
          <div>
            <label class="label">Dari</label>
            <input v-model="from" type="date" class="input w-auto" @change="applyFilter" />
          </div>
          <div>
            <label class="label">Sampai</label>
            <input v-model="to" type="date" class="input w-auto" @change="applyFilter" />
          </div>
          <button class="btn-secondary" @click="applyFilter">Terapkan</button>
        </div>
      </div>

      <SkeletonTable v-if="loading" :rows="6" :cols="9" />
      <table v-else class="table">
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Siswa</th>
            <th>Status</th>
            <th>Kegiatan</th>
            <th>Check-in</th>
            <th>Check-out</th>
            <th>Anomali</th>
            <th>Verifikasi</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td>{{ fmtDate(r.date) }}</td>
            <td class="font-medium text-gray-800">{{ studentName(r) }}</td>
            <td><span class="badge" :class="r.status === 'HADIR' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'">{{ r.status }}</span></td>
            <td class="max-w-xs truncate">{{ r.activity ?? '-' }}</td>
            <td>{{ fmtTime(r.checkInAt) }}</td>
            <td>{{ fmtTime(r.checkOutAt) }}</td>
            <td>
              <span v-if="r.isAnomaly" class="text-xs text-amber-600" :title="r.anomalyNote ?? ''">
                {{ r.anomalyNote ?? 'Ya' }}
              </span>
              <span v-else class="text-gray-400">-</span>
            </td>
            <td>
              <span
                v-if="r.verifiedById"
                class="badge bg-emerald-100 text-emerald-700"
                :title="r.verifiedAt ? new Date(r.verifiedAt).toLocaleString('id-ID') : ''"
              >
                Terverifikasi
              </span>
              <span v-else class="badge bg-amber-100 text-amber-700">Menunggu</span>
            </td>
            <td class="text-right whitespace-nowrap">
              <template v-if="!r.verifiedById">
                <button
                  class="mr-3 text-sm text-emerald-600 hover:underline"
                  :disabled="saving"
                  @click="openVerify('APPROVE', r)"
                >
                  Setujui
                </button>
                <button
                  class="text-sm text-red-600 hover:underline"
                  :disabled="saving"
                  @click="openVerify('REJECT', r)"
                >
                  Tolak
                </button>
              </template>
              <span v-else class="text-sm text-gray-400">-</span>
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="9" class="py-4 text-center text-gray-400">Tidak ada data absensi.</td>
          </tr>
        </tbody>
      </table>

      <div v-if="!loading" class="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
        <span>Total {{ meta?.total ?? rows.length }} absensi · Halaman {{ page }} dari {{ totalPages() }}</span>
        <div class="flex items-center gap-2">
          <button class="btn-secondary" :disabled="page <= 1" @click="goPage(page - 1)">Sebelumnya</button>
          <button class="btn-secondary" :disabled="page >= totalPages()" @click="goPage(page + 1)">
            Berikutnya
          </button>
        </div>
      </div>
    </div>

    <!-- Modal verifikasi -->
    <Modal
      :open="verifyTarget !== null"
      :title="verifyAction === 'APPROVE' ? 'Setujui Absensi' : 'Tolak Absensi'"
      size="md"
      :busy="saving"
      @close="closeVerify"
    >
      <div class="space-y-4">
        <p class="text-sm text-gray-600">
          {{ verifyTarget ? studentName(verifyTarget) : '' }} ·
          {{ verifyTarget ? fmtDate(verifyTarget.date) : '' }} ·
          {{ verifyTarget?.status ?? '' }}
        </p>
        <div v-if="verifyAction === 'REJECT'" class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          Alasan penolakan wajib diisi.
        </div>
        <div>
          <label class="label">
            Catatan {{ verifyAction === 'REJECT' ? '(wajib)' : '(opsional)' }}
          </label>
          <textarea
            v-model="verifyNote"
            class="input"
            rows="3"
            :placeholder="verifyAction === 'REJECT' ? 'Alasan penolakan' : 'Catatan untuk siswa'"
          />
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" :disabled="saving" @click="closeVerify">Batal</button>
        <button
          class="btn-primary"
          :disabled="saving || (verifyAction === 'REJECT' && !verifyNote.trim())"
          @click="submitVerify"
        >
          {{ saving ? 'Menyimpan…' : verifyAction === 'APPROVE' ? 'Setujui' : 'Tolak' }}
        </button>
      </template>
    </Modal>
  </div>
</template>

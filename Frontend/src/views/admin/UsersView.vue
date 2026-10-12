<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  userManageService,
  cohortService,
  registrationService,
  documentService,
  downloadFile,
  type UserRecord,
  type CohortRecord,
  type StudentPklData,
  type ProvisionStudentsResult,
} from '@/services/api.service';
import { useCohortStore } from '@/stores/cohort.store';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import AppIcon from '@/components/AppIcon.vue';

const TABS = [
  { key: 'ALL', label: 'Semua' },
  { key: 'SISWA', label: 'Siswa' },
  { key: 'ADMIN', label: 'Admin' },
  { key: 'GURU_PEMBIMBING', label: 'Guru' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const users = ref<UserRecord[]>([]);
const cohorts = ref<CohortRecord[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');

const activeTab = ref<TabKey>('ALL');
const cohortStore = useCohortStore();

// --- Filter ---
const search = ref('');
const statusFilter = ref(''); // '' = semua | AKTIF | NONAKTIF
const cohortFilter = ref('ACTIVE'); // ACTIVE = gelombang aktif (default) | ALL | <cohortId>

const activeUser = (u: UserRecord): boolean => (statusFilter.value === 'AKTIF' ? u.isActive : statusFilter.value === 'NONAKTIF' ? !u.isActive : true);

// Akun tanpa gelombang (staf: ADMIN/GURU global) selalu tampil;
// akun ber-gelombang (SISWA) tampil jika cocok dengan pilihan filter gelombang.
const inActiveCohort = (u: UserRecord): boolean => {
  if (cohortFilter.value === 'ALL') return true;
  if (cohortFilter.value === 'ACTIVE') return !u.cohortId || u.cohortId === cohortStore.activeCohortId;
  return !u.cohortId || u.cohortId === cohortFilter.value;
};

const matchesSearch = (u: UserRecord): boolean => {
  const q = search.value.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    u.username,
    u.identifier ?? '',
    u.email ?? '',
    u.studentProfile?.fullName ?? '',
    u.studentProfile?.nisn ?? '',
    u.teacherProfile?.fullName ?? '',
    u.teacherProfile?.nip ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
};

const matchesTab = (u: UserRecord, tab: TabKey): boolean => {
  if (tab === 'ALL') return true;
  if (tab === 'ADMIN') return u.role === 'ADMIN' || u.role === 'SUPER_ADMIN';
  return u.role === tab;
};

const baseFiltered = computed(() =>
  users.value.filter((u) => inActiveCohort(u) && activeUser(u) && matchesSearch(u))
);

const counts = computed<Record<TabKey, number>>(() => {
  const out = { ALL: 0, SISWA: 0, ADMIN: 0, GURU_PEMBIMBING: 0 } as Record<TabKey, number>;
  for (const u of baseFiltered.value) {
    out.ALL++;
    if (u.role === 'SISWA') out.SISWA++;
    if (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN') out.ADMIN++;
    if (u.role === 'GURU_PEMBIMBING') out.GURU_PEMBIMBING++;
  }
  return out;
});

const filteredUsers = computed(() =>
  baseFiltered.value.filter((u) => matchesTab(u, activeTab.value))
);

const hasActiveFilter = computed(
  () => search.value.trim() !== '' || statusFilter.value !== '' || cohortFilter.value !== 'ACTIVE'
);

const emptyText = computed(() => {
  if (hasActiveFilter.value) return 'Tidak ada user yang cocok dengan filter.';
  const tab = TABS.find((t) => t.key === activeTab.value);
  return activeTab.value === 'ALL'
    ? 'Belum ada user.'
    : `Belum ada akun ${tab?.label ?? ''}.`;
});

const userFullName = (u: UserRecord): string =>
  u.studentProfile?.fullName ?? u.teacherProfile?.fullName ?? '-';

const showForm = ref(false);
const form = ref({ username: '', password: '', role: 'SISWA', identifier: '', fullName: '', nisn: '', nip: '', cohortId: '' });

const confirmDelete = ref<UserRecord | null>(null);
const showResetPassword = ref<UserRecord | null>(null);
const resetPasswordResult = ref<string | null>(null);

// --- Data PKL siswa (pendaftaran + Fase 2 daftar ulang + pembimbing) ---
const showStudentData = ref(false);
const studentData = ref<StudentPklData | null>(null);
const loadingStudentData = ref(false);
// ID dokumen Surat Permohonan milik siswa (untuk tombol unduh).
const permohonanDocId = ref<string | null>(null);

const fmtDate = (v?: string | null): string =>
  v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const fmtDateTime = (v?: string | null): string =>
  v ? new Date(v).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

/**
 * Cari dokumen Surat Permohonan milik siswa — admin tidak punya endpoint
 * khusus per siswa, jadi dicocokkan dari daftar pendaftaran & daftar dokumen.
 */
const findPermohonanDocId = async (studentId: string): Promise<string | null> => {
  try {
    const [regs, docs] = await Promise.all([
      registrationService.list(),
      documentService.list(undefined, 'SURAT_PERMOHONAN'),
    ]);
    const fromReg = regs.items.find((r) => r.student?.id === studentId)?.document?.id;
    if (fromReg) return fromReg;
    const fromDoc = (docs.items as unknown as Array<{ id: string; ownerId?: string }>).find(
      (d) => d.ownerId === studentId
    );
    return fromDoc?.id ?? null;
  } catch {
    return null;
  }
};

const openStudentData = async (u: UserRecord): Promise<void> => {
  showStudentData.value = true;
  studentData.value = null;
  permohonanDocId.value = null;
  loadingStudentData.value = true;
  error.value = '';
  try {
    const [data, docId] = await Promise.all([
      userManageService.getStudentData(u.id),
      findPermohonanDocId(u.id),
    ]);
    studentData.value = data;
    permohonanDocId.value = docId;
  } catch (e) {
    error.value = extractErrorMessage(e);
    showStudentData.value = false;
  } finally {
    loadingStudentData.value = false;
  }
};
const closeStudentData = (): void => {
  showStudentData.value = false;
  studentData.value = null;
  permohonanDocId.value = null;
};

const downloadPermohonan = async (): Promise<void> => {
  if (!permohonanDocId.value) return;
  try {
    await downloadFile(
      `/documents/${permohonanDocId.value}/download`,
      `surat-permohonan-${studentData.value?.pendaftaran?.code ?? 'pkl'}.pdf`
    );
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

/** Ambil SEMUA user (backend default 10/halaman) supaya tab & count akurat. */
const fetchAllUsers = async (): Promise<UserRecord[]> => {
  const items: UserRecord[] = [];
  const perPage = 100;
  for (let page = 1; page <= 50; page++) {
    const r = await userManageService.list({ page, perPage });
    items.push(...r.items);
    if (r.items.length < perPage) break;
  }
  return items;
};

const load = async (): Promise<void> => {
  loading.value = true;
  try {
    const [userList, cohortResult] = await Promise.all([
      fetchAllUsers(),
      cohortService.list(),
      cohortStore.ensureLoaded(),
    ]);
    users.value = userList;
    cohorts.value = cohortResult.items;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const submit = async (): Promise<void> => {
  if (!form.value.username || !form.value.password) return;
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    await userManageService.create({
      ...form.value,
      cohortId: form.value.cohortId || null,
    });
    success.value = 'User berhasil dibuat.';
    showForm.value = false;
    form.value = { username: '', password: '', role: 'SISWA', identifier: '', fullName: '', nisn: '', nip: '', cohortId: '' };
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

const toggleActive = async (u: UserRecord): Promise<void> => {
  try {
    await userManageService.update(u.id, { isActive: !u.isActive } as never);
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

// --- Delete ---
const askDelete = (u: UserRecord): void => { confirmDelete.value = u; };
const cancelDelete = (): void => { confirmDelete.value = null; };
const doDelete = async (): Promise<void> => {
  if (!confirmDelete.value) return;
  saving.value = true;
  try {
    await userManageService.remove(confirmDelete.value.id);
    success.value = `User "${confirmDelete.value.username}" berhasil dihapus.`;
    confirmDelete.value = null;
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

// --- Reset Password ---
const openResetPassword = (u: UserRecord): void => {
  showResetPassword.value = u;
  resetPasswordResult.value = null;
};
const cancelResetPassword = (): void => {
  showResetPassword.value = null;
  resetPasswordResult.value = null;
};
const doResetPassword = async (generateRandom: boolean): Promise<void> => {
  if (!showResetPassword.value) return;
  saving.value = true;
  error.value = '';
  try {
    const result = await userManageService.resetPassword(showResetPassword.value.id, {
      generateRandom,
    });
    resetPasswordResult.value = result.plainPassword;
    success.value = `Password ${showResetPassword.value.username} berhasil direset.`;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

// --- Bulk: buat akun siswa dari Master Siswa (per NISN) ---
const showProvision = ref(false);
const provisionResult = ref<ProvisionStudentsResult | null>(null);

const activeCohortName = computed(
  () => cohorts.value.find((c) => c.id === cohortStore.activeCohortId)?.name ?? 'gelombang aktif'
);

const openProvision = (): void => {
  provisionResult.value = null;
  showProvision.value = true;
};

const doProvision = async (): Promise<void> => {
  const cohortId = cohortStore.activeCohortId;
  if (!cohortId) {
    showProvision.value = false;
    error.value = 'Tidak ada gelombang aktif. Pilih gelombang dulu di header.';
    return;
  }
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    const result = await userManageService.provisionStudents(cohortId);
    provisionResult.value = result;
    success.value = `${result.created.length} akun siswa dibuat.`;
    await load();
  } catch (e) {
    // Tutup modal supaya banner error di halaman terbaca admin.
    error.value = extractErrorMessage(e);
    showProvision.value = false;
  } finally {
    saving.value = false;
  }
};

const copyAccounts = async (): Promise<void> => {
  if (!provisionResult.value?.created.length) return;
  const lines = [
    'NISN\tNama\tUsername\tPassword',
    ...provisionResult.value.created.map(
      (c) => `${c.nisn}\t${c.fullName}\t${c.username}\t${c.password}`
    ),
  ];
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    success.value = 'Daftar akun disalin ke clipboard.';
  } catch {
    error.value = 'Gagal menyalin ke clipboard.';
  }
};

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div class="card">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-800">Manajemen User</h2>
        <div class="flex items-center gap-2">
          <button class="btn-secondary" @click="openProvision">Buat Akun dari Master Siswa</button>
          <button class="btn-primary" @click="showForm = true">Tambah User</button>
        </div>
      </div>
      <div v-if="error" class="mb-3 mt-3 bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
      <div v-if="success" class="mb-3 mt-3 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>
    </div>

    <!-- Modal Tambah User -->
    <Modal :open="showForm" title="Tambah User" size="md" :busy="saving" @close="showForm = false">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div><label class="label">Role</label>
          <select v-model="form.role" class="input">
            <option value="SISWA">Siswa</option>
            <option value="GURU_PEMBIMBING">Guru Pembimbing</option>
            <option value="ADMIN">Admin</option>
            <option value="SUPER_ADMIN">Super Admin</option>
            <option value="KEPALA_SEKOLAH">Kepala Sekolah</option>
          </select>
        </div>
        <div><label class="label">Username</label><input v-model="form.username" class="input" /></div>
        <div><label class="label">Password</label><input v-model="form.password" type="password" class="input" /></div>
        <div><label class="label">Nama Lengkap</label><input v-model="form.fullName" class="input" /></div>
        <div v-if="form.role === 'SISWA'"><label class="label">NISN</label><input v-model="form.nisn" class="input" /></div>
        <div v-if="form.role === 'GURU_PEMBIMBING'"><label class="label">NIP</label><input v-model="form.nip" class="input" /></div>
        <div v-if="form.role === 'SISWA'"><label class="label">Gelombang</label>
          <select v-model="form.cohortId" class="input">
            <option value="">— Pilih —</option>
            <option v-for="c in cohorts" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" :disabled="saving" @click="showForm = false">Batal</button>
        <button
          class="btn-primary"
          :disabled="saving || !form.username || !form.password"
          @click="submit"
        >
          <LoadingSpinner v-if="saving" inline />
          {{ saving ? 'Menyimpan…' : 'Simpan' }}
        </button>
      </template>
    </Modal>

    <!-- Modal Buat Akun dari Master Siswa (bulk per NISN) -->
    <Modal :open="showProvision" title="Buat Akun dari Master Siswa" size="xl" :busy="saving" @close="showProvision = false">
      <template v-if="!provisionResult">
        <div class="space-y-2 text-sm text-gray-700">
          <p>
            Buat akun <b>Siswa</b> untuk semua baris <b>Master Siswa</b> gelombang aktif
            (<b>{{ activeCohortName }}</b>) yang belum punya akun.
          </p>
          <ul class="list-disc space-y-1 pl-5">
            <li>Username = NISN, password acak ditampilkan sekali setelah pembuatan.</li>
            <li>Siswa diwajibkan mengganti password saat login pertama.</li>
            <li>Baris master yang sudah punya akun akan dilewati.</li>
          </ul>
        </div>
      </template>
      <template v-else>
        <div class="space-y-4 text-sm">
          <p class="text-gray-800">
            Berhasil membuat <b>{{ provisionResult.created.length }}</b> akun dari
            {{ provisionResult.total }} baris master
            <span v-if="provisionResult.skipped.length">
              · {{ provisionResult.skipped.length }} dilewati</span
            ><span v-if="provisionResult.classBackfilled">
              · {{ provisionResult.classBackfilled }} kelas terisi</span
            >.
            <b>Catat/salin password sekarang — hanya ditampilkan sekali.</b>
          </p>
          <div v-if="provisionResult.created.length" class="overflow-x-auto rounded border border-gray-200">
            <table class="min-w-full text-left text-xs">
              <thead class="bg-gray-50 text-gray-500">
                <tr>
                  <th class="px-3 py-2">NISN</th>
                  <th class="px-3 py-2">Nama</th>
                  <th class="px-3 py-2">Username</th>
                  <th class="px-3 py-2">Password</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr v-for="c in provisionResult.created" :key="c.userId">
                  <td class="px-3 py-1.5 font-mono">{{ c.nisn }}</td>
                  <td class="px-3 py-1.5">{{ c.fullName }}</td>
                  <td class="px-3 py-1.5 font-mono">{{ c.username }}</td>
                  <td class="px-3 py-1.5 font-mono">{{ c.password }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="provisionResult.skipped.length" class="rounded border border-amber-200 bg-amber-50 p-3">
            <p class="mb-1 font-medium text-amber-800">Dilewati:</p>
            <ul class="space-y-0.5 text-xs text-amber-800">
              <li v-for="s in provisionResult.skipped" :key="s.nisn">
                <span class="font-mono">{{ s.nisn }}</span> — {{ s.fullName }} ({{ s.reason }})
              </li>
            </ul>
          </div>
        </div>
      </template>
      <template #footer>
        <template v-if="!provisionResult">
          <button class="btn-secondary" :disabled="saving" @click="showProvision = false">Batal</button>
          <button class="btn-primary" :disabled="saving" @click="doProvision">
            <LoadingSpinner v-if="saving" inline />
            {{ saving ? 'Membuat akun…' : 'Buat Akun' }}
          </button>
        </template>
        <template v-else>
          <button class="btn-secondary" @click="showProvision = false">Tutup</button>
          <button class="btn-primary" :disabled="!provisionResult.created.length" @click="copyAccounts">
            Salin Semua
          </button>
        </template>
      </template>
    </Modal>

    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Daftar User</h2>

      <!-- Filter: cari + status + gelombang -->
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <div class="relative min-w-64 flex-1">
          <input
            v-model="search"
            class="input pl-9"
            type="search"
            placeholder="Cari username, nama, NISN, atau NIP…"
          />
          <AppIcon name="search" :size="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>
        <select v-model="statusFilter" class="input w-auto" aria-label="Filter status">
          <option value="">Semua Status</option>
          <option value="AKTIF">Aktif</option>
          <option value="NONAKTIF">Nonaktif</option>
        </select>
        <select v-model="cohortFilter" class="input w-auto" aria-label="Filter gelombang">
          <option value="ACTIVE">Gelombang Aktif</option>
          <option value="ALL">Semua Gelombang</option>
          <option v-for="c in cohorts" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <button
          v-if="hasActiveFilter"
          class="text-sm text-primary-600 hover:underline"
          @click="search = ''; statusFilter = ''; cohortFilter = 'ACTIVE'"
        >
          Reset
        </button>
      </div>

      <div class="mb-4 flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
        <button
          v-for="t in TABS"
          :key="t.key"
          class="rounded-md px-3 py-1.5 text-sm transition-colors"
          :class="
            activeTab === t.key
              ? 'bg-white font-medium text-primary-700 shadow'
              : 'text-gray-600 hover:text-gray-900'
          "
          @click="activeTab = t.key"
        >
          {{ t.label }}
          <span
            class="ml-1 rounded-full px-1.5 py-0.5 text-xs"
            :class="activeTab === t.key ? 'bg-primary-100 text-primary-700' : 'bg-gray-200 text-gray-500'"
          >{{ counts[t.key] }}</span>
        </button>
      </div>

      <div v-if="loading" class="loading" />
      <table v-else class="table">
        <thead><tr><th>Username</th><th>Nama</th><th>Kelas</th><th>Role</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>
          <tr v-for="u in filteredUsers" :key="u.id">
            <td class="font-mono">{{ u.username }}</td>
            <td>{{ userFullName(u) }}</td>
            <td>{{ u.studentProfile?.class?.name ?? '-' }}</td>
            <td>{{ u.role }}</td>
            <td><StatusBadge :status="u.isActive ? 'AKTIF' : 'NONAKTIF'" /></td>
            <td class="flex gap-2">
              <button v-if="u.role === 'SISWA'" class="text-sm text-emerald-600 hover:underline" @click="openStudentData(u)">Data PKL</button>
              <button class="text-sm text-primary-600 hover:underline" @click="toggleActive(u)">{{ u.isActive ? 'Nonaktifkan' : 'Aktifkan' }}</button>
              <button class="text-sm text-amber-600 hover:underline" @click="openResetPassword(u)">Reset Password</button>
              <button class="text-sm text-red-600 hover:underline" @click="askDelete(u)">Hapus</button>
            </td>
          </tr>
          <tr v-if="!loading && filteredUsers.length === 0"><td colspan="6" class="py-4 text-center text-gray-400">{{ emptyText }}</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Modal Data PKL Siswa -->
    <Modal :open="!!showStudentData" title="Data PKL Siswa" size="xl" @close="closeStudentData">
      <p v-if="studentData" class="mb-4 text-sm text-gray-500">
        {{ studentData.fase2?.profile.fullName ?? studentData.user.username }}
        <span class="font-mono">({{ studentData.user.username }})</span>
      </p>

      <LoadingSpinner v-if="loadingStudentData" />

      <div v-else-if="studentData" class="space-y-5">
          <!-- Ringkasan akun -->
          <div class="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
            <span>Role: <strong>{{ studentData.user.role }}</strong></span>
            <span>Fase: <strong>{{ studentData.user.phase ?? '-' }}</strong></span>
            <span>Gelombang: <strong>{{ studentData.user.cohort?.name ?? '-' }}</strong></span>
            <span>Login terakhir: <strong>{{ fmtDateTime(studentData.user.lastLoginAt) }}</strong></span>
          </div>

          <!-- PENDAFTARAN (per siswa) -->
          <section>
            <h4 class="mb-2 font-semibold text-gray-800">Pendaftaran</h4>
            <p v-if="!studentData.pendaftaran" class="bg-gray-50 px-3 py-2 text-sm text-gray-500">
              Belum ada pendaftaran.
            </p>
            <div v-else class="space-y-3">
              <div class="grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg bg-gray-50 p-3 text-sm sm:grid-cols-2">
                <span>Kode: <strong class="font-mono">{{ studentData.pendaftaran.code }}</strong></span>
                <span class="flex items-center gap-2">Status: <StatusBadge :status="studentData.pendaftaran.status" /></span>
                <span>Gelombang: <strong>{{ studentData.pendaftaran.cohort?.name ?? '-' }}</strong></span>
                <span>Jurusan: <strong>{{ studentData.pendaftaran.majorName ?? '-' }}</strong></span>
                <span>Diajukan: <strong>{{ fmtDate(studentData.pendaftaran.submittedAt) }}</strong></span>
                <span>
                  Surat Permohonan:
                  <strong>{{ studentData.pendaftaran.permohonanDownloadedAt ? 'sudah diunduh' : 'belum diunduh' }}</strong>
                </span>
                <span v-if="studentData.pendaftaran.company" class="sm:col-span-2">
                  Perusahaan: <strong>{{ studentData.pendaftaran.company.name }}</strong>
                  — {{ studentData.pendaftaran.company.address }}<template v-if="studentData.pendaftaran.company.city">, {{ studentData.pendaftaran.company.city }}</template>
                  <template v-if="studentData.pendaftaran.company.phone"> (Telp: {{ studentData.pendaftaran.company.phone }})</template>
                </span>
                <span v-else class="sm:col-span-2">Perusahaan: <strong>-</strong></span>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <button v-if="permohonanDocId" class="btn-secondary" @click="downloadPermohonan">
                  Unduh Surat Permohonan
                </button>
                <span v-else class="text-xs text-gray-400">Surat Permohonan belum ditemukan.</span>
              </div>
            </div>
          </section>

          <!-- FASE 2 -->
          <section>
            <h4 class="mb-2 font-semibold text-gray-800">Fase 2 — Daftar Ulang</h4>
            <p v-if="!studentData.fase2" class="bg-gray-50 px-3 py-2 text-sm text-gray-500">
              Belum ada data Fase 2.
            </p>
            <div v-else class="space-y-3">
              <div class="grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg bg-gray-50 p-3 text-sm sm:grid-cols-2">
                <span>NISN: <strong class="font-mono">{{ studentData.fase2.profile.nisn }}</strong></span>
                <span>Kelas / Keahlian: <strong>{{ studentData.fase2.profile.className ?? '-' }}{{ studentData.fase2.profile.majorName ? ` / ${studentData.fase2.profile.majorName}` : '' }}</strong></span>
                <span>No. HP siswa: <strong class="font-mono">{{ studentData.fase2.profile.phone ?? '-' }}</strong></span>
                <span>Jenis kelamin: <strong>{{ studentData.fase2.profile.gender ?? '-' }}</strong></span>
                <span>Tanggal lahir: <strong>{{ fmtDate(studentData.fase2.profile.birthDate) }}</strong></span>
                <span>Alamat: <strong>{{ studentData.fase2.profile.address ?? '-' }}</strong></span>
              </div>

              <div>
                <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Data Orang Tua / Wali</p>
                <div v-if="studentData.fase2.parentData" class="grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg bg-gray-50 p-3 text-sm sm:grid-cols-2">
                  <span>Ayah: <strong>{{ studentData.fase2.parentData.fatherName ?? '-' }}</strong> <span class="font-mono">{{ studentData.fase2.parentData.fatherPhone ?? '' }}</span></span>
                  <span>Ibu: <strong>{{ studentData.fase2.parentData.motherName ?? '-' }}</strong> <span class="font-mono">{{ studentData.fase2.parentData.motherPhone ?? '' }}</span></span>
                  <span class="sm:col-span-2">Wali: <strong>{{ studentData.fase2.parentData.guardianName ?? '-' }}</strong> <span class="font-mono">{{ studentData.fase2.parentData.guardianPhone ?? '' }}</span></span>
                </div>
                <p v-else class="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">Data orang tua belum diisi.</p>
              </div>

              <div class="flex flex-wrap items-center gap-2 text-sm">
                <span>Surat Pernyataan:</span>
                <StatusBadge v-if="studentData.fase2.pernyataan" :status="studentData.fase2.pernyataan.status" />
                <span v-else class="text-gray-500">belum diajukan</span>
                <span v-if="studentData.fase2.pernyataan?.verifiedAt" class="text-gray-500">(diverifikasi {{ fmtDate(studentData.fase2.pernyataan.verifiedAt) }})</span>
              </div>
            </div>
          </section>

          <!-- PEMBIMBING -->
          <section>
            <h4 class="mb-2 font-semibold text-gray-800">Pembimbing</h4>
            <p v-if="!studentData.pembimbing" class="bg-gray-50 px-3 py-2 text-sm text-gray-500">
              Belum ada guru pembimbing.
            </p>
            <div v-else class="grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg bg-emerald-50 p-3 text-sm sm:grid-cols-2">
              <span>Nama: <strong>{{ studentData.pembimbing.supervisorName }}</strong></span>
              <span>Sejak: <strong>{{ fmtDateTime(studentData.pembimbing.assignedAt) }}</strong></span>
            </div>
          </section>
        </div>
      <template #footer>
        <button class="btn-secondary" @click="closeStudentData">Tutup</button>
      </template>
    </Modal>

    <!-- Modal Reset Password -->
    <Modal :open="!!showResetPassword" title="Reset Password" size="sm" :busy="saving" @close="cancelResetPassword">
      <p class="text-sm text-gray-600">
        Reset password untuk <strong>{{ showResetPassword?.username }}</strong>
        <span v-if="showResetPassword?.studentProfile?.fullName"> ({{ showResetPassword.studentProfile.fullName }})</span>
      </p>

      <div v-if="resetPasswordResult" class="mt-4 bg-emerald-50 p-4">
        <p class="text-sm font-medium text-emerald-800">Password baru:</p>
        <p class="mt-1 font-mono text-lg font-bold text-emerald-700">{{ resetPasswordResult }}</p>
        <p class="mt-1 text-xs text-emerald-600">Siswa diminta ganti password saat login pertama.</p>
      </div>

      <template #footer>
        <button class="btn-secondary" :disabled="saving" @click="cancelResetPassword">Tutup</button>
        <button class="btn-primary" :disabled="saving" @click="doResetPassword(true)">
          <LoadingSpinner v-if="saving" inline />
          {{ saving ? 'Generating…' : 'Generate Random' }}
        </button>
      </template>
    </Modal>

    <!-- Modal Hapus User -->
    <Modal :open="!!confirmDelete" title="Hapus User" size="sm" :busy="saving" @close="cancelDelete">
      <p class="text-sm text-gray-600">
        Hapus akun <strong>{{ confirmDelete?.username }}</strong>?
        <span v-if="confirmDelete?.studentProfile?.fullName || confirmDelete?.teacherProfile?.fullName" class="text-gray-500">
          ({{ confirmDelete?.studentProfile?.fullName ?? confirmDelete?.teacherProfile?.fullName }})
        </span>
        <br />
        <span class="font-medium text-red-600">Tidak dapat dibatalkan.</span>
      </p>
      <template #footer>
        <button class="btn-secondary" :disabled="saving" @click="cancelDelete">Batal</button>
        <button class="btn-danger" :disabled="saving" @click="doDelete">
          <LoadingSpinner v-if="saving" inline />
          {{ saving ? 'Menghapus…' : 'Hapus' }}
        </button>
      </template>
    </Modal>
  </div>
</template>

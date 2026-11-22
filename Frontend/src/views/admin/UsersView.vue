<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  userManageService,
  cohortService,
  registrationService,
  documentService,
  configService,
  downloadFile,
  type UserRecord,
  type CohortRecord,
  type StudentPklData,
  type ConfigMajor,
} from '@/services/api.service';
import { useCohortStore } from '@/stores/cohort.store';
import { useAuthStore } from '@/stores/auth.store';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';
import DataTable from '@/components/DataTable.vue';
import PageHeader from '@/components/PageHeader.vue';
import Tabs from '@/components/Tabs.vue';
import { toast } from '@/composables/useToast';
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
const majors = ref<ConfigMajor[]>([]);
const loading = ref(true);
const saving = ref(false);

const activeTab = ref<TabKey>('ALL');
const cohortStore = useCohortStore();
const auth = useAuthStore();

// Hanya SUPER_ADMIN yang boleh membuat/mengelola akun admin & melihat tab Admin.
const isSuperAdmin = computed(() => auth.role === 'SUPER_ADMIN');

// Role yang boleh dipilih sesuai actor: ADMIN biasa hanya Siswa & Guru Pembimbing.
const roleOptions = computed(() =>
  isSuperAdmin.value
    ? [
        { value: 'SISWA', label: 'Siswa' },
        { value: 'GURU_PEMBIMBING', label: 'Guru Pembimbing' },
        { value: 'ADMIN', label: 'Admin' },
        { value: 'SUPER_ADMIN', label: 'Super Admin' },
        { value: 'KEPALA_SEKOLAH', label: 'Kepala Sekolah' },
      ]
    : [
        { value: 'SISWA', label: 'Siswa' },
        { value: 'GURU_PEMBIMBING', label: 'Guru Pembimbing' },
      ]
);

// Tab Admin disembunyikan bagi ADMIN biasa (ia tak melihat akun admin).
const visibleTabs = computed(() =>
  isSuperAdmin.value ? TABS : TABS.filter((t) => t.key !== 'ADMIN')
);

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

/** Item Tabs: label + hitungan per tab. */
const tabItems = computed(() =>
  visibleTabs.value.map((t) => ({ key: t.key, label: t.label, count: counts.value[t.key] }))
);

const setTab = (key: string): void => {
  activeTab.value = key as TabKey;
};

const userColumns = [
  { key: 'username', label: 'Username' },
  { key: 'name', label: 'Nama' },
  { key: 'class', label: 'Kelas' },
  { key: 'role', label: 'Role' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: 'Aksi', class: 'text-right whitespace-nowrap' },
];

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
const form = ref({ username: '', role: 'SISWA', identifier: '', fullName: '', nisn: '', nip: '', cohortId: '' });
// Jurusan yang diawasi (hanya role ADMIN, hanya diisi SUPER_ADMIN).
const formMajorIds = ref<string[]>([]);

const emptyForm = (): typeof form.value => ({
  username: '', role: 'SISWA', identifier: '', fullName: '', nisn: '', nip: '', cohortId: '',
});

// Kredensial akun yang baru dibuat — password acak dari sistem, ditampilkan
// sekali saja (sama seperti hasil pembuatan akun massal dari Master Siswa).
const createdAccount = ref<{ username: string; fullName: string; password: string } | null>(null);

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
  try {
    const [data, docId] = await Promise.all([
      userManageService.getStudentData(u.id),
      findPermohonanDocId(u.id),
    ]);
    studentData.value = data;
    permohonanDocId.value = docId;
  } catch (e) {
    toast.error(extractErrorMessage(e));
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
    toast.error(extractErrorMessage(e));
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
    const [userList, cohortResult, , majorList] = await Promise.all([
      fetchAllUsers(),
      cohortService.list(),
      cohortStore.ensureLoaded(),
      configService.majors(),
    ]);
    users.value = userList;
    cohorts.value = cohortResult.items;
    majors.value = majorList;
  } catch (e) {
    toast.error(extractErrorMessage(e));
  } finally {
    loading.value = false;
  }
};

const submit = async (): Promise<void> => {
  if (!form.value.username) return;
  const { username, fullName } = form.value;
  saving.value = true;
  try {
    const created = await userManageService.create({
      ...form.value,
      cohortId: form.value.cohortId || null,
      ...(form.value.role === 'ADMIN' ? { majorIds: formMajorIds.value } : {}),
    });
    createdAccount.value = { username, fullName, password: created.password ?? '' };
    showForm.value = false;
    form.value = emptyForm();
    formMajorIds.value = [];
    await load();
  } catch (e) {
    toast.error(extractErrorMessage(e));
  } finally {
    saving.value = false;
  }
};

const copyCreatedAccount = async (): Promise<void> => {
  const account = createdAccount.value;
  if (!account) return;
  try {
    await navigator.clipboard.writeText(`${account.username}\t${account.password}`);
    toast.success('Kredensial disalin.');
  } catch {
    toast.error('Gagal menyalin kredensial.');
  }
};

const toggleActive = async (u: UserRecord): Promise<void> => {
  try {
    await userManageService.update(u.id, { isActive: !u.isActive } as never);
    await load();
  } catch (e) {
    toast.error(extractErrorMessage(e));
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
    toast.success(`User "${confirmDelete.value.username}" berhasil dihapus.`);
    confirmDelete.value = null;
    await load();
  } catch (e) {
    toast.error(extractErrorMessage(e));
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
  try {
    const result = await userManageService.resetPassword(showResetPassword.value.id, {
      generateRandom,
    });
    resetPasswordResult.value = result.plainPassword;
    toast.success(`Password ${showResetPassword.value.username} berhasil direset.`);
  } catch (e) {
    toast.error(extractErrorMessage(e));
  } finally {
    saving.value = false;
  }
};

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Manajemen User" subtitle="Buat, nonaktifkan, dan atur akses akun sekolah.">
      <template #actions>
        <button class="btn-primary" @click="showForm = true; formMajorIds = []">
          <AppIcon name="plus" :size="16" />
          Tambah User
        </button>
      </template>
    </PageHeader>

    <!-- Modal Tambah User -->
    <Modal :open="showForm" title="Tambah User" size="md" :busy="saving" @close="showForm = false">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div><label class="label">Role</label>
          <select v-model="form.role" class="input">
            <option v-for="r in roleOptions" :key="r.value" :value="r.value">{{ r.label }}</option>
          </select>
        </div>
        <div><label class="label">Username</label><input v-model="form.username" class="input" /></div>
        <div><label class="label">Nama Lengkap</label><input v-model="form.fullName" class="input" /></div>
        <div v-if="form.role === 'SISWA'"><label class="label">NISN</label><input v-model="form.nisn" class="input" /></div>
        <div v-if="form.role === 'GURU_PEMBIMBING'"><label class="label">NIP</label><input v-model="form.nip" class="input" /></div>
        <div v-if="form.role === 'SISWA'"><label class="label">Gelombang</label>
          <select v-model="form.cohortId" class="input">
            <option value="">— Pilih —</option>
            <option v-for="c in cohorts" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <!-- Jurusan yang diawasi (khusus akun ADMIN, hanya diatur Super Admin). -->
        <div v-if="form.role === 'ADMIN'" class="sm:col-span-2">
          <label class="label">Jurusan yang Diawasi</label>
          <p class="mb-2 text-xs text-gray-500">
            Admin hanya melihat data pada jurusan yang dipilih. Kosongkan = tidak ada data terlihat.
          </p>
          <div class="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border border-gray-200 p-2">
            <label v-for="m in majors" :key="m.id" class="flex cursor-pointer items-center gap-2 text-sm">
              <input v-model="formMajorIds" type="checkbox" :value="m.id" />
              <span>{{ m.code }} — {{ m.name }}</span>
            </label>
            <p v-if="majors.length === 0" class="text-xs text-gray-400">Belum ada data jurusan.</p>
          </div>
        </div>
      </div>
      <p class="mt-4 text-xs text-gray-500">
        Password tidak perlu diisi — sistem yang membuatkan password acak dan
        menampilkannya satu kali setelah akun tersimpan. Pemilik akun wajib
        menggantinya pada login pertama.
      </p>
      <template #footer>
        <button class="btn-secondary" :disabled="saving" @click="showForm = false">Batal</button>
        <button
          class="btn-primary"
          :disabled="saving || !form.username"
          @click="submit"
        >
          <LoadingSpinner v-if="saving" inline />
          {{ saving ? 'Menyimpan…' : 'Simpan' }}
        </button>
      </template>
    </Modal>

    <!-- Modal kredensial akun baru — password acak hanya tampil di sini -->
    <Modal
      :open="!!createdAccount"
      title="Akun Berhasil Dibuat"
      size="sm"
      @close="createdAccount = null"
    >
      <p class="text-sm text-gray-600">
        <strong>{{ createdAccount?.username }}</strong>
        <span v-if="createdAccount?.fullName"> — {{ createdAccount.fullName }}</span>
      </p>
      <p class="mt-2 text-sm font-medium text-amber-600">
        Salin &amp; catat sekarang — password hanya ditampilkan sekali.
      </p>
      <div class="mt-3 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm">
        <p class="font-medium text-emerald-800">Password awal:</p>
        <div class="mt-1 flex items-center justify-between gap-2">
          <p class="font-mono text-lg font-bold text-emerald-700">{{ createdAccount?.password }}</p>
          <button
            class="btn-secondary !px-2 !py-1 text-xs"
            title="Salin username dan password"
            aria-label="Salin kredensial"
            @click="copyCreatedAccount"
          >
            <AppIcon name="clipboard" :size="14" /> Salin
          </button>
        </div>
        <p class="mt-1 text-xs text-emerald-600">
          Pemilik akun diminta mengganti password saat login pertama.
        </p>
      </div>
      <template #footer>
        <button class="btn-primary" @click="createdAccount = null">Selesai</button>
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

      <Tabs :model-value="activeTab" :items="tabItems" @update:model-value="setTab" />

      <DataTable :columns="userColumns" :rows="filteredUsers" :loading="loading" :empty-title="emptyText" empty-icon="users">
        <template #cell-username="{ row }">
          <span class="font-mono text-[13px]">{{ row.username }}</span>
        </template>
        <template #cell-name="{ row }">{{ userFullName(row) }}</template>
        <template #cell-class="{ row }">{{ row.studentProfile?.class?.name ?? '–' }}</template>
        <template #cell-role="{ row }">
          <span class="text-[13px]">{{ row.role }}</span>
          <span
            v-if="row.role === 'ADMIN' && row.supervisedMajors?.length"
            class="mt-0.5 block text-xs text-ink-500"
            >Awasi: {{ row.supervisedMajors.map((m) => m.code).join(', ') }}</span
          >
          <span v-else-if="row.role === 'ADMIN'" class="mt-0.5 block text-xs text-ink-400"
            >Tanpa jurusan</span
          >
        </template>
        <template #cell-status="{ row }">
          <StatusBadge :status="row.isActive ? 'AKTIF' : 'NONAKTIF'" />
        </template>
        <template #cell-actions="{ row }">
          <div class="flex items-center justify-end gap-1">
            <button
              v-if="row.role === 'SISWA'"
              class="btn-ghost !px-2 !py-1 !text-[12px] text-ok"
              @click="openStudentData(row)"
            >
              Data PKL
            </button>
            <button class="btn-ghost !px-2 !py-1 !text-[12px]" @click="toggleActive(row)">
              {{ row.isActive ? 'Nonaktifkan' : 'Aktifkan' }}
            </button>
            <button
              class="btn-ghost !px-2 !py-1 !text-[12px] text-warn"
              @click="openResetPassword(row)"
            >
              Reset Password
            </button>
            <button class="btn-ghost !px-2 !py-1 !text-[12px] text-no" @click="askDelete(row)">
              Hapus
            </button>
          </div>
        </template>
      </DataTable>
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

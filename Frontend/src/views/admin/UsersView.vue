<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { userManageService, cohortService, companyService, type UserRecord, type CohortRecord, type StudentPklData } from '@/services/api.service';
import { useCohortStore } from '@/stores/cohort.store';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';
import StatusBadge from '@/components/StatusBadge.vue';

const TABS = [
  { key: 'ALL', label: 'Semua' },
  { key: 'SISWA', label: 'Siswa' },
  { key: 'ADMIN', label: 'Admin' },
  { key: 'GURU_PEMBIMBING', label: 'Guru' },
  { key: 'DUDI', label: 'DUDI' },
  { key: 'KETUA', label: 'Ketua' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const users = ref<UserRecord[]>([]);
const cohorts = ref<CohortRecord[]>([]);
const companies = ref<Array<{ id: string; name: string }>>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');

const activeTab = ref<TabKey>('ALL');
const cohortStore = useCohortStore();

// Akun tanpa gelombang (staf: ADMIN/GURU/DUDI global) selalu tampil;
// akun ber-gelombang (SISWA/KETUA) tampil jika cocok dengan gelombang aktif di header.
const inActiveCohort = (u: UserRecord): boolean => !u.cohortId || u.cohortId === cohortStore.activeCohortId;

const matchesTab = (u: UserRecord, tab: TabKey): boolean => {
  if (tab === 'ALL') return true;
  if (tab === 'ADMIN') return u.role === 'ADMIN' || u.role === 'SUPER_ADMIN';
  return u.role === tab;
};

const counts = computed<Record<TabKey, number>>(() => {
  const out = { ALL: 0, SISWA: 0, ADMIN: 0, GURU_PEMBIMBING: 0, DUDI: 0, KETUA: 0 } as Record<TabKey, number>;
  for (const u of users.value.filter(inActiveCohort)) {
    out.ALL++;
    if (u.role === 'SISWA') out.SISWA++;
    if (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN') out.ADMIN++;
    if (u.role === 'GURU_PEMBIMBING') out.GURU_PEMBIMBING++;
    if (u.role === 'DUDI') out.DUDI++;
    if (u.role === 'KETUA') out.KETUA++;
  }
  return out;
});

const filteredUsers = computed(() =>
  users.value.filter((u) => inActiveCohort(u) && matchesTab(u, activeTab.value))
);

const emptyText = computed(() => {
  const tab = TABS.find((t) => t.key === activeTab.value);
  return activeTab.value === 'ALL'
    ? 'Belum ada user.'
    : `Belum ada akun ${tab?.label ?? ''}.`;
});

const showForm = ref(false);
const form = ref({ username: '', password: '', role: 'SISWA', identifier: '', fullName: '', nisn: '', nip: '', cohortId: '', companyId: '' });
const newAccountResult = ref<{ username: string; password: string } | null>(null);

const confirmDelete = ref<UserRecord | null>(null);
const showResetPassword = ref<UserRecord | null>(null);
const resetPasswordResult = ref<string | null>(null);

// --- Data PKL siswa (Fase 1 pendaftaran + Fase 2 daftar ulang) ---
const showStudentData = ref(false);
const studentData = ref<StudentPklData | null>(null);
const loadingStudentData = ref(false);

const fmtDate = (v?: string | null): string =>
  v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const fmtDateTime = (v?: string | null): string =>
  v ? new Date(v).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

const openStudentData = async (u: UserRecord): Promise<void> => {
  showStudentData.value = true;
  studentData.value = null;
  loadingStudentData.value = true;
  error.value = '';
  try {
    studentData.value = await userManageService.getStudentData(u.id);
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
    const [userList, cohortResult, companyResult] = await Promise.all([
      fetchAllUsers(),
      cohortService.list(),
      companyService.list(),
      cohortStore.ensureLoaded(),
    ]);
    users.value = userList;
    cohorts.value = cohortResult.items;
    companies.value = companyResult.items as Array<{ id: string; name: string }>;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const submit = async (): Promise<void> => {
  if (form.value.role === 'KETUA' && !form.value.cohortId) {
    error.value = 'Gelombang wajib dipilih untuk akun Ketua.';
    return;
  }
  if (form.value.role !== 'KETUA' && (!form.value.username || !form.value.password)) return;
  saving.value = true;
  error.value = '';
  success.value = '';
  newAccountResult.value = null;
  try {
    const payload = {
      ...form.value,
      cohortId: form.value.cohortId || null,
      companyId: form.value.role === 'DUDI' ? (form.value.companyId || null) : null,
      // Untuk KETUA: kosongkan username/password, backend auto-generate
      username: form.value.role === 'KETUA' ? `KETUA${Date.now()}` : form.value.username,
      password: form.value.role === 'KETUA' ? 'auto' : form.value.password,
    };
    const result = await userManageService.create(payload);
    if (form.value.role === 'KETUA' && result.username) {
      newAccountResult.value = { username: result.username, password: result.password ?? '(cek backend)' };
      success.value = 'Akun Ketua berhasil dibuat.';
    } else {
      success.value = 'User berhasil dibuat.';
    }
    showForm.value = false;
    form.value = { username: '', password: '', role: 'SISWA', identifier: '', fullName: '', nisn: '', nip: '', cohortId: '', companyId: '' };
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

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div class="card">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-800">Manajemen User</h2>
        <button class="btn-primary" @click="showForm = true">Tambah User</button>
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
            <option value="KETUA">Ketua Kelompok</option>
            <option value="GURU_PEMBIMBING">Guru</option>
            <option value="ADMIN">Admin</option>
            <option value="DUDI">DUDI</option>
          </select>
        </div>
        <template v-if="form.role !== 'KETUA'">
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
          <div v-if="form.role === 'DUDI'"><label class="label">Perusahaan</label>
            <select v-model="form.companyId" class="input">
              <option value="">— Pilih —</option>
              <option v-for="c in companies" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
        </template>
        <div v-if="form.role === 'KETUA'" class="sm:col-span-2">
          <p class="mb-3 bg-blue-50 px-3 py-2 text-sm text-blue-700">
            Kredensial dibuat otomatis — berikan ke siswa setelah akun dibuat.
          </p>
          <div>
            <label class="label">Gelombang</label>
            <select v-model="form.cohortId" class="input" required>
              <option value="">— Pilih —</option>
              <option v-for="c in cohorts" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" :disabled="saving" @click="showForm = false">Batal</button>
        <button
          class="btn-primary"
          :disabled="saving || (form.role !== 'KETUA' && (!form.username || !form.password))"
          @click="submit"
        >
          <LoadingSpinner v-if="saving" inline />
          {{ saving ? 'Menyimpan…' : 'Simpan' }}
        </button>
      </template>
    </Modal>

    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Daftar User</h2>

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
        <thead><tr><th>Username</th><th>Nama</th><th>Role</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>
          <tr v-for="u in filteredUsers" :key="u.id">
            <td>{{ u.username }}</td>
            <td>{{ u.studentProfile?.fullName ?? u.teacherProfile?.fullName ?? '-' }}</td>
            <td>{{ u.role }}</td>
            <td><StatusBadge :status="u.isActive ? 'AKTIF' : 'NONAKTIF'" /></td>
            <td class="flex gap-2">
              <button v-if="u.role === 'SISWA'" class="text-sm text-emerald-600 hover:underline" @click="openStudentData(u)">Data PKL</button>
              <button class="text-sm text-primary-600 hover:underline" @click="toggleActive(u)">{{ u.isActive ? 'Nonaktifkan' : 'Aktifkan' }}</button>
              <button class="text-sm text-amber-600 hover:underline" @click="openResetPassword(u)">Reset Password</button>
              <button class="text-sm text-red-600 hover:underline" @click="askDelete(u)">Hapus</button>
            </td>
          </tr>
          <tr v-if="!loading && filteredUsers.length === 0"><td colspan="5" class="py-4 text-center text-gray-400">{{ emptyText }}</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Modal Data PKL Siswa -->
    <Modal :open="!!showStudentData" title="Data PKL Siswa" size="xl" @close="closeStudentData">
      <p v-if="studentData" class="mb-4 text-sm text-gray-500">
        {{ studentData.fase2?.profile.fullName ?? studentData.fase1?.member.fullName ?? studentData.user.username }}
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

          <!-- FASE 1 -->
          <section>
            <h4 class="mb-2 font-semibold text-gray-800">Fase 1 — Pendaftaran Awal</h4>
            <p v-if="!studentData.fase1" class="bg-gray-50 px-3 py-2 text-sm text-gray-500">
              Belum ada data Fase 1.
            </p>
            <div v-else class="space-y-3">
              <div class="grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg bg-gray-50 p-3 text-sm sm:grid-cols-2">
                <span>Kode pendaftaran: <strong>{{ studentData.fase1.registration.code }}</strong></span>
                <span class="flex items-center gap-2">Status: <StatusBadge :status="studentData.fase1.registration.status" /></span>
                <span>Kelompok: <strong>{{ studentData.fase1.registration.groupName }}</strong></span>
                <span>Gelombang: <strong>{{ studentData.fase1.registration.cohort?.name ?? '-' }}</strong></span>
                <span>Diajukan: <strong>{{ fmtDate(studentData.fase1.registration.submittedAt) }}</strong></span>
                <span>Bidang industri: <strong>{{ studentData.fase1.registration.company.industry ?? '-' }}</strong></span>
                <span class="sm:col-span-2">
                  Perusahaan: <strong>{{ studentData.fase1.registration.company.name }}</strong>
                  — {{ studentData.fase1.registration.company.address }}<template v-if="studentData.fase1.registration.company.city">, {{ studentData.fase1.registration.company.city }}</template>
                  <template v-if="studentData.fase1.registration.company.phone"> (Telp: {{ studentData.fase1.registration.company.phone }})</template>
                </span>
              </div>

              <div>
                <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Anggota Kelompok &amp; No. HP (diisi di form Fase 1)</p>
                <table class="table">
                  <thead><tr><th>Nama</th><th>NISN</th><th>Kelas</th><th>No. HP</th></tr></thead>
                  <tbody>
                    <tr v-for="(m, i) in studentData.fase1.members" :key="i" :class="m.isLeader ? 'bg-amber-50' : ''">
                      <td>
                        {{ m.fullName }}
                        <span v-if="m.isLeader" class="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Ketua</span>
                      </td>
                      <td class="font-mono">{{ m.nisn ?? '-' }}</td>
                      <td>{{ m.className ?? '-' }}</td>
                      <td class="font-mono">{{ m.phone ?? '-' }}</td>
                    </tr>
                  </tbody>
                </table>
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

          <!-- KELOMPOK (setelah surat penerimaan disetujui) -->
          <section v-if="studentData.group">
            <h4 class="mb-2 font-semibold text-gray-800">Kelompok PKL</h4>
            <div class="grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg bg-emerald-50 p-3 text-sm sm:grid-cols-2">
              <span>Kode: <strong>{{ studentData.group.code }}</strong></span>
              <span>Nama: <strong>{{ studentData.group.name }}</strong></span>
              <span>Perusahaan: <strong>{{ studentData.group.company?.name ?? '-' }}</strong></span>
              <span>Akun DUDI: <strong class="font-mono">{{ studentData.group.dudiMentors[0]?.dudi.username ?? '-' }}</strong></span>
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

    <!-- Modal Kredensial KETUA Baru -->
    <Modal :open="!!newAccountResult" title="Akun Ketua Dibuat" size="sm" @close="newAccountResult = null">
      <div class="bg-emerald-50 p-4 space-y-2">
        <div>
          <p class="text-xs text-emerald-600">Username:</p>
          <p class="font-mono text-lg font-bold text-emerald-700">{{ newAccountResult?.username }}</p>
        </div>
        <div>
          <p class="text-xs text-emerald-600">Password:</p>
          <p class="font-mono text-lg font-bold text-emerald-700">{{ newAccountResult?.password }}</p>
        </div>
      </div>
      <p class="mt-3 text-xs text-gray-500">Siswa diminta ganti password saat login pertama.</p>
      <template #footer>
        <button class="btn-primary" @click="newAccountResult = null">Tutup</button>
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

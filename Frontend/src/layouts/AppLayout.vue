<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { useCohortStore } from '@/stores/cohort.store';
import { authService } from '@/services/auth.service';
import { extractErrorMessage } from '@/services/http';
import { ROLE_LABELS, PHASE_LABELS, type Role, type StudentPhase } from '@/types';

/**
 * Navigasi sidebar per role.
 * Siswa mendapat sidebar hanya pada fase PKL_AKTIF dan PKL_SELESAI.
 */
interface NavItem {
  label: string;
  routeName: string;
  roles: Role[];
  phases?: StudentPhase[]; // Batasi ke fase tertentu (untuk SISWA)
}

const navItems: NavItem[] = [
  { label: 'Dashboard', routeName: 'dashboard', roles: ['SISWA', 'GURU_PEMBIMBING', 'ADMIN', 'DUDI', 'KEPALA_SEKOLAH', 'SUPER_ADMIN'] },
  // Siswa — hanya tampil di fase tertentu
  { label: 'Absensi Harian', routeName: 'my-attendance', roles: ['SISWA'], phases: ['PKL_AKTIF'] },
  { label: 'Jurnal Kegiatan', routeName: 'my-journal', roles: ['SISWA'], phases: ['PKL_AKTIF'] },
  { label: 'Pengaduan', routeName: 'my-complaints', roles: ['SISWA'], phases: ['PKL_AKTIF'] },
  { label: 'Kelompok Saya', routeName: 'my-groups', roles: ['SISWA'], phases: ['PKL_AKTIF', 'PKL_SELESAI'] },
  { label: 'Dokumen Saya', routeName: 'my-documents', roles: ['SISWA'], phases: ['PKL_AKTIF', 'PKL_SELESAI'] },
  { label: 'Laporan Akhir', routeName: 'my-report', roles: ['SISWA'], phases: ['PKL_AKTIF', 'PKL_SELESAI'] },
  // Guru
  { label: 'Monitoring Jurnal', routeName: 'guru-journal-monitor', roles: ['GURU_PEMBIMBING'] },
  { label: 'Kunjungan Monitoring', routeName: 'guru-visits', roles: ['GURU_PEMBIMBING'] },
  { label: 'Penilaian & Approval', routeName: 'guru-grade-approval', roles: ['GURU_PEMBIMBING'] },
  { label: 'Monitor Pengaduan', routeName: 'complaint-monitor', roles: ['GURU_PEMBIMBING', 'ADMIN', 'SUPER_ADMIN', 'KEPALA_SEKOLAH'] },
  // Admin
  { label: 'Monitoring Absensi', routeName: 'admin-attendance', roles: ['ADMIN', 'SUPER_ADMIN', 'KEPALA_SEKOLAH'] },
  { label: 'Verifikasi Pendaftaran', routeName: 'admin-registrations', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { label: 'Verifikasi Surat Penerimaan', routeName: 'admin-verify-penerimaan', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { label: 'Verifikasi Surat Pernyataan', routeName: 'admin-verify-daftar-ulang', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { label: 'Manajemen Kelompok', routeName: 'admin-groups', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { label: 'Verifikasi Dokumen & Laporan', routeName: 'admin-documents', roles: ['ADMIN', 'SUPER_ADMIN', 'KEPALA_SEKOLAH'] },
  { label: 'Data Perusahaan', routeName: 'admin-companies', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { label: 'Rekap Penilaian', routeName: 'admin-grade-recap', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { label: 'Manajemen User', routeName: 'admin-users', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { label: 'Master Siswa', routeName: 'admin-student-registry', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { label: 'Manajemen Gelombang', routeName: 'admin-cohorts', roles: ['SUPER_ADMIN', 'KEPALA_SEKOLAH'] },
  { label: 'Jadwal Fase PKL', routeName: 'admin-phase-schedule', roles: ['SUPER_ADMIN', 'KEPALA_SEKOLAH'] },
  { label: 'Audit Log', routeName: 'admin-audit-log', roles: ['SUPER_ADMIN'] },
  // DUDI
  { label: 'Konfirmasi Absensi', routeName: 'dudi-attendance-verify', roles: ['DUDI'] },
  { label: 'Konfirmasi Jurnal', routeName: 'dudi-journal-verify', roles: ['DUDI'] },
  { label: 'Input Nilai & Feedback', routeName: 'dudi-grades', roles: ['DUDI'] },
  { label: 'Lowongan Kerja', routeName: 'dudi-loker', roles: ['DUDI'] },
  // Semua role
  { label: 'Pengumuman', routeName: 'announcements', roles: ['SISWA', 'GURU_PEMBIMBING', 'ADMIN', 'DUDI', 'KEPALA_SEKOLAH', 'SUPER_ADMIN'] },
  { label: 'Notifikasi', routeName: 'notifications', roles: ['SISWA', 'GURU_PEMBIMBING', 'ADMIN', 'DUDI', 'KEPALA_SEKOLAH', 'SUPER_ADMIN'] },
];

const auth = useAuthStore();
const router = useRouter();

/** Siswa mendapat sidebar hanya saat fase PKL_AKTIF atau PKL_SELESAI. KETUA tidak pernah pakai sidebar. */
const hasSidebar = computed(() => {
  if (auth.role === 'KETUA') return false;
  if (auth.role !== 'SISWA') return true;
  return auth.phase === 'PKL_AKTIF' || auth.phase === 'PKL_SELESAI';
});

const visibleNav = computed(() =>
  navItems.filter((item) => {
    if (auth.role === null) return false;
    if (!item.roles.includes(auth.role)) return false;
    // Filter berdasarkan fase (hanya untuk SISWA)
    if (auth.role === 'SISWA' && item.phases && auth.phase) {
      return item.phases.includes(auth.phase);
    }
    if (auth.role === 'SISWA' && item.phases && !auth.phase) {
      return false;
    }
    return true;
  })
);

/** Siswa & Ketua di fase PRA_PKL/NON_PKL mengikuti alur terpandu; fase lain pakai sidebar. */
const isStudentGuided = computed(() => 
  (auth.role === 'SISWA' && !hasSidebar.value) || auth.role === 'KETUA'
);

const roleLabel = computed(() =>
  auth.role ? ROLE_LABELS[auth.role] : ''
);
const phaseLabel = computed(() =>
  auth.phase ? PHASE_LABELS[auth.phase] : null
);

const handleLogout = async (): Promise<void> => {
  await auth.logout();
  void router.push({ name: 'login' });
};

// --- Konteks gelombang global ---
const cohortStore = useCohortStore();
const showCohortSwitch = computed(() =>
  ['ADMIN', 'SUPER_ADMIN', 'KEPALA_SEKOLAH'].includes(auth.role ?? '')
);
watch(
  showCohortSwitch,
  (v) => {
    if (v) void cohortStore.ensureLoaded();
  },
  { immediate: true }
);

// --- Ganti password ---
const showChangePassword = ref(false);
const cpCurrent = ref('');
const cpNew = ref('');
const cpConfirm = ref('');
const cpSaving = ref(false);
const cpError = ref('');
const cpSuccess = ref('');

const openChangePassword = (): void => {
  cpCurrent.value = '';
  cpNew.value = '';
  cpConfirm.value = '';
  cpError.value = '';
  cpSuccess.value = '';
  showChangePassword.value = true;
};

// Tampilkan otomatis bila akun masih pakai password sementara
watch(
  () => auth.user?.mustChangePassword,
  (must) => {
    if (must) openChangePassword();
  },
  { immediate: true }
);

const submitChangePassword = async (): Promise<void> => {
  cpError.value = '';
  cpSuccess.value = '';
  if (cpNew.value !== cpConfirm.value) {
    cpError.value = 'Konfirmasi password baru tidak sama';
    return;
  }
  cpSaving.value = true;
  try {
    const updated = await authService.changePassword(cpCurrent.value, cpNew.value);
    auth.user = updated;
    cpSuccess.value = 'Password berhasil diganti.';
    setTimeout(() => { showChangePassword.value = false; }, 800);
  } catch (e) {
    cpError.value = extractErrorMessage(e);
  } finally {
    cpSaving.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen">
    <!-- Sidebar: staf selalu ada; siswa hanya saat PKL_AKTIF & PKL_SELESAI -->
    <aside v-if="hasSidebar" class="fixed inset-y-0 left-0 z-20 w-64 bg-primary-800 text-white">
      <div class="flex h-16 items-center gap-2 border-b border-primary-700 px-5">
        <span class="text-lg font-bold">Manajemen PKL</span>
      </div>
      <nav class="mt-4 space-y-1 px-3">
        <RouterLink
          v-for="item in visibleNav"
          :key="item.routeName"
          :to="{ name: item.routeName }"
          class="block rounded-lg px-3 py-2 text-sm text-primary-100 transition hover:bg-primary-700 hover:text-white"
          active-class="bg-primary-600 text-white"
        >
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>

    <!-- Konten -->
    <div :class="hasSidebar ? 'pl-64' : ''">
      <header class="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
        <h1 class="text-lg font-semibold text-gray-800">
          {{ isStudentGuided ? 'Alur PKL Saya' : ($route.meta.title ?? 'Dashboard') }}
        </h1>
        <div class="flex items-center gap-4">
          <div v-if="showCohortSwitch && cohortStore.loaded" class="flex items-center gap-2">
            <label class="text-xs text-gray-500">Gelombang</label>
            <select v-model="cohortStore.activeCohortId" class="input max-w-[240px] py-1.5 text-sm">
              <option v-for="c in cohortStore.cohorts" :key="c.id" :value="c.id">
                {{ c.name }}{{ c.status ? ` (${c.status})` : '' }}
              </option>
            </select>
          </div>
          <button class="text-sm font-medium text-gray-600 hover:underline" @click="openChangePassword">Ganti Password</button>
          <RouterLink v-if="isStudentGuided && $route.name !== 'student-workflow'" :to="{ name: 'student-workflow' }" class="text-sm font-medium text-primary-700 hover:underline">
            Kembali ke alur
          </RouterLink>
          <div class="text-right">
            <p class="text-sm font-medium text-gray-800">{{ auth.user?.username }}</p>
            <p class="text-xs text-gray-500">
              {{ roleLabel }}<span v-if="phaseLabel"> · {{ phaseLabel }}</span>
            </p>
          </div>
          <button class="btn-secondary" @click="handleLogout">Keluar</button>
        </div>
      </header>

      <main class="p-6">
        <RouterView />
      </main>
    </div>

    <!-- Modal Ganti Password -->
    <div
      v-if="showChangePassword"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
    >
      <div class="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <h2 class="mb-1 text-lg font-semibold text-gray-800">Ganti Password</h2>
        <p v-if="auth.user?.mustChangePassword" class="mb-4 text-sm text-amber-600">
          Anda login dengan password sementara. Wajib ganti password untuk melanjutkan.
        </p>
        <p v-else class="mb-4 text-sm text-gray-500">Masukkan password lama dan password baru Anda.</p>

        <div v-if="cpError" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ cpError }}</div>
        <div v-if="cpSuccess" class="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ cpSuccess }}</div>

        <div class="space-y-3">
          <div>
            <label class="label">Password Lama</label>
            <input v-model="cpCurrent" type="password" class="input" autocomplete="current-password" />
          </div>
          <div>
            <label class="label">Password Baru</label>
            <input v-model="cpNew" type="password" class="input" autocomplete="new-password" placeholder="Minimal 8 karakter, ada huruf & angka" />
          </div>
          <div>
            <label class="label">Ulangi Password Baru</label>
            <input v-model="cpConfirm" type="password" class="input" autocomplete="new-password" />
          </div>
        </div>

        <div class="mt-5 flex items-center justify-end gap-3">
          <button v-if="!auth.user?.mustChangePassword" class="btn-secondary" @click="showChangePassword = false">Batal</button>
          <button
            class="btn-primary"
            :disabled="cpSaving || !cpCurrent || !cpNew || !cpConfirm"
            @click="submitChangePassword"
          >
            {{ cpSaving ? 'Menyimpan…' : 'Simpan Password Baru' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

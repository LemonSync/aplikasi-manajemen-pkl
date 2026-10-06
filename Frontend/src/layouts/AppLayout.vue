<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { useCohortStore } from '@/stores/cohort.store';
import { authService } from '@/services/auth.service';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import AppIcon from '@/components/AppIcon.vue';
import { ROLE_LABELS, type Role, type StudentPhase } from '@/types';

interface NavItem {
  label: string;
  routeName: string;
  icon: string;
  section: string;
  roles: Role[];
  phases?: StudentPhase[];
}

const navItems: NavItem[] = [
  // Beranda
  { label: 'Dashboard', routeName: 'dashboard', icon: 'grid', section: 'Beranda', roles: ['SISWA', 'GURU_PEMBIMBING', 'ADMIN', 'DUDI', 'KEPALA_SEKOLAH', 'SUPER_ADMIN'] },
  { label: 'Pengumuman', routeName: 'announcements', icon: 'megaphone', section: 'Beranda', roles: ['SISWA', 'GURU_PEMBIMBING', 'ADMIN', 'DUDI', 'KEPALA_SEKOLAH', 'SUPER_ADMIN'] },
  { label: 'Notifikasi', routeName: 'notifications', icon: 'bell', section: 'Beranda', roles: ['SISWA', 'GURU_PEMBIMBING', 'ADMIN', 'DUDI', 'KEPALA_SEKOLAH', 'SUPER_ADMIN'] },
  // Siswa
  { label: 'Absensi Harian', routeName: 'my-attendance', icon: 'calendar', section: 'Siswa', roles: ['SISWA'], phases: ['PKL_AKTIF'] },
  { label: 'Jurnal Kegiatan', routeName: 'my-journal', icon: 'book', section: 'Siswa', roles: ['SISWA'], phases: ['PKL_AKTIF'] },
  { label: 'Pengaduan', routeName: 'my-complaints', icon: 'alert', section: 'Siswa', roles: ['SISWA'], phases: ['PKL_AKTIF'] },
  { label: 'Kelompok Saya', routeName: 'my-groups', icon: 'users', section: 'Siswa', roles: ['SISWA'], phases: ['PKL_AKTIF', 'PKL_SELESAI'] },
  { label: 'Dokumen Saya', routeName: 'my-documents', icon: 'file', section: 'Siswa', roles: ['SISWA'], phases: ['PKL_AKTIF', 'PKL_SELESAI'] },
  { label: 'Laporan Akhir', routeName: 'my-report', icon: 'clipboard', section: 'Siswa', roles: ['SISWA'], phases: ['PKL_AKTIF', 'PKL_SELESAI'] },
  // Guru
  { label: 'Monitoring Jurnal', routeName: 'guru-journal-monitor', icon: 'book', section: 'Guru', roles: ['GURU_PEMBIMBING'] },
  { label: 'Kunjungan', routeName: 'guru-visits', icon: 'pin', section: 'Guru', roles: ['GURU_PEMBIMBING'] },
  { label: 'Penilaian & Approval', routeName: 'guru-grade-approval', icon: 'checkCircle', section: 'Guru', roles: ['GURU_PEMBIMBING'] },
  { label: 'Monitor Pengaduan', routeName: 'complaint-monitor', icon: 'message', section: 'Guru', roles: ['GURU_PEMBIMBING', 'ADMIN', 'SUPER_ADMIN', 'KEPALA_SEKOLAH'] },
  // Admin — Monitoring
  { label: 'Absensi', routeName: 'admin-attendance', icon: 'activity', section: 'Verifikasi', roles: ['ADMIN', 'SUPER_ADMIN', 'KEPALA_SEKOLAH'] },
  { label: 'Pendaftaran', routeName: 'admin-registrations', icon: 'clipboard', section: 'Verifikasi', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { label: 'Surat Penerimaan', routeName: 'admin-verify-penerimaan', icon: 'fileCheck', section: 'Verifikasi', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { label: 'Surat Pernyataan', routeName: 'admin-verify-daftar-ulang', icon: 'fileCheck', section: 'Verifikasi', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { label: 'Dokumen & Laporan', routeName: 'admin-documents', icon: 'folder', section: 'Verifikasi', roles: ['ADMIN', 'SUPER_ADMIN', 'KEPALA_SEKOLAH'] },
  { label: 'Rekap Penilaian', routeName: 'admin-grade-recap', icon: 'chart', section: 'Verifikasi', roles: ['ADMIN', 'SUPER_ADMIN'] },
  // Admin — Data
  { label: 'Kelompok', routeName: 'admin-groups', icon: 'users', section: 'Data', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { label: 'Manajemen User', routeName: 'admin-users', icon: 'user', section: 'Data', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { label: 'Master Siswa', routeName: 'admin-student-registry', icon: 'clipboard', section: 'Data', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { label: 'Perusahaan', routeName: 'admin-companies', icon: 'briefcase', section: 'Data', roles: ['ADMIN', 'SUPER_ADMIN'] },
  // Admin — Sistem
  { label: 'Gelombang', routeName: 'admin-cohorts', icon: 'layers', section: 'Sistem', roles: ['SUPER_ADMIN', 'KEPALA_SEKOLAH'] },
  { label: 'Jadwal Fase', routeName: 'admin-phase-schedule', icon: 'calendar', section: 'Sistem', roles: ['SUPER_ADMIN', 'KEPALA_SEKOLAH'] },
  { label: 'Audit Log', routeName: 'admin-audit-log', icon: 'shield', section: 'Sistem', roles: ['SUPER_ADMIN'] },
  // DUDI
  { label: 'Konfirmasi Absensi', routeName: 'dudi-attendance-verify', icon: 'checkSquare', section: 'DUDI', roles: ['DUDI'] },
  { label: 'Konfirmasi Jurnal', routeName: 'dudi-journal-verify', icon: 'edit', section: 'DUDI', roles: ['DUDI'] },
  { label: 'Input Nilai', routeName: 'dudi-grades', icon: 'award', section: 'DUDI', roles: ['DUDI'] },
  { label: 'Lowongan Kerja', routeName: 'dudi-loker', icon: 'briefcase', section: 'DUDI', roles: ['DUDI'] },
];

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

// Progress bar ringkas saat pindah halaman
const routeLoading = ref(false);
let routeTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => route.path,
  () => {
    routeLoading.value = true;
    if (routeTimer) clearTimeout(routeTimer);
    routeTimer = setTimeout(() => {
      routeLoading.value = false;
    }, 500);
  }
);

const hasSidebar = computed(() => {
  if (auth.role === 'KETUA') return false;
  if (auth.role !== 'SISWA') return true;
  return auth.phase === 'PKL_AKTIF' || auth.phase === 'PKL_SELESAI';
});

const visibleNav = computed(() =>
  navItems.filter((item) => {
    if (auth.role === null) return false;
    if (!item.roles.includes(auth.role)) return false;
    if (auth.role === 'SISWA' && item.phases && auth.phase) {
      return item.phases.includes(auth.phase);
    }
    if (auth.role === 'SISWA' && item.phases && !auth.phase) {
      return false;
    }
    return true;
  })
);

/** Kelompokkan nav berdasarkan section, pertahankan urutan. */
const navSections = computed<Array<{ section: string; items: typeof navItems }>>(() => {
  const out: Array<{ section: string; items: typeof navItems }> = [];
  for (const item of visibleNav.value) {
    const last = out[out.length - 1];
    if (last && last.section === item.section) last.items.push(item);
    else out.push({ section: item.section, items: [item] });
  }
  return out;
});

const isStudentGuided = computed(
  () => (auth.role === 'SISWA' && !hasSidebar.value) || auth.role === 'KETUA'
);

const roleLabel = computed(() => (auth.role ? ROLE_LABELS[auth.role] : ''));

const initials = computed(() => {
  const u = auth.user?.username ?? '';
  return u.slice(0, 2).toUpperCase();
});

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
    cpError.value = 'Konfirmasi password tidak sama';
    return;
  }
  cpSaving.value = true;
  try {
    const updated = await authService.changePassword(cpCurrent.value, cpNew.value);
    auth.user = updated;
    cpSuccess.value = 'Password berhasil diganti.';
    setTimeout(() => {
      showChangePassword.value = false;
    }, 800);
  } catch (e) {
    cpError.value = extractErrorMessage(e);
  } finally {
    cpSaving.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen">
    <div v-if="routeLoading" class="route-progress w-full" />

    <!-- ===== Sidebar ===== -->
    <aside
      v-if="hasSidebar"
      class="fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-ink-900 text-white"
    >
      <!-- Brand -->
      <div class="flex h-16 shrink-0 items-center gap-3 border-b border-white/5 px-5">
        <div class="flex h-8 w-8 items-center justify-center bg-primary-600 text-sm font-bold text-white">
          P
        </div>
        <div class="leading-tight">
          <p class="text-sm font-bold tracking-tight text-white">Manajemen PKL</p>
          <p class="text-[11px] text-ink-400">SMKN 9 Medan</p>
        </div>
      </div>

      <!-- Nav -->
      <nav class="flex-1 overflow-y-auto pb-6">
        <template v-for="group in navSections" :key="group.section">
          <p class="side-section">{{ group.section }}</p>
          <RouterLink
            v-for="item in group.items"
            :key="item.routeName"
            :to="{ name: item.routeName }"
            class="side-link"
            :class="{ 'side-link-active': $route.name === item.routeName }"
          >
            <AppIcon :name="item.icon" :size="17" class="shrink-0" />
            <span class="truncate">{{ item.label }}</span>
          </RouterLink>
        </template>
      </nav>

      <!-- Sidebar footer -->
      <div class="shrink-0 border-t border-white/5 px-5 py-4">
        <div class="flex items-center gap-2 text-xs text-ink-500">
          <AppIcon name="shield" :size="14" />
          <span>Sistem PKL · v1.0</span>
        </div>
      </div>
    </aside>

    <!-- ===== Konten ===== -->
    <div :class="hasSidebar ? 'pl-64' : ''">
      <header
        class="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-ink-200 bg-white/80 px-6 backdrop-blur"
      >
        <h1 class="text-[15px] font-bold tracking-tight text-ink-900">
          {{ isStudentGuided ? 'Alur PKL Saya' : ($route.meta.title ?? 'Dashboard') }}
        </h1>

        <div class="flex items-center gap-3">
          <select
            v-if="showCohortSwitch && cohortStore.loaded"
            v-model="cohortStore.activeCohortId"
            class="input max-w-[200px] py-1.5 text-[13px]"
          >
            <option v-for="c in cohortStore.cohorts" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>

          <button class="btn-secondary !px-3 !py-1.5 !text-[13px]" @click="openChangePassword">
            <AppIcon name="lock" :size="15" />
            Ganti Password
          </button>

          <RouterLink
            v-if="isStudentGuided && $route.name !== 'student-workflow'"
            :to="{ name: 'student-workflow' }"
            class="text-[13px] font-semibold text-primary-700 hover:underline"
          >
            Alur
          </RouterLink>

          <!-- User chip -->
          <div class="flex items-center gap-2.5 border-l border-ink-200 pl-3">
            <div class="flex h-8 w-8 items-center justify-center bg-primary-600 text-[11px] font-bold text-white">
              {{ initials }}
            </div>
            <div class="leading-tight">
              <p class="max-w-[140px] truncate text-[13px] font-semibold text-ink-900">
                {{ auth.user?.username }}
              </p>
              <p class="text-[11px] font-medium text-ink-500">{{ roleLabel }}</p>
            </div>
            <button
              class="ml-1 flex h-8 w-8 items-center justify-center text-ink-400 transition hover:bg-ink-100 hover:text-red-600"
              title="Keluar"
              @click="handleLogout"
            >
              <AppIcon name="logout" :size="16" />
            </button>
          </div>
        </div>
      </header>

      <main class="p-6">
        <RouterView />
      </main>
    </div>

    <!-- ===== Modal Ganti Password ===== -->
    <Modal
      :open="showChangePassword"
      title="Ganti Password"
      size="sm"
      :busy="cpSaving"
      @close="showChangePassword = false"
    >
      <div v-if="auth.user?.mustChangePassword" class="mb-4 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        Password sementara. Wajib diganti.
      </div>
      <div v-if="cpError" class="mb-3 bg-red-50 px-3 py-2 text-sm text-red-700">{{ cpError }}</div>
      <div v-if="cpSuccess" class="mb-3 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ cpSuccess }}</div>

      <div class="space-y-3">
        <div>
          <label class="label">Password Lama</label>
          <input v-model="cpCurrent" type="password" class="input" autocomplete="current-password" />
        </div>
        <div>
          <label class="label">Password Baru</label>
          <input
            v-model="cpNew"
            type="password"
            class="input"
            autocomplete="new-password"
            placeholder="Min. 8 karakter, huruf & angka"
          />
        </div>
        <div>
          <label class="label">Ulangi</label>
          <input v-model="cpConfirm" type="password" class="input" autocomplete="new-password" />
        </div>
      </div>

      <template #footer>
        <button v-if="!auth.user?.mustChangePassword" class="btn-secondary" @click="showChangePassword = false">
          Batal
        </button>
        <button
          class="btn-primary"
          :disabled="cpSaving || !cpCurrent || !cpNew || !cpConfirm"
          @click="submitChangePassword"
        >
          <LoadingSpinner v-if="cpSaving" inline />
          {{ cpSaving ? 'Menyimpan…' : 'Simpan' }}
        </button>
      </template>
    </Modal>
  </div>
</template>

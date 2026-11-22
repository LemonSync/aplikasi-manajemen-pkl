<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth.store';
import { useCohortStore } from '@/stores/cohort.store';
import { dashboardService } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import { toast } from '@/composables/useToast';
import { NAV_ITEMS, isNavItemVisible } from '@/config/nav';
import AppIcon from '@/components/AppIcon.vue';
import CountUp from '@/components/CountUp.vue';
import PageHeader from '@/components/PageHeader.vue';
import UserAvatar from '@/components/UserAvatar.vue';
import { PHASE_LABELS, ROLE_LABELS, type StudentPhase } from '@/types';

interface CohortPhase {
  cohortId: string;
  cohortName: string;
  currentPhase: StudentPhase | null;
}

type Tone = 'ok' | 'warn' | 'info' | 'primary' | 'ink';

interface Tile {
  key: string;
  label: string;
  value: string;
  /** Angka mentah untuk animasi hitung-naik; kosong bila value berupa teks. */
  numeric?: number;
  hint?: string;
  icon: string;
  tone: Tone;
}

const TONE_CLASS: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  info: 'bg-info-soft text-info',
  primary: 'bg-primary-50 text-primary-600',
  ink: 'bg-raise text-ink-600',
};

const QUICK_ACTION_ROUTES: Record<string, Array<{ label: string; description: string; route: string; icon: string }>> = {
  ADMIN: [
    { label: 'Inbox Verifikasi', description: 'Semua yang menunggu keputusan Anda', route: 'admin-inbox', icon: 'inbox' },
    { label: 'Verifikasi Pendaftaran', description: 'Diajukan & menunggu keputusan', route: 'admin-registrations', icon: 'clipboard' },
    { label: 'Verifikasi Dokumen', description: 'Dokumen siswa menunggu telusur', route: 'admin-documents', icon: 'folder' },
    { label: 'Monitor Absensi', description: 'Rekap kehadiran lintas gelombang', route: 'admin-attendance', icon: 'activity' },
    { label: 'Manajemen User', description: 'Tambah, nonaktifkan, reset password', route: 'admin-users', icon: 'user' },
  ],
  KEPALA_SEKOLAH: [
    { label: 'Monitor Absensi', description: 'Kehadiran siswa per gelombang', route: 'admin-attendance', icon: 'activity' },
    { label: 'Verifikasi Dokumen', description: 'Status dokumen PKL', route: 'admin-documents', icon: 'folder' },
    { label: 'Pengumuman', description: 'Informasi untuk siswa & guru', route: 'announcements', icon: 'megaphone' },
  ],
  GURU_PEMBIMBING: [
    { label: 'Siswa Bimbingan', description: 'Daftar dampingan Anda', route: 'guru-bimbingan', icon: 'users' },
    { label: 'Verifikasi Absensi', description: 'Setujui absensi yang diajukan', route: 'guru-attendance-verify', icon: 'checkSquare' },
    { label: 'Kunjungan', description: 'Catat kunjungan ke lokasi PKL', route: 'guru-visits', icon: 'pin' },
  ],
  SISWA: [
    { label: 'Absensi Harian', description: 'Check-in / check-out hari ini', route: 'my-attendance', icon: 'calendar' },
    { label: 'Dokumen Saya', description: 'Unggah dan pantau status dokumen', route: 'my-documents', icon: 'file' },
    { label: 'Laporan Akhir', description: 'Isi log harian dan laporan', route: 'my-report', icon: 'clipboard' },
    { label: 'Pengaduan', description: 'Sampaikan kendala ke guru', route: 'my-complaints', icon: 'alert' },
    { label: 'Penilaian', description: 'Isi dan kunci nilai PKL dari mentor', route: 'grade-input', icon: 'award' },
    { label: 'Sertifikat', description: 'Unggah logo perusahaan, buat sertifikat', route: 'my-sertifikat', icon: 'fileCheck' },
  ],
};

const auth = useAuthStore();
const cohortStore = useCohortStore();

const stats = ref<Record<string, unknown>>({});
const loading = ref(true);

const roleLabel = computed(() => (auth.role ? ROLE_LABELS[auth.role] : '-'));

const count = (key: string): number | null => {
  const v = stats.value[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

const cohortPhases = computed<CohortPhase[]>(() => {
  const raw = stats.value.cohortPhases;
  return Array.isArray(raw) ? (raw as CohortPhase[]) : [];
});

/** Status fase diambil dari state server, bukan ditulis tetap di template. */
const phaseStatus = computed<{ label: string; tone: Tone; icon: string }>(() => {
  switch (auth.phase) {
    case 'PKL_AKTIF':
      return { label: 'PKL berjalan', tone: 'ok', icon: 'activity' };
    case 'PKL_SELESAI':
      return { label: 'PKL selesai', tone: 'info', icon: 'checkCircle' };
    case 'PRA_PKL':
      return { label: 'Menunggu jadwal', tone: 'warn', icon: 'clock' };
    case 'NON_PKL':
      return { label: 'Non-PKL', tone: 'ink', icon: 'user' };
    default:
      return { label: 'Belum ada fase', tone: 'ink', icon: 'user' };
  }
});

const tiles = computed<Tile[]>(() => {
  const role = auth.role;
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    const rows: Tile[] = [];
    const push = (key: string, label: string, icon: string, tone: Tone, hint?: string): void => {
      const value = count(key);
      if (value !== null)
        rows.push({
          key,
          label,
          value: value.toLocaleString('id-ID'),
          numeric: value,
          icon,
          tone,
          hint,
        });
    };
    push('totalStudents', 'Siswa Terdaftar', 'users', 'primary');
    push('supervisedStudents', 'Siswa Berbimbingan', 'user', 'ok');
    push('totalCompanies', 'Perusahaan Mitra', 'briefcase', 'info');
    push('activeCohorts', 'Gelombang Aktif', 'layers', 'primary');
    push('pendingDocuments', 'Dokumen Menunggu', 'folder', 'warn', 'Perlu verifikasi');
    push('pendingRegistrations', 'Pendaftaran Menunggu', 'clipboard', 'warn', 'Perlu keputusan');
    return rows;
  }
  if (role === 'GURU_PEMBIMBING') {
    const supervised = count('supervisedStudents');
    return supervised === null
      ? []
      : [
          {
            key: 'supervised',
            label: 'Siswa Bimbingan',
            value: supervised.toLocaleString('id-ID'),
            numeric: supervised,
            icon: 'users',
            tone: 'primary',
          },
        ];
  }
  if (role === 'SISWA') {
    const rows: Tile[] = [];
    const days = count('attendanceDays');
    if (days !== null)
      rows.push({
        key: 'attendance',
        label: 'Hari Absensi',
        value: days.toLocaleString('id-ID'),
        numeric: days,
        icon: 'calendar',
        tone: 'ok',
      });
    const complaints = count('complaintCount');
    if (complaints !== null)
      rows.push({
        key: 'complaints',
        label: 'Pengaduan Dibuat',
        value: complaints.toLocaleString('id-ID'),
        numeric: complaints,
        icon: 'message',
        tone: 'info',
      });
    rows.push({ key: 'phase', label: 'Status Fase', value: phaseStatus.value.label, icon: phaseStatus.value.icon, tone: phaseStatus.value.tone });
    return rows;
  }
  // KEPALA_SEKOLAH tidak punya statistik di endpoint ini (lihat catatan follow-up).
  return [];
});

/** Tautan cepat hanya menampilkan rute yang memang tampak di nav peran/fase ini. */
const QUICK_ACTION_ALIASES: Record<string, string> = { SUPER_ADMIN: 'ADMIN' };

const quickActions = computed(() => {
  const role = auth.role;
  if (!role) return [];
  const key = QUICK_ACTION_ALIASES[role] ?? role;
  return (QUICK_ACTION_ROUTES[key] ?? []).filter((action) => {
    const item = NAV_ITEMS.find((n) => n.routeName === action.route);
    return item ? isNavItemVisible(item, auth.role, auth.phase) : false;
  });
});

const load = async (): Promise<void> => {
  loading.value = true;
  try {
    stats.value = await dashboardService.stats();
  } catch (e) {
    toast.error(extractErrorMessage(e));
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="space-y-6">
    <!-- Hero -->
    <section
      class="relative overflow-hidden rounded-none bg-gradient-to-br from-ink-900 via-ink-800 to-primary-900 p-6 text-white shadow-lg"
    >
      <div class="hero-glow pointer-events-none absolute inset-0" aria-hidden="true" />
      <!-- Garis aksen menjalar dari kiri saat hero pertama kali tampil -->
      <span class="absolute inset-x-0 top-0 h-[3px] origin-left bg-gradient-to-r from-primary-400 via-accent to-transparent" aria-hidden="true" />

      <div class="relative flex flex-wrap items-center justify-between gap-4">
        <div class="min-w-0" data-reveal="left">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-300">
            {{ roleLabel }}
          </p>
          <h2 class="mt-1 text-2xl font-bold tracking-tight">
            Halo, {{ auth.user?.username }}!
          </h2>
          <div class="mt-4 flex flex-wrap gap-2">
            <span class="badge bg-white/10 text-white">
              <span
                class="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
                :class="phaseStatus.tone === 'ok' ? 'animate-pulse-ring bg-ok-400' : 'bg-primary-300'"
                aria-hidden="true"
              />
              {{ phaseStatus.label }}
            </span>
            <span v-if="auth.phase" class="badge bg-white/10 text-white">
              Fase: {{ PHASE_LABELS[auth.phase] }}
            </span>
            <span v-if="cohortStore.activeCohort" class="badge bg-white/10 text-white">
              {{ cohortStore.activeCohort.name }}
            </span>
          </div>
        </div>
        <UserAvatar
          :seed="auth.user?.username"
          class="hidden h-14 w-14 ring-1 ring-white/25 transition-transform duration-300 ease-spring hover:scale-105 sm:block"
          data-reveal="scale"
        />
      </div>
    </section>

    <!-- Peringatan password default -->
    <div
      v-if="auth.user?.mustChangePassword"
      class="flex items-start gap-3 rounded-none border-l-[3px] border-warn bg-warn-soft p-4 text-sm text-warn ring-1 ring-warn-200"
      data-reveal
    >
      <AppIcon name="alert" :size="18" class="mt-0.5 shrink-0" />
      <p class="font-medium">
        Password masih default — segera ganti lewat menu user di kanan atas.
      </p>
    </div>

    <!-- Tile statistik -->
    <PageHeader
      title="Ringkasan"
      subtitle="Kondisi terbaru pada gelombang aktif."
    />
    <div v-if="loading" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="i in 6" :key="i" class="card flex items-center gap-3">
        <div class="skeleton h-10 w-10 rounded-none" />
        <div class="flex-1 space-y-2">
          <div class="skeleton h-3 w-24" />
          <div class="skeleton h-5 w-16" />
        </div>
      </div>
    </div>
    <div
      v-else-if="tiles.length"
      class="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <div v-for="tile in tiles" :key="tile.key" class="card card-hover group flex items-center gap-3">
        <span
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-none transition-transform duration-300 ease-spring group-hover:scale-105"
          :class="TONE_CLASS[tile.tone]"
        >
          <AppIcon :name="tile.icon" :size="20" />
        </span>
        <div class="min-w-0">
          <p class="stat-tile-label">{{ tile.label }}</p>
          <p class="stat-tile-value">
            <CountUp v-if="tile.numeric !== undefined" :value="tile.numeric" />
            <template v-else>{{ tile.value }}</template>
          </p>
          <p v-if="tile.hint" class="text-[11px] text-ink-500">{{ tile.hint }}</p>
        </div>
      </div>
    </div>
    <p v-else class="card text-sm text-ink-500">
      Belum ada angka ringkas untuk peran Anda. Gunakan tautan cepat di bawah untuk melihat data
      lengkap.
    </p>

    <!-- Fase aktif per gelombang (admin) -->
    <section v-if="!loading && cohortPhases.length" class="card" data-reveal>
      <h3 class="mb-3 text-sm font-semibold text-ink-900">Fase aktif per gelombang</h3>
      <ul class="divide-y divide-ink-100">
        <li
          v-for="c in cohortPhases"
          :key="c.cohortId"
          class="flex items-center justify-between gap-3 py-2 transition-colors hover:bg-primary-50/60"
        >
          <span class="truncate text-[13px] font-medium text-ink-800">{{ c.cohortName }}</span>
          <span
            class="badge shrink-0"
            :class="c.currentPhase ? 'bg-ok-soft text-ok' : 'bg-raise text-ink-600'"
          >
            {{ c.currentPhase ? PHASE_LABELS[c.currentPhase] : 'Belum dijadwalkan' }}
          </span>
        </li>
      </ul>
    </section>

    <!-- Tautan cepat -->
    <section v-if="quickActions.length" class="card" data-reveal>
      <h3 class="mb-3 text-sm font-semibold text-ink-900">Aksi cepat</h3>
      <div class="stagger grid grid-cols-1 gap-2 sm:grid-cols-2">
        <RouterLink
          v-for="action in quickActions"
          :key="action.route"
          :to="{ name: action.route }"
          class="group flex items-center gap-3 rounded-none border border-line px-3 py-2.5 transition-[background-color,border-color,transform,box-shadow] duration-200 ease-spring hover:-translate-y-0.5 hover:border-primary-300 hover:bg-primary-50 hover:shadow-sm"
        >
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-none bg-raise text-ink-600 transition-colors duration-200 group-hover:bg-primary-100 group-hover:text-primary-700"
          >
            <AppIcon :name="action.icon" :size="17" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[13px] font-semibold text-ink-900">{{ action.label }}</span>
            <span class="block truncate text-[12px] text-ink-500">{{ action.description }}</span>
          </span>
          <AppIcon
            name="chevronRight"
            :size="16"
            class="shrink-0 text-ink-400 transition-transform duration-200 ease-spring group-hover:translate-x-1 group-hover:text-primary-600"
          />
        </RouterLink>
      </div>
    </section>
  </div>
</template>

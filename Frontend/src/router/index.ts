import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { setSessionExpiredHandler } from '@/services/http';
import type { Role, StudentPhase } from '@/types';

/**
 * Definisi rute.
 * Meta:
 *  - requiresAuth: wajib login
 *  - roles: batasi ke role tertentu (roleGuard)
 *  - phase: batasi siswa ke fase tertentu (phaseGuard)
 *  - guestOnly: hanya untuk tamu (halaman login)
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { guestOnly: true, title: 'Masuk' },
  },
  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('@/views/DashboardView.vue'),
        meta: { title: 'Dashboard' },
      },
      {
        path: 'alur-pkl',
        name: 'student-workflow',
        component: () => import('@/views/siswa/StudentWorkflowView.vue'),
        meta: { roles: ['SISWA', 'KETUA'] as Role[], title: 'Alur PKL Saya' },
      },
      // --- Siswa ---
      {
        path: 'pendaftaran',
        name: 'registration',
        component: () => import('@/views/siswa/RegistrationView.vue'),
        meta: { roles: ['SISWA'] as Role[], phase: ['PRA_PKL'] as StudentPhase[], workflowTask: true, title: 'Pendaftaran PKL' },
      },
      {
        path: 'kelompok',
        name: 'my-groups',
        component: () => import('@/views/siswa/MyGroupsView.vue'),
        meta: { roles: ['SISWA'] as Role[], workflowTask: true, title: 'Kelompok Saya' },
      },
      {
        path: 'dokumen',
        name: 'my-documents',
        component: () => import('@/views/siswa/MyDocumentsView.vue'),
        meta: { roles: ['SISWA'] as Role[], workflowTask: true, title: 'Dokumen Saya' },
      },
      {
        path: 'surat-pernyataan',
        name: 'surat-pernyataan',
        component: () => import('@/views/siswa/PernyataanView.vue'),
        meta: { roles: ['SISWA'] as Role[], phase: ['NON_PKL', 'PKL_AKTIF', 'PKL_SELESAI'] as StudentPhase[], workflowTask: true, title: 'Surat Pernyataan PKL' },
      },
      {
        path: 'absensi',
        name: 'my-attendance',
        component: () => import('@/views/siswa/AttendanceView.vue'),
        meta: { roles: ['SISWA'] as Role[], phase: ['PKL_AKTIF'] as StudentPhase[], workflowTask: true, title: 'Absensi Harian' },
      },
      {
        path: 'jurnal',
        name: 'my-journal',
        component: () => import('@/views/siswa/JournalView.vue'),
        meta: { roles: ['SISWA'] as Role[], phase: ['PKL_AKTIF'] as StudentPhase[], workflowTask: true, title: 'Jurnal Kegiatan' },
      },
      {
        path: 'pengaduan',
        name: 'my-complaints',
        component: () => import('@/views/siswa/ComplaintView.vue'),
        meta: { roles: ['SISWA'] as Role[], workflowTask: true, title: 'Pengaduan' },
      },
      {
        path: 'laporan-akhir',
        name: 'my-report',
        component: () => import('@/views/siswa/ReportView.vue'),
        meta: { roles: ['SISWA'] as Role[], phase: ['PKL_AKTIF', 'PKL_SELESAI'] as StudentPhase[], workflowTask: true, title: 'Laporan Akhir' },
      },
      // --- Guru Pembimbing ---
      {
        path: 'guru/jurnal',
        name: 'guru-journal-monitor',
        component: () => import('@/views/guru/JournalMonitorView.vue'),
        meta: { roles: ['GURU_PEMBIMBING'] as Role[], title: 'Monitoring Jurnal' },
      },
      {
        path: 'guru/kunjungan',
        name: 'guru-visits',
        component: () => import('@/views/guru/VisitView.vue'),
        meta: { roles: ['GURU_PEMBIMBING'] as Role[], title: 'Kunjungan Monitoring' },
      },
      {
        path: 'guru/penilaian',
        name: 'guru-grade-approval',
        component: () => import('@/views/guru/GradeApprovalView.vue'),
        meta: { roles: ['GURU_PEMBIMBING'] as Role[], title: 'Penilaian & Approval Laporan' },
      },
      {
        path: 'pengaduan',
        name: 'complaint-monitor',
        component: () => import('@/views/admin/ComplaintMonitorView.vue'),
        meta: {
          roles: ['ADMIN', 'SUPER_ADMIN', 'GURU_PEMBIMBING', 'KEPALA_SEKOLAH'] as Role[],
          title: 'Monitor Pengaduan',
        },
      },
      // --- Admin ---
      {
        path: 'admin/absensi',
        name: 'admin-attendance',
        component: () => import('@/views/admin/AttendanceMonitorView.vue'),
        meta: { roles: ['ADMIN', 'SUPER_ADMIN', 'KEPALA_SEKOLAH'] as Role[], title: 'Monitoring Absensi' },
      },
      // --- Admin ---
      {
        path: 'admin/pendaftaran',
        name: 'admin-registrations',
        component: () => import('@/views/admin/RegistrationsView.vue'),
        meta: { roles: ['ADMIN', 'SUPER_ADMIN'] as Role[], title: 'Verifikasi Pendaftaran' },
      },
      {
        path: 'admin/verifikasi-penerimaan',
        name: 'admin-verify-penerimaan',
        component: () => import('@/views/admin/VerifyPenerimaanView.vue'),
        meta: { roles: ['ADMIN', 'SUPER_ADMIN'] as Role[], title: 'Verifikasi Surat Penerimaan' },
      },
      {
        path: 'admin/verifikasi-daftar-ulang',
        name: 'admin-verify-daftar-ulang',
        component: () => import('@/views/admin/VerifyDaftarUlangView.vue'),
        meta: { roles: ['ADMIN', 'SUPER_ADMIN'] as Role[], title: 'Verifikasi Surat Pernyataan' },
      },
      {
        path: 'admin/kelompok',
        name: 'admin-groups',
        component: () => import('@/views/admin/GroupsView.vue'),
        meta: { roles: ['ADMIN', 'SUPER_ADMIN'] as Role[], title: 'Manajemen Kelompok' },
      },
      {
        path: 'admin/dokumen',
        name: 'admin-documents',
        component: () => import('@/views/admin/DocumentsView.vue'),
        meta: { roles: ['ADMIN', 'SUPER_ADMIN', 'KEPALA_SEKOLAH'] as Role[], title: 'Verifikasi Dokumen & Laporan' },
      },
      {
        path: 'admin/perusahaan',
        name: 'admin-companies',
        component: () => import('@/views/admin/CompaniesView.vue'),
        meta: { roles: ['ADMIN', 'SUPER_ADMIN'] as Role[], title: 'Data Perusahaan' },
      },
      {
        path: 'admin/penilaian',
        name: 'admin-grade-recap',
        component: () => import('@/views/admin/GradeRecapView.vue'),
        meta: { roles: ['ADMIN', 'SUPER_ADMIN'] as Role[], title: 'Rekap Penilaian & Surat Penarikan' },
      },
      // --- DUDI ---
      {
        path: 'dudi/penilaian',
        name: 'dudi-grades',
        component: () => import('@/views/dudi/GradesView.vue'),
        meta: { roles: ['DUDI'] as Role[], title: 'Input Nilai & Feedback' },
      },
      {
        path: 'dudi/absensi',
        name: 'dudi-attendance-verify',
        component: () => import('@/views/dudi/AttendanceVerifyView.vue'),
        meta: { roles: ['DUDI'] as Role[], title: 'Konfirmasi Absensi Siswa' },
      },
      {
        path: 'dudi/jurnal',
        name: 'dudi-journal-verify',
        component: () => import('@/views/dudi/JournalVerifyView.vue'),
        meta: { roles: ['DUDI'] as Role[], title: 'Konfirmasi Jurnal Siswa' },
      },
      {
        path: 'dudi/loker',
        name: 'dudi-loker',
        component: () => import('@/views/dudi/JobVacanciesView.vue'),
        meta: { roles: ['DUDI'] as Role[], title: 'Lowongan Kerja' },
      },
      // --- Siswa tambahan ---
      {
        path: 'data-orang-tua',
        name: 'parent-data',
        component: () => import('@/views/siswa/ParentDataView.vue'),
        meta: { roles: ['SISWA'] as Role[], workflowTask: true, title: 'Data Orang Tua' },
      },
      // --- Semua role ---
      {
        path: 'pengumuman',
        name: 'announcements',
        component: () => import('@/views/AnnouncementsView.vue'),
        meta: { title: 'Pengumuman' },
      },
      {
        path: 'notifikasi',
        name: 'notifications',
        component: () => import('@/views/NotificationsView.vue'),
        meta: { title: 'Notifikasi' },
      },
      // --- Admin tambahan ---
      {
        path: 'admin/gelombang',
        name: 'admin-cohorts',
        component: () => import('@/views/admin/CohortsView.vue'),
        meta: { roles: ['SUPER_ADMIN', 'KEPALA_SEKOLAH'] as Role[], title: 'Manajemen Gelombang' },
      },
      {
        path: 'admin/master-siswa',
        name: 'admin-student-registry',
        component: () => import('@/views/admin/StudentRegistryView.vue'),
        meta: { roles: ['ADMIN', 'SUPER_ADMIN'] as Role[], title: 'Master Siswa' },
      },
      {
        path: 'admin/users',
        name: 'admin-users',
        component: () => import('@/views/admin/UsersView.vue'),
        meta: { roles: ['ADMIN', 'SUPER_ADMIN'] as Role[], title: 'Manajemen User' },
      },
      {
        path: 'admin/jadwal-fase',
        name: 'admin-phase-schedule',
        component: () => import('@/views/admin/PhaseScheduleView.vue'),
        meta: { roles: ['SUPER_ADMIN', 'KEPALA_SEKOLAH'] as Role[], title: 'Jadwal Fase PKL' },
      },
      {
        path: 'admin/audit-log',
        name: 'admin-audit-log',
        component: () => import('@/views/admin/AuditLogsView.vue'),
        meta: { roles: ['SUPER_ADMIN'] as Role[], title: 'Audit Log' },
      },
    ],
  },
  {
    path: '/403',
    name: 'forbidden',
    component: () => import('@/views/errors/ForbiddenView.vue'),
    meta: { title: 'Akses Ditolak' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/errors/NotFoundView.vue'),
    meta: { title: 'Tidak Ditemukan' },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

/**
 * Layer 1 — authGuard: memastikan status login diketahui sebelum akses rute.
 * Bila belum diinisialisasi, coba muat profil dari server (memanfaatkan cookie refresh).
 */
router.beforeEach(async (to) => {
  const auth = useAuthStore();

  if (!auth.initialized) {
    await auth.fetchMe();
  }

  const requiresAuth = to.meta.requiresAuth === true;
  const guestOnly = to.meta.guestOnly === true;

  if (requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (guestOnly && auth.isAuthenticated) {
    return { name: 'dashboard' };
  }
  return true;
});

/**
 * Layer 2 — roleGuard: batasi akses berdasarkan role dari meta.roles.
 */
router.beforeEach((to) => {
  const auth = useAuthStore();
  const roles = to.meta.roles as Role[] | undefined;

  if (roles && roles.length > 0) {
    if (!auth.isAuthenticated || !auth.role || !roles.includes(auth.role)) {
      return { name: 'forbidden' };
    }
  }
  return true;
});

/**
 * Siswa & Ketua di fase PRA_PKL & NON_PKL: selalu diarahkan ke guided workflow.
 * Siswa di fase PKL_AKTIF & PKL_SELESAI: bisa akses route langsung (sidebar).
 * Ketua: selalu diarahkan ke guided workflow (akun khusus pra-daftar & daftar ulang).
 */
router.beforeEach((to) => {
  const auth = useAuthStore();
  const isGuidedPhase = auth.phase === 'PRA_PKL' || auth.phase === 'NON_PKL' || !auth.phase;
  const isKetua = auth.role === 'KETUA';

  if (
    (auth.role === 'SISWA' || isKetua) &&
    (isGuidedPhase || isKetua) &&
    to.name !== 'student-workflow' &&
    to.meta.workflowTask !== true &&
    to.name !== 'login' &&
    to.name !== 'forbidden' &&
    to.name !== 'not-found'
  ) {
    return { name: 'student-workflow' };
  }
  return true;
});

/**
 * Layer 3 — phaseGuard: batasi akses siswa berdasarkan fase dari meta.phase.
 * Role non-siswa dilewatkan (hanya relevan untuk siswa).
 */
router.beforeEach((to) => {
  const auth = useAuthStore();
  const phases = to.meta.phase as StudentPhase[] | undefined;

  if (phases && phases.length > 0 && auth.role === 'SISWA') {
    if (!auth.phase || !phases.includes(auth.phase)) {
      return { name: 'forbidden' };
    }
  }
  return true;
});

// Ketika sesi benar-benar habis (refresh gagal), arahkan ke login.
setSessionExpiredHandler(() => {
  const auth = useAuthStore();
  auth.clearSession();
  if (router.currentRoute.value.name !== 'login') {
    void router.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } });
  }
});

export default router;

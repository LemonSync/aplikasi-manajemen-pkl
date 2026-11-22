import type { Role, StudentPhase } from '@/types';

export interface NavItem {
  label: string;
  routeName: string;
  icon: string;
  section: string;
  roles: Role[];
  phases?: StudentPhase[];
}

/**
 * Tabel navigasi. Pindah keluar dari AppLayout supaya sidebar desktop dan drawer
 * mobile bisa memakainya tanpa salah satu jadi pemilik tunggal daftar ini.
 * Label, urutan, dan aturan role/fase sengaja tidak diubah oleh redesign UI.
 */
export const NAV_ITEMS: NavItem[] = [
  // Beranda
  { label: 'Dashboard', routeName: 'dashboard', icon: 'grid', section: 'Beranda', roles: ['SISWA', 'GURU_PEMBIMBING', 'ADMIN', 'KEPALA_SEKOLAH', 'SUPER_ADMIN'] },
  { label: 'Pengumuman', routeName: 'announcements', icon: 'megaphone', section: 'Beranda', roles: ['SISWA', 'GURU_PEMBIMBING', 'ADMIN', 'KEPALA_SEKOLAH', 'SUPER_ADMIN'] },
  { label: 'Notifikasi', routeName: 'notifications', icon: 'bell', section: 'Beranda', roles: ['SISWA', 'GURU_PEMBIMBING', 'ADMIN', 'KEPALA_SEKOLAH', 'SUPER_ADMIN'] },
  // Siswa — fase 3 (Masa PKL).
  // Absensi Harian tetap tampil di fase 4: siswa masih presensi selama pasca-PKL.
  { label: 'Absensi Harian', routeName: 'my-attendance', icon: 'calendar', section: 'Siswa', roles: ['SISWA'], phases: ['PKL_AKTIF', 'PKL_SELESAI'] },
  { label: 'Pengaduan', routeName: 'my-complaints', icon: 'alert', section: 'Siswa', roles: ['SISWA'], phases: ['PKL_AKTIF'] },
  { label: 'Dokumen Saya', routeName: 'my-documents', icon: 'file', section: 'Siswa', roles: ['SISWA'], phases: ['PKL_AKTIF'] },
  // Siswa — fase 4 (Pasca-PKL): Penilaian, Laporan Akhir, dan Sertifikat.
  { label: 'Laporan Akhir', routeName: 'my-report', icon: 'clipboard', section: 'Siswa', roles: ['SISWA'], phases: ['PKL_AKTIF', 'PKL_SELESAI'] },
  { label: 'Penilaian', routeName: 'grade-input', icon: 'award', section: 'Siswa', roles: ['SISWA'], phases: ['PKL_SELESAI'] },
  { label: 'Sertifikat', routeName: 'my-sertifikat', icon: 'fileCheck', section: 'Siswa', roles: ['SISWA'], phases: ['PKL_SELESAI'] },
  // Guru
  { label: 'Siswa Bimbingan', routeName: 'guru-bimbingan', icon: 'users', section: 'Guru', roles: ['GURU_PEMBIMBING'] },
  { label: 'Surat Pengantar dkk.', routeName: 'guru-bulk-letter', icon: 'fileCheck', section: 'Guru', roles: ['GURU_PEMBIMBING'] },
  { label: 'Verifikasi Absensi', routeName: 'guru-attendance-verify', icon: 'checkSquare', section: 'Guru', roles: ['GURU_PEMBIMBING'] },
  { label: 'Kunjungan', routeName: 'guru-visits', icon: 'pin', section: 'Guru', roles: ['GURU_PEMBIMBING'] },
  { label: 'Monitor Pengaduan', routeName: 'complaint-monitor', icon: 'message', section: 'Guru', roles: ['GURU_PEMBIMBING', 'ADMIN', 'SUPER_ADMIN', 'KEPALA_SEKOLAH'] },
  // Admin — Monitoring
  { label: 'Inbox Verifikasi', routeName: 'admin-inbox', icon: 'inbox', section: 'Verifikasi', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { label: 'Absensi', routeName: 'admin-attendance', icon: 'activity', section: 'Verifikasi', roles: ['ADMIN', 'SUPER_ADMIN', 'KEPALA_SEKOLAH'] },
  { label: 'Pendaftaran', routeName: 'admin-registrations', icon: 'clipboard', section: 'Verifikasi', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { label: 'Verifikasi Dokumen', routeName: 'admin-documents', icon: 'folder', section: 'Verifikasi', roles: ['ADMIN', 'SUPER_ADMIN', 'KEPALA_SEKOLAH'] },
  { label: 'Surat', routeName: 'admin-letters', icon: 'fileCheck', section: 'Verifikasi', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { label: 'Generator Surat', routeName: 'admin-letter-generator', icon: 'file', section: 'Verifikasi', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { label: 'Rekap Penilaian', routeName: 'admin-grade-recap', icon: 'chart', section: 'Verifikasi', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { label: 'Sertifikat PKL', routeName: 'admin-sertifikat', icon: 'award', section: 'Verifikasi', roles: ['ADMIN', 'SUPER_ADMIN'] },
  // Admin — Data
  { label: 'Pembimbingan', routeName: 'admin-supervisions', icon: 'users', section: 'Data', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { label: 'Manajemen User', routeName: 'admin-users', icon: 'user', section: 'Data', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { label: 'Master Siswa', routeName: 'admin-student-registry', icon: 'clipboard', section: 'Data', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { label: 'Master Guru', routeName: 'admin-teacher-registry', icon: 'users', section: 'Data', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { label: 'Perusahaan', routeName: 'admin-companies', icon: 'briefcase', section: 'Data', roles: ['ADMIN', 'SUPER_ADMIN'] },
  // Admin — Sistem
  { label: 'Gelombang', routeName: 'admin-cohorts', icon: 'layers', section: 'Sistem', roles: ['SUPER_ADMIN', 'KEPALA_SEKOLAH'] },
  { label: 'Jadwal Fase', routeName: 'admin-phase-schedule', icon: 'calendar', section: 'Sistem', roles: ['SUPER_ADMIN', 'KEPALA_SEKOLAH'] },
  { label: 'Audit Log', routeName: 'admin-audit-log', icon: 'shield', section: 'Sistem', roles: ['SUPER_ADMIN'] },
  { label: 'Config', routeName: 'admin-config', icon: 'settings', section: 'Sistem', roles: ['SUPER_ADMIN'] },
];

/** Role yang boleh mengganti gelombang aktif dari shell. */
export const COHORT_SWITCH_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN', 'KEPALA_SEKOLAH'];

/** Aturan tampil satu item nav — dipakai sidebar, drawer, dan tautan cepat dashboard. */
export const isNavItemVisible = (
  item: NavItem,
  role: Role | null,
  phase: StudentPhase | null
): boolean => {
  if (!role) return false;
  if (!item.roles.includes(role)) return false;
  if (role === 'SISWA' && item.phases) return phase ? item.phases.includes(phase) : false;
  return true;
};

export const visibleNavItems = (
  role: Role | null,
  phase: StudentPhase | null
): NavItem[] => NAV_ITEMS.filter((item) => isNavItemVisible(item, role, phase));

/** Kelompokkan item berdasarkan section, pertahankan urutan asal. */
export const groupNavBySection = (
  items: NavItem[]
): Array<{ section: string; items: NavItem[] }> => {
  const out: Array<{ section: string; items: NavItem[] }> = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (last && last.section === item.section) last.items.push(item);
    else out.push({ section: item.section, items: [item] });
  }
  return out;
};

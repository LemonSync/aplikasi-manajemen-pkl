/**
 * Tipe domain bersama untuk frontend.
 * Disinkronkan manual dengan enum Prisma di backend.
 */

export type Role =
  | 'SISWA'
  | 'KETUA'
  | 'GURU_PEMBIMBING'
  | 'ADMIN'
  | 'DUDI'
  | 'KEPALA_SEKOLAH'
  | 'SUPER_ADMIN';

export type StudentPhase = 'PRA_PKL' | 'NON_PKL' | 'PKL_AKTIF' | 'PKL_SELESAI';

export interface AuthUser {
  id: string;
  username: string;
  role: Role;
  phase: StudentPhase | null;
  cohortId: string | null;
  mustChangePassword: boolean;
}

export interface LoginResponse {
  user: AuthUser;
  tokens: {
    accessToken: string;
    refreshToken: string;
    refreshTokenExpiresAt: string;
  };
}

/** Pembungkus response standar dari backend. */
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  meta?: PaginationMeta;
  details?: Array<{ field: string; message: string }>;
}

export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

/** Label human-readable untuk role. */
export const ROLE_LABELS: Record<Role, string> = {
  SISWA: 'Siswa',
  KETUA: 'Ketua Kelompok',
  GURU_PEMBIMBING: 'Guru Pembimbing',
  ADMIN: 'Administrator',
  DUDI: 'Dunia Usaha/Industri',
  KEPALA_SEKOLAH: 'Kepala Sekolah',
  SUPER_ADMIN: 'Super Admin',
};

/** Label human-readable untuk fase siswa. */
export const PHASE_LABELS: Record<StudentPhase, string> = {
  PRA_PKL: 'Pra-PKL',
  NON_PKL: 'Non-PKL',
  PKL_AKTIF: 'PKL Aktif',
  PKL_SELESAI: 'PKL Selesai',
};

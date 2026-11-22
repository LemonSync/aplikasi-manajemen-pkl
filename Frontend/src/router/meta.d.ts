import type { RouteMeta } from 'vue-router';
import type { Role, StudentPhase } from '@/types';

/**
 * Augmentasi meta rute dengan field kustom.
 */
declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
    guestOnly?: boolean;
    roles?: Role[];
    phase?: StudentPhase[];
    /**
     * Daftar fase yang justru menutup akses halaman. Dipakai untuk fitur Masa
     * PKL (fase 3) yang tetap dibutuhkan siswa pada fase PRA_PKL/NON_PKL lewat
     * alur kerja, tetapi tidak boleh dibuka lagi setelah PKL selesai.
     */
    notInPhase?: StudentPhase[];
    /** Menandai halaman aksi yang dibuka dari alur PKL siswa. */
    workflowTask?: boolean;
    title?: string;
  }
}

export {};

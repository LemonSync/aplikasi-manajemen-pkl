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
    /** Menandai halaman aksi yang dibuka dari alur PKL siswa. */
    workflowTask?: boolean;
    title?: string;
  }
}

export {};

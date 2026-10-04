/**
 * Konfigurasi environment frontend (Vite).
 */
export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
  appName: import.meta.env.VITE_APP_NAME ?? 'Sistem Manajemen PKL',
} as const;

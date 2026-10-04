import axios from 'axios';
import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { env } from '@/config/env';
import type { ApiResponse } from '@/types';

/**
 * Klien HTTP terpusat.
 * - Menyisipkan access token pada tiap request.
 * - Menangani 401 dengan mencoba refresh token sekali (single-flight),
 *   lalu memutar ulang request asli. Bila gagal, memicu logout global.
 *
 * Catatan: refresh token disimpan sebagai HTTP-only cookie oleh backend,
 * sehingga cukup memanggil endpoint /auth/refresh tanpa mengirim token manual.
 */

const http: AxiosInstance = axios.create({
  baseURL: env.apiBaseUrl,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// --- Penyimpanan access token in-memory (tidak di localStorage, lebih aman) ---
let accessToken: string | null = null;

export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};

export const getAccessToken = (): string | null => accessToken;

// --- Callback yang dipanggil saat sesi benar-benar habis ---
let onSessionExpired: (() => void) | null = null;
export const setSessionExpiredHandler = (handler: () => void): void => {
  onSessionExpired = handler;
};

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// --- Single-flight refresh: hindari banyak panggilan refresh sekaligus ---
let refreshPromise: Promise<string | null> | null = null;

const refreshAccessToken = async (): Promise<string | null> => {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<ApiResponse<{ tokens: { accessToken: string } }>>(
        `${env.apiBaseUrl}/auth/refresh`,
        {},
        { withCredentials: true }
      )
      .then((res) => {
        const token = res.data?.data?.tokens?.accessToken ?? null;
        setAccessToken(token);
        return token;
      })
      .catch(() => {
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const status = error.response?.status;
    const url = original?.url ?? '';

    // Jangan refresh untuk endpoint auth itu sendiri
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/refresh');

    if (status === 401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return http(original);
      }
      // Refresh gagal → sesi habis
      onSessionExpired?.();
    }

    return Promise.reject(error);
  }
);

/** Mengambil pesan error yang ramah dari AxiosError. */
export const extractErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiResponse<unknown> | undefined;
    if (data?.message) {
      // Sertakan detail per-field (validasi 422) agar pengguna tahu field mana yang bermasalah
      const details = data.details;
      if (Array.isArray(details) && details.length > 0) {
        const list = details.map((d) => `${d.field} — ${d.message}`).join('; ');
        return `${data.message}: ${list}`;
      }
      return data.message;
    }
    if (error.code === 'ECONNABORTED') return 'Permintaan melebihi batas waktu';
    if (!error.response) return 'Tidak dapat terhubung ke server';
  }
  if (error instanceof Error) return error.message;
  return 'Terjadi kesalahan yang tidak diketahui';
};

export default http;

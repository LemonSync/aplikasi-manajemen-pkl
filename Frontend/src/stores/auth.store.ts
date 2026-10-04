import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { authService } from '@/services/auth.service';
import { setAccessToken } from '@/services/http';
import type { AuthUser, Role, StudentPhase } from '@/types';

/**
 * Store autentikasi (Pinia).
 * Menyimpan user yang sedang login + access token (in-memory).
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null);
  const initialized = ref(false);

  const isAuthenticated = computed(() => user.value !== null);
  const role = computed<Role | null>(() => user.value?.role ?? null);
  const phase = computed<StudentPhase | null>(() => user.value?.phase ?? null);

  const hasRole = (...roles: Role[]): boolean =>
    user.value !== null && roles.includes(user.value.role);

  /** Login: memanggil API lalu menyimpan user + access token. */
  const login = async (identifier: string, password: string): Promise<void> => {
    const result = await authService.login(identifier, password);
    setAccessToken(result.tokens.accessToken);
    user.value = result.user;
    initialized.value = true;
  };

  /** Memuat ulang user dari server (dipakai saat bootstrap aplikasi). */
  const fetchMe = async (): Promise<void> => {
    try {
      user.value = await authService.me();
    } catch {
      user.value = null;
      setAccessToken(null);
    } finally {
      initialized.value = true;
    }
  };

  /** Logout: cabut sesi di server lalu bersihkan state lokal. */
  const logout = async (): Promise<void> => {
    try {
      await authService.logout();
    } finally {
      user.value = null;
      setAccessToken(null);
    }
  };

  /** Dipanggil oleh interceptor ketika refresh token gagal. */
  const clearSession = (): void => {
    user.value = null;
    setAccessToken(null);
  };

  return {
    user,
    initialized,
    isAuthenticated,
    role,
    phase,
    hasRole,
    login,
    fetchMe,
    logout,
    clearSession,
  };
});

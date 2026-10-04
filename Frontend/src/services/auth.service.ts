import http from './http';
import type { ApiResponse, AuthUser, LoginResponse } from '@/types';

/**
 * Service autentikasi (pembungkus endpoint /api/auth).
 */
export const authService = {
  async login(identifier: string, password: string): Promise<LoginResponse> {
    const { data } = await http.post<ApiResponse<LoginResponse>>('/auth/login', {
      identifier,
      password,
    });
    return data.data;
  },

  async refresh(): Promise<LoginResponse> {
    const { data } = await http.post<ApiResponse<LoginResponse>>('/auth/refresh', {});
    return data.data;
  },

  async logout(): Promise<void> {
    await http.post('/auth/logout', {});
  },

  async me(): Promise<AuthUser> {
    const { data } = await http.get<ApiResponse<AuthUser>>('/auth/me');
    return data.data;
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<AuthUser> {
    const { data } = await http.post<ApiResponse<AuthUser>>('/auth/change-password', {
      currentPassword,
      newPassword,
    });
    return data.data;
  },
};

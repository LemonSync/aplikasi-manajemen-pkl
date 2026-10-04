import { z } from 'zod';

/**
 * Skema validasi untuk modul autentikasi.
 */

export const loginSchema = z.object({
  identifier: z
    .string()
    .min(3, 'Identitas minimal 3 karakter')
    .max(100, 'Identitas terlalu panjang')
    .transform((v) => v.trim()),
  password: z.string().min(1, 'Password wajib diisi').max(200),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Password lama wajib diisi').max(200),
  newPassword: z.string().min(8, 'Password baru minimal 8 karakter').max(200),
});

export type LoginDTO = z.infer<typeof loginSchema>;
export type RefreshDTO = z.infer<typeof refreshSchema>;
export type ChangePasswordDTO = z.infer<typeof changePasswordSchema>;

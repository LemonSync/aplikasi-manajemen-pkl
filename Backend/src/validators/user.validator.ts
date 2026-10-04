import { z } from 'zod';
import { Role } from '@prisma/client';

export const createUserSchema = z.object({
  username: z.string().min(3).max(50),
  identifier: z.string().max(40).optional().nullable(),
  email: z.string().email().optional().nullable(),
  password: z.string().min(1).max(100).optional(),
  role: z.nativeEnum(Role),
  cohortId: z.string().cuid().optional().nullable(),
  companyId: z.string().cuid().optional().nullable(),
  fullName: z.string().max(100).optional(),
  nisn: z.string().max(20).optional(),
  nip: z.string().max(20).optional(),
  classId: z.string().cuid().optional().nullable(),
  majorId: z.string().cuid().optional().nullable(),
});

export const updateUserSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  email: z.string().email().optional().nullable(),
  isActive: z.boolean().optional(),
  role: z.nativeEnum(Role).optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(6).max(100).optional(),
  generateRandom: z.boolean().optional(),
});

export const listUserQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
  role: z.nativeEnum(Role).optional(),
  search: z.string().optional(),
  cohortId: z.string().cuid().optional(),
});

export type CreateUserDTO = z.infer<typeof createUserSchema>;
export type UpdateUserDTO = z.infer<typeof updateUserSchema>;
export type ResetPasswordDTO = z.infer<typeof resetPasswordSchema>;
export type ListUserQueryDTO = z.infer<typeof listUserQuerySchema>;

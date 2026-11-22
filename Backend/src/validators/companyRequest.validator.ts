import { z } from 'zod';

/**
 * Skema validasi usulan tempat PKL dari siswa (fase 1).
 * Nama perusahaan selalu disimpan KAPITAL (diuppercase di service).
 */

export const createCompanyRequestSchema = z.object({
  name: z.string().trim().min(2, 'Nama perusahaan minimal 2 karakter').max(200),
  address: z.string().trim().min(3, 'Alamat perusahaan wajib diisi').max(500),
  industryId: z.string().cuid().optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email('Email tidak valid').optional().nullable(),
  website: z
    .string()
    .trim()
    .max(255)
    .url('Website harus berupa URL yang valid')
    .refine((value) => /^https?:\/\//i.test(value), 'Website hanya boleh menggunakan http atau https')
    .optional()
    .nullable(),
});

export const reviewCompanyRequestSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  note: z.string().trim().max(1000).optional().nullable(),
});

export const listCompanyRequestQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
  search: z.string().max(120).optional(),
  status: z.enum(['MENUNGGU', 'DISETUJUI', 'DITOLAK']).optional(),
});

export type CreateCompanyRequestDTO = z.infer<typeof createCompanyRequestSchema>;
export type ReviewCompanyRequestDTO = z.infer<typeof reviewCompanyRequestSchema>;
export type ListCompanyRequestQueryDTO = z.infer<typeof listCompanyRequestQuerySchema>;

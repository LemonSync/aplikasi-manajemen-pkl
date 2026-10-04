import { z } from 'zod';

/**
 * Skema validasi data master & perusahaan.
 */

export const createCompanySchema = z.object({
  name: z.string().min(2).max(200),
  address: z.string().max(500).optional().nullable(),
  industryId: z.string().cuid().optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().optional().nullable(),
  city: z.string().max(120).optional().nullable(),
});

export const updateCompanySchema = createCompanySchema.partial();

export const listCompanyQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
  search: z.string().max(120).optional(),
  industryId: z.string().cuid().optional(),
});

export const reviewRegistrationBodySchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  note: z.string().max(1000).optional(),
});

export type CreateCompanyDTO = z.infer<typeof createCompanySchema>;
export type UpdateCompanyDTO = z.infer<typeof updateCompanySchema>;
export type ListCompanyQueryDTO = z.infer<typeof listCompanyQuerySchema>;

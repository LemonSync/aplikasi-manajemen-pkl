import { z } from 'zod';

export const createMajorConfigSchema = z.object({
  code: z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9_-]+$/, 'Kode hanya boleh berisi huruf, angka, - atau _'),
  name: z.string().trim().min(2).max(120),
});

export const updateMajorConfigSchema = createMajorConfigSchema.partial();

export const createIndustryConfigSchema = z.object({
  name: z.string().trim().min(2).max(120),
});

export const updateIndustryConfigSchema = createIndustryConfigSchema.partial();

export const signatoryConfigSchema = z.object({
  name: z.string().trim().min(2).max(150),
  nip: z.string().trim().max(40).optional().nullable(),
  position: z.string().trim().min(2).max(100),
});

export type CreateMajorConfigDTO = z.infer<typeof createMajorConfigSchema>;
export type UpdateMajorConfigDTO = z.infer<typeof updateMajorConfigSchema>;
export type CreateIndustryConfigDTO = z.infer<typeof createIndustryConfigSchema>;
export type UpdateIndustryConfigDTO = z.infer<typeof updateIndustryConfigSchema>;
export type SignatoryConfigDTO = z.infer<typeof signatoryConfigSchema>;

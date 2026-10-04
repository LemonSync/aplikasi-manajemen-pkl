import { z } from 'zod';
import { JobVacancyStatus } from '@prisma/client';

export const createJobVacancySchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  requirements: z.string().max(5000).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  companyId: z.string().cuid().optional().nullable(),
});

export const updateJobVacancySchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(10).max(5000).optional(),
  requirements: z.string().max(5000).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  status: z.nativeEnum(JobVacancyStatus).optional(),
});

export const listJobVacancyQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
  status: z.nativeEnum(JobVacancyStatus).optional(),
  companyId: z.string().cuid().optional(),
});

export type CreateJobVacancyDTO = z.infer<typeof createJobVacancySchema>;
export type UpdateJobVacancyDTO = z.infer<typeof updateJobVacancySchema>;
export type ListJobVacancyQueryDTO = z.infer<typeof listJobVacancyQuerySchema>;

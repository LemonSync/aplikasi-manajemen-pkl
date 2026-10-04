import { z } from 'zod';
import { CohortStatus } from '@prisma/client';

export const createCohortSchema = z.object({
  name: z.string().min(1).max(100),
  academicYear: z.string().max(20).optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
});

export const updateCohortSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  academicYear: z.string().max(20).optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  status: z.nativeEnum(CohortStatus).optional(),
  description: z.string().max(1000).optional().nullable(),
});

export const listCohortQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
  status: z.nativeEnum(CohortStatus).optional(),
});

export type CreateCohortDTO = z.infer<typeof createCohortSchema>;
export type UpdateCohortDTO = z.infer<typeof updateCohortSchema>;
export type ListCohortQueryDTO = z.infer<typeof listCohortQuerySchema>;

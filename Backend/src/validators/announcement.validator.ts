import { z } from 'zod';

export const createAnnouncementSchema = z.object({
  title: z.string().min(3).max(200),
  body: z.string().min(5).max(5000),
  cohortId: z.string().cuid().optional().nullable(),
  isPinned: z.boolean().optional(),
});

export const listAnnouncementQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
  cohortId: z.string().cuid().optional(),
});

export type CreateAnnouncementDTO = z.infer<typeof createAnnouncementSchema>;
export type ListAnnouncementQueryDTO = z.infer<typeof listAnnouncementQuerySchema>;

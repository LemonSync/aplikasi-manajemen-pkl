import { z } from 'zod';

export const parentDataSchema = z.object({
  fatherName: z.string().max(100).optional().nullable(),
  fatherJob: z.string().max(100).optional().nullable(),
  fatherPhone: z.string().max(30).optional().nullable(),
  motherName: z.string().max(100).optional().nullable(),
  motherJob: z.string().max(100).optional().nullable(),
  motherPhone: z.string().max(30).optional().nullable(),
  guardianName: z.string().max(100).optional().nullable(),
  guardianJob: z.string().max(100).optional().nullable(),
  guardianPhone: z.string().max(30).optional().nullable(),
});

export type ParentDataDTO = z.infer<typeof parentDataSchema>;

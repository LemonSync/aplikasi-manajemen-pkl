import { z } from 'zod';

/**
 * Skema validasi modul pembimbingan per siswa.
 */

export const assignSupervisionSchema = z.object({
  studentIds: z.array(z.string().cuid()).min(1, 'Minimal 1 siswa').max(200),
  supervisorId: z.string().cuid('ID guru pembimbing tidak valid'),
});

export const listSupervisionQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
  search: z.string().max(120).optional(),
  cohortId: z.string().cuid().optional(),
  supervisorId: z.string().cuid().optional(),
  unassigned: z.enum(['true', 'false']).optional(),
});

export type AssignSupervisionDTO = z.infer<typeof assignSupervisionSchema>;
export type ListSupervisionQueryDTO = z.infer<typeof listSupervisionQuerySchema>;

import { z } from 'zod';

/**
 * Skema validasi inbox verifikasi admin.
 * Urutan default OLDEST: ajuan terlama diproses lebih dulu.
 */
export const listInboxQuerySchema = z.object({
  cohortId: z.string().cuid().optional(),
  order: z.enum(['OLDEST', 'NEWEST']).default('OLDEST'),
});

export type ListInboxQueryDTO = z.infer<typeof listInboxQuerySchema>;

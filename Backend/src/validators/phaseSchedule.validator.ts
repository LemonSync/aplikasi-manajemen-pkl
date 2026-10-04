import { z } from 'zod';
import { StudentPhase } from '@prisma/client';

/**
 * Skema validasi jadwal fase per gelombang.
 */
export const phaseScheduleItemSchema = z.object({
  phase: z.nativeEnum(StudentPhase),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
});

export const replacePhaseScheduleSchema = z.object({
  items: z.array(phaseScheduleItemSchema).min(1, 'Minimal 1 fase diatur'),
});

export type ReplacePhaseScheduleDTO = z.infer<typeof replacePhaseScheduleSchema>;
import { z } from 'zod';
import { GroupStatus } from '@prisma/client';

/**
 * Skema validasi modul kelompok (Fase 2).
 */

/** Terima format date ("2026-09-17") atau datetime ("2026-09-17T00:00:00.000Z"). */
const datetimeOrDate = z.string().refine(
  (val) => !isNaN(Date.parse(val)),
  { message: 'Format tanggal tidak valid' }
);

export const createGroupSchema = z.object({
  name: z.string().min(3, 'Nama kelompok minimal 3 karakter').max(120),
  cohortId: z.string().cuid(),
  majorId: z.string().cuid().optional().nullable(),
  companyId: z.string().cuid().optional().nullable(),
  registrationId: z.string().cuid().optional().nullable(),
  memberUserIds: z.array(z.string().cuid()).optional().default([]),
  supervisorIds: z.array(z.string().cuid()).optional(),
  startDate: datetimeOrDate.optional().nullable(),
  endDate: datetimeOrDate.optional().nullable(),
  publishAnnouncement: z.boolean().optional(),
});

export const updateGroupSchema = z.object({
  name: z.string().min(3).max(120).optional(),
  status: z.nativeEnum(GroupStatus).optional(),
  startDate: datetimeOrDate.optional().nullable(),
  endDate: datetimeOrDate.optional().nullable(),
});

export const setDudiMentorsSchema = z.object({
  mentors: z.array(z.object({ dudiUserId: z.string().cuid(), isPrimary: z.boolean() })).min(1)
    .refine((mentors) => mentors.filter((mentor) => mentor.isPrimary).length === 1, 'Tepat satu DUDI utama wajib dipilih'),
});

export const setSupervisorsSchema = z.object({
  supervisorIds: z
    .array(z.string().cuid())
    .min(1, 'Pilih minimal satu guru pembimbing')
    .max(10, 'Maksimal 10 guru pembimbing'),
});

export const listGroupQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
  cohortId: z.string().cuid().optional(),
  companyId: z.string().cuid().optional(),
  status: z.nativeEnum(GroupStatus).optional(),
});

export type CreateGroupDTO = z.infer<typeof createGroupSchema>;
export type UpdateGroupDTO = z.infer<typeof updateGroupSchema>;
export type ListGroupQueryDTO = z.infer<typeof listGroupQuerySchema>;

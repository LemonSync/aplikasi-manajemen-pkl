import { z } from 'zod';
import { AttendanceStatus, ComplaintStatus } from '@prisma/client';

/**
 * Skema validasi modul Fase 3: absensi, jurnal, pengaduan, kunjungan.
 */

// --- Absensi ---
export const geoBodySchema = z.object({
  lat: z.number().min(-90).max(90),
  long: z.number().min(-180).max(180),
  note: z.string().max(500).optional().nullable(),
});

export const checkInSchema = geoBodySchema;
export const checkOutSchema = geoBodySchema;

export const listAttendanceQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
  groupId: z.string().cuid().optional(),
  userId: z.string().cuid().optional(),
  status: z.nativeEnum(AttendanceStatus).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const summaryQuerySchema = z.object({
  groupId: z.string().cuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

// Monitoring admin: absensi dikelompokkan kelas → kelompok → siswa
export const listByClassQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  status: z.nativeEnum(AttendanceStatus).optional(),
  cohortId: z.string().cuid().optional(),
});

export type ListByClassQueryDTO = z.infer<typeof listByClassQuerySchema>;

export type GeoBodyDTO = z.infer<typeof geoBodySchema>;
export type ListAttendanceQueryDTO = z.infer<typeof listAttendanceQuerySchema>;
export type SummaryQueryDTO = z.infer<typeof summaryQuerySchema>;

// --- Absensi: model baru (status + kegiatan + lokasi) ---
export const submitAttendanceSchema = z.object({
  status: z.nativeEnum(AttendanceStatus),
  activity: z.string().min(3, 'Pelaksanaan kegiatan minimal 3 karakter').max(2000),
  geo: geoBodySchema,
});

export const verifyAttendanceSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  note: z.string().max(1000).optional(),
});

export const listDudiAttendanceQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
  status: z.nativeEnum(AttendanceStatus).optional(),
  groupId: z.string().cuid().optional(),
});

export type SubmitAttendanceDTO = z.infer<typeof submitAttendanceSchema>;
export type VerifyAttendanceDTO = z.infer<typeof verifyAttendanceSchema>;
export type ListDudiAttendanceQueryDTO = z.infer<typeof listDudiAttendanceQuerySchema>;

// --- Jurnal ---
export const saveJournalSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD').optional(),
  activity: z.string().min(3, 'Kegiatan minimal 3 karakter').max(2000),
  result: z.string().max(2000).optional().nullable(),
  obstacles: z.string().max(2000).optional().nullable(),
});

export const updateJournalSchema = z.object({
  activity: z.string().min(3).max(2000).optional(),
  result: z.string().max(2000).optional().nullable(),
  obstacles: z.string().max(2000).optional().nullable(),
});

export const supervisorNoteSchema = z.object({
  note: z.string().min(1, 'Catatan wajib diisi').max(2000),
});

export const listJournalQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
  groupId: z.string().cuid().optional(),
  userId: z.string().cuid().optional(),
});

export const verifyJournalSchema = z.object({
  note: z.string().max(2000).optional(),
});

export type SaveJournalDTO = z.infer<typeof saveJournalSchema>;
export type UpdateJournalDTO = z.infer<typeof updateJournalSchema>;
export type ListJournalQueryDTO = z.infer<typeof listJournalQuerySchema>;

// --- Pengaduan ---
export const createComplaintSchema = z.object({
  subject: z.string().min(3, 'Subjek minimal 3 karakter').max(200),
  body: z.string().min(5, 'Isi pengaduan minimal 5 karakter').max(5000),
});

export const replyComplaintSchema = z.object({
  body: z.string().min(1, 'Balasan wajib diisi').max(5000),
});

export const listComplaintQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
  status: z.nativeEnum(ComplaintStatus).optional(),
  groupId: z.string().cuid().optional(),
  authorId: z.string().cuid().optional(),
  cohortId: z.string().cuid().optional(),
});

export type CreateComplaintDTO = z.infer<typeof createComplaintSchema>;
export type ReplyComplaintDTO = z.infer<typeof replyComplaintSchema>;
export type ListComplaintQueryDTO = z.infer<typeof listComplaintQuerySchema>;

// --- Kunjungan ---
export const createVisitSchema = z.object({
  groupId: z.string().cuid().optional().nullable(),
  companyId: z.string().cuid().optional().nullable(),
  scheduledAt: z.string(),
  note: z.string().max(2000).optional().nullable(),
});

export const markVisitSchema = z.object({
  note: z.string().max(2000).optional().nullable(),
});

// Tunda kunjungan — jadwal baru boleh diisi (ditunda ke waktu lain)
export const postponeVisitSchema = z.object({
  note: z.string().max(2000).optional().nullable(),
  scheduledAt: z.string().optional().nullable(),
});

// Lanjutkan kembali kunjungan yang tertunda — jadwal baru boleh diisi
export const resumeVisitSchema = z.object({
  scheduledAt: z.string().optional().nullable(),
});

export const cancelVisitSchema = z.object({
  note: z.string().max(2000).optional().nullable(),
});

export const listVisitQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
  groupId: z.string().cuid().optional(),
  supervisorId: z.string().cuid().optional(),
});

export type CreateVisitDTO = z.infer<typeof createVisitSchema>;
export type ListVisitQueryDTO = z.infer<typeof listVisitQuerySchema>;

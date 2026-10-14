import { z } from 'zod';
import { AttendanceStatus, ComplaintStatus } from '@prisma/client';

/**
 * Skema validasi modul Fase 3: absensi, pengaduan, kunjungan.
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
  userId: z.string().cuid().optional(),
  status: z.nativeEnum(AttendanceStatus).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const summaryQuerySchema = z.object({
  userId: z.string().cuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

// Monitoring admin: absensi dikelompokkan kelas → siswa
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
// Aturan per-status (kegiatan wajib, GPS wajib, dll) ditegakkan di service.
// geo bisa berupa objek (JSON body) atau string JSON (multipart/form-data).
export const submitAttendanceSchema = z.object({
  status: z.nativeEnum(AttendanceStatus),
  activity: z.string().max(2000).optional().nullable(),
  geo: z.union([geoBodySchema, z.string()]).optional().nullable(),
});

export const verifyAttendanceSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  note: z.string().max(1000).optional(),
});

export type SubmitAttendanceDTO = z.infer<typeof submitAttendanceSchema>;
export type VerifyAttendanceDTO = z.infer<typeof verifyAttendanceSchema>;

// --- Pengaduan ---
export const createComplaintSchema = z.object({
  subject: z.string().min(3, 'Subjek minimal 3 karakter').max(200),
  body: z.string().min(5, 'Isi pengaduan minimal 5 karakter').max(5000),
});

export const replyComplaintSchema = z.object({
  body: z.string().min(1, 'Balasan wajib diisi').max(5000),
});

// Filter monitoring admin: cohortId lewat relasi penulis (author.cohortId)
export const listComplaintQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
  status: z.nativeEnum(ComplaintStatus).optional(),
  authorId: z.string().cuid().optional(),
  cohortId: z.string().cuid().optional(),
});

export type CreateComplaintDTO = z.infer<typeof createComplaintSchema>;
export type ReplyComplaintDTO = z.infer<typeof replyComplaintSchema>;
export type ListComplaintQueryDTO = z.infer<typeof listComplaintQuerySchema>;

// --- Kunjungan (per siswa) ---
export const createVisitSchema = z.object({
  studentId: z.string().cuid().optional().nullable(),
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
  studentId: z.string().cuid().optional(),
  supervisorId: z.string().cuid().optional(),
});

export type CreateVisitDTO = z.infer<typeof createVisitSchema>;
export type ListVisitQueryDTO = z.infer<typeof listVisitQuerySchema>;

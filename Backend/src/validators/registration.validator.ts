import { z } from 'zod';
import { DocumentStatus, DocumentType, RegistrationStatus } from '@prisma/client';

/**
 * Skema validasi modul pendaftaran (Fase 1).
 */

export const registrationMemberSchema = z.object({
  userId: z.string().cuid().optional().nullable(),
  // Nama & kelas BOLEH kosong saat dikirim: backend mengisi otomatis
  // dari Master Siswa (lookup by NISN) sebelum divalidasi disimpan.
  fullName: z.string().max(150).optional().nullable(),
  nisn: z.string().regex(/^\d{10}$/, 'NISN harus terdiri dari 10 digit angka').optional().nullable(),
  className: z.string().max(30).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  isLeader: z.boolean().optional(),
});

export const saveRegistrationSchema = z.object({
  groupName: z.string().min(3, 'Nama kelompok minimal 3 karakter').max(120),
  cohortId: z.string().cuid(),
  majorId: z.string().cuid().optional().nullable(),
  companyName: z.string().min(2, 'Nama perusahaan wajib diisi').max(200),
  companyAddress: z.string().min(5, 'Alamat perusahaan wajib diisi').max(500),
  companyIndustry: z.string().max(150).optional().nullable(),
  companyPhone: z.string().max(30).optional().nullable(),
  companyCity: z.string().max(120).optional().nullable(),
  companyWebsite: z.string().max(255).optional().nullable(),
  companyContacts: z.array(z.string().max(30)).optional().nullable(),
  members: z.array(registrationMemberSchema).min(1, 'Minimal 1 anggota'),
});

export const reviewRegistrationSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  note: z.string().max(1000).optional(),
});

export const listRegistrationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
  status: z.nativeEnum(RegistrationStatus).optional(),
  cohortId: z.string().cuid().optional(),
  // 'true' → sembunyikan pendaftaran yang sudah membentuk kelompok
  // (dipakai dropdown "Bentuk Kelompok dari Pendaftaran" di admin).
  withoutGroup: z.enum(['true', 'false']).optional(),
});

export type SaveRegistrationDTO = z.infer<typeof saveRegistrationSchema>;
export type ReviewRegistrationDTO = z.infer<typeof reviewRegistrationSchema>;
export type ListRegistrationQueryDTO = z.infer<typeof listRegistrationQuerySchema>;

// --- Dokumen ---
export const verifyDocumentSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  note: z.string().max(1000).optional(),
});

export const uploadDocumentSchema = z.object({
  type: z.nativeEnum(DocumentType),
  title: z.string().max(200).optional(),
  cohortId: z.string().cuid().optional(),
});

export const listDocumentQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
  status: z.nativeEnum(DocumentStatus).optional(),
  type: z.nativeEnum(DocumentType).optional(),
  cohortId: z.string().cuid().optional(),
});

export type UploadDocumentDTO = z.infer<typeof uploadDocumentSchema>;
export type VerifyDocumentDTO = z.infer<typeof verifyDocumentSchema>;
export type ListDocumentQueryDTO = z.infer<typeof listDocumentQuerySchema>;

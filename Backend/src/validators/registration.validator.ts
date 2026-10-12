import { z } from 'zod';
import { DocumentStatus, DocumentType, RegistrationStatus } from '@prisma/client';

/**
 * Skema validasi modul pendaftaran (Fase 1).
 */

export const saveRegistrationSchema = z.object({
  // Gelombang opsional: backend mengambil dari akun siswa bila tidak dikirim.
  cohortId: z.string().cuid().optional(),
  // Perusahaan dipilih dari daftar (GET /api/companies/options), bukan teks bebas.
  companyId: z.string().cuid('Perusahaan tidak valid'),
  majorId: z.string().cuid().optional().nullable(),
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

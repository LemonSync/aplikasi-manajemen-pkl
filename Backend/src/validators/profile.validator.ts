import { z } from 'zod';

/**
 * Data orang tua/wali. Minimal salah satu nama harus terisi:
 * Ayah, Ibu, atau Wali — tidak boleh kosong semua.
 */
export const parentDataSchema = z
  .object({
    fatherName: z.string().trim().max(100).optional().nullable(),
    fatherJob: z.string().trim().max(100).optional().nullable(),
    fatherPhone: z.string().trim().max(30).optional().nullable(),
    motherName: z.string().trim().max(100).optional().nullable(),
    motherJob: z.string().trim().max(100).optional().nullable(),
    motherPhone: z.string().trim().max(30).optional().nullable(),
    guardianName: z.string().trim().max(100).optional().nullable(),
    guardianJob: z.string().trim().max(100).optional().nullable(),
    guardianPhone: z.string().trim().max(30).optional().nullable(),
  })
  .superRefine((val, ctx) => {
    const hasAny = Boolean(val.fatherName || val.motherName || val.guardianName);
    if (!hasAny) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Minimal salah satu harus diisi: nama Ayah, Ibu, atau Wali',
        path: ['fatherName'],
      });
    }
  });

export type ParentDataDTO = z.infer<typeof parentDataSchema>;

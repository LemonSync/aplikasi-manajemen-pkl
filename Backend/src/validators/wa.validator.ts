import { z } from 'zod';
import { SPAM_BOUNDS } from '../services/wa/waAntiSpam';
import { normalizeWaNumber } from '../services/wa/waNumber';

/**
 * Nomor WhatsApp: dibersihkan ke format internasional polos (62812…).
 * Nomor lokal `0812…` ditolak WhatsApp saat membuat grup, jadi diubah bukan divalidasi mati.
 */
const waNumber = z
  .string()
  .trim()
  .refine((value) => normalizeWaNumber(value) !== null, 'Nomor WhatsApp harus 10–16 digit, gunakan format 6281234567890')
  .transform((value) => normalizeWaNumber(value) as string);

export const updateWaSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  welcomeText: z.string().trim().min(10).max(600).optional(),
  csContact: z.string().trim().max(300).optional(),
  groupEnabled: z.boolean().optional(),
  groupAdmins: z.array(waNumber).max(20).optional(),
  reminderEnabled: z.boolean().optional(),
  retentionDays: z.coerce.number().int().min(0).max(365).optional(),
  spam: z
    .object({
      windowSec: z.coerce
        .number()
        .int()
        .min(SPAM_BOUNDS.windowSec.min, `Jendela hitung minimal ${SPAM_BOUNDS.windowSec.min} detik`)
        .max(SPAM_BOUNDS.windowSec.max, `Jendela hitung maksimal ${SPAM_BOUNDS.windowSec.max} detik`),
      maxPerWindow: z.coerce
        .number()
        .int()
        .min(SPAM_BOUNDS.maxPerWindow.min, 'Minimal 1 pesan boleh dijawab per jendela')
        .max(SPAM_BOUNDS.maxPerWindow.max, `Maksimal ${SPAM_BOUNDS.maxPerWindow.max} pesan per jendela`),
      cooldownSec: z.coerce
        .number()
        .int()
        .min(SPAM_BOUNDS.cooldownSec.min, `Cooldown minimal ${SPAM_BOUNDS.cooldownSec.min} detik`)
        .max(SPAM_BOUNDS.cooldownSec.max, `Cooldown maksimal ${SPAM_BOUNDS.cooldownSec.max} detik`),
    })
    .optional(),
});

export const waPairingSchema = z.object({ number: waNumber });

export const waGroupCreateSchema = z.object({ cohortId: z.string().trim().min(1) });
export const waGroupAdoptSchema = z.object({
  cohortId: z.string().trim().min(1),
  invite: z.string().trim().min(6).max(200),
});
export const waGroupAdminsSchema = z.object({ numbers: z.array(waNumber).min(1).max(20) });
export const waTestReminderSchema = z.object({ cohortId: z.string().trim().min(1) });

/** rowId = kunci tombol yang dikirim WhatsApp; dibatasi karakter aman. */
const guideRowId = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Kode tombol hanya boleh huruf, angka, - atau _');

export const createWaGuideSchema = z.object({
  parentId: z.string().trim().min(1).nullish(),
  rowId: guideRowId,
  label: z.string().trim().min(2).max(120),
  body: z.string().trim().max(4000).nullish(),
  role: z.enum(['SISWA', 'GURU', 'ADMIN']).optional(),
  order: z.coerce.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

export const updateWaGuideSchema = createWaGuideSchema
  .partial()
  .extend({ parentId: z.string().trim().min(1).nullish() })
  .refine((v) => Object.keys(v).length > 0, 'Tidak ada field yang diubah');

export const waGuideImageSchema = z.object({
  image: z.string().min(32, 'Gambar terlalu kecil'),
});

export const listWaMessageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export type UpdateWaSettingsDTO = z.infer<typeof updateWaSettingsSchema>;
export type WaPairingDTO = z.infer<typeof waPairingSchema>;
export type WaGroupCreateDTO = z.infer<typeof waGroupCreateSchema>;
export type WaGroupAdoptDTO = z.infer<typeof waGroupAdoptSchema>;
export type WaGroupAdminsDTO = z.infer<typeof waGroupAdminsSchema>;
export type WaTestReminderDTO = z.infer<typeof waTestReminderSchema>;
export type CreateWaGuideDTO = z.infer<typeof createWaGuideSchema>;
export type UpdateWaGuideDTO = z.infer<typeof updateWaGuideSchema>;
export type WaGuideImageDTO = z.infer<typeof waGuideImageSchema>;
export type ListWaMessageQueryDTO = z.infer<typeof listWaMessageQuerySchema>;

import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env dari root backend
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Validasi environment variable dengan zod.
 * Fail-fast: aplikasi tidak akan start bila konfigurasi tidak valid.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_NAME: z.string().default('Sistem Manajemen PKL'),
  APP_URL: z.string().default('http://localhost:4000'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  TIMEZONE: z.string().default('Asia/Jakarta'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL wajib diisi'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET minimal 16 karakter'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET minimal 16 karakter'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  STORAGE_ROOT: z.string().default('./storage'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().positive().default(10),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

  SEED_SUPERADMIN_USERNAME: z.string().default('superadmin'),
  SEED_SUPERADMIN_PASSWORD: z.string().default('Admin#12345'),
  SEED_SUPERADMIN_NAME: z.string().default('Super Administrator'),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Konfigurasi environment tidak valid:');
  // eslint-disable-next-line no-console
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isDevelopment: raw.NODE_ENV === 'development',
  isTest: raw.NODE_ENV === 'test',
  corsOrigins: raw.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  storageRoot: path.resolve(process.cwd(), raw.STORAGE_ROOT),
  maxUploadSizeBytes: raw.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
};

export type Env = typeof env;

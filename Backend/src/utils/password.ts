import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { env } from '../config/env';

/**
 * Hash password dengan bcrypt.
 */
export const hashPassword = async (plain: string): Promise<string> => {
  const salt = await bcrypt.genSalt(env.BCRYPT_SALT_ROUNDS);
  return bcrypt.hash(plain, salt);
};

/**
 * Bandingkan password plain dengan hash.
 */
export const comparePassword = async (plain: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(plain, hash);
};

/**
 * Kebijakan minimal password.
 */
export const isStrongPassword = (password: string): boolean => {
  // minimal 8 karakter, ada huruf & angka
  return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password);
};

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const DIGIT = '23456789';

/**
 * Generate password random 8 karakter (huruf + angka) memakai CSPRNG
 * (crypto.randomInt, bukan Math.random) dan dijamin mengandung huruf
 * besar, huruf kecil, dan angka agar lolos kebijakan password kuat.
 */
export const generateRandomPassword = (): string => {
  const chars = UPPER + LOWER + DIGIT;
  const pick = (set: string): string => set.charAt(randomInt(set.length));

  const all = [pick(UPPER), pick(LOWER), pick(DIGIT)];
  while (all.length < 8) all.push(pick(chars));

  // Fisher-Yates shuffle dengan crypto.randomInt
  for (let i = all.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = all[i];
    all[i] = all[j];
    all[j] = tmp;
  }
  return all.join('');
};

import crypto from 'crypto';
import { env } from '../config/env';

// Password awal tidak pernah disimpan plaintext. Kunci diturunkan dari secret
// server sehingga database dump saja tidak dapat dipakai untuk membacanya.
const key = crypto.createHash('sha256').update(env.JWT_REFRESH_SECRET).digest();

export const encryptCredential = (value: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
};

export const decryptCredential = (value: string): string => {
  const [ivValue, tagValue, encryptedValue] = value.split('.');
  if (!ivValue || !tagValue || !encryptedValue) throw new Error('Format kredensial awal tidak valid');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64')), decipher.final()]).toString('utf8');
};

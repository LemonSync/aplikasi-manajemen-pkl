import { systemSettingRepository } from '../repositories/setting.repository';
import { env } from '../config/env';

/**
 * Service pengaturan sistem.
 * Menyediakan pembacaan bertipe (number/boolean) + nilai default identitas sekolah.
 */
export class SettingService {
  /** Nilai default identitas sekolah bila belum diatur di DB. */
  private readonly defaultSchool = {
    name: env.APP_NAME,
    address: 'Jl. Pendidikan No. 1, Kota Contoh',
    phone: '(021) 1234567',
    email: 'info@sekolah.sch.id',
    city: 'Kota Contoh',
  };

  async get(key: string): Promise<string | null> {
    const setting = await systemSettingRepository.findByKey(key);
    return setting?.value ?? null;
  }

  async getNumber(key: string, fallback: number): Promise<number> {
    const raw = await this.get(key);
    const num = Number(raw);
    return Number.isFinite(num) ? num : fallback;
  }

  async getBoolean(key: string, fallback: boolean): Promise<boolean> {
    const raw = await this.get(key);
    if (raw === null) return fallback;
    return raw === 'true' || raw === '1';
  }

  /** Identitas sekolah untuk kop surat. */
  async getSchoolIdentity(): Promise<{
    schoolName: string;
    schoolAddress: string;
    schoolPhone: string;
    schoolEmail: string;
    city: string;
  }> {
    const [name, address, phone, email, city] = await Promise.all([
      this.get('school.name'),
      this.get('school.address'),
      this.get('school.phone'),
      this.get('school.email'),
      this.get('school.city'),
    ]);
    return {
      schoolName: name ?? this.defaultSchool.name,
      schoolAddress: address ?? this.defaultSchool.address,
      schoolPhone: phone ?? this.defaultSchool.phone,
      schoolEmail: email ?? this.defaultSchool.email,
      city: city ?? this.defaultSchool.city,
    };
  }

  async getGradeWeights(): Promise<{ dudi: number; guidance: number }> {
    const [dudi, guidance] = await Promise.all([
      this.getNumber('grade.weight.dudi', 100),
      this.getNumber('grade.weight.guidance', 0),
    ]);
    return { dudi, guidance };
  }
}

export const settingService = new SettingService();

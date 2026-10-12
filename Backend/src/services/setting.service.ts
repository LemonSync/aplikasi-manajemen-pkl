import { systemSettingRepository } from '../repositories/setting.repository';

/** Key setting untuk gelombang PKL yang sedang aktif (global, tunggal). */
export const ACTIVE_COHORT_KEY = 'cohort.active';

/**
 * Service pengaturan sistem.
 * Menyediakan pembacaan bertipe (number/boolean) + nilai default identitas sekolah.
 */
export class SettingService {
  /** Nilai default identitas sekolah (SMKN 9 Medan) bila belum diatur di DB. */
  private readonly defaultSchool = {
    government: 'Pemerintah Provinsi Sumatera Utara',
    dinas: 'Dinas Pendidikan',
    name: 'SMK Negeri 9 Medan',
    programKeahlian:
      'Program Keahlian Pekerjaan Sosial, Teknik Komputer dan Informatika, Seni Rupa',
    address: 'Jalan Patriot No. 20 A Medan Telp. 061-8454350 Fax. 061-8454350 Kode Pos 20127',
    phone: '061-8454350',
    email: 'smkn09medan@gmail.com',
    website: 'www.smkn9medan.sch.id',
    npsn: '10210766',
    city: 'Medan',
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
    government: string;
    dinas: string;
    schoolName: string;
    programKeahlian: string;
    schoolAddress: string;
    schoolPhone: string;
    schoolEmail: string;
    website: string;
    npsn: string;
    city: string;
  }> {
    const [
      government,
      dinas,
      name,
      programKeahlian,
      address,
      phone,
      email,
      website,
      npsn,
      city,
    ] = await Promise.all([
      this.get('school.government'),
      this.get('school.dinas'),
      this.get('school.name'),
      this.get('school.programKeahlian'),
      this.get('school.address'),
      this.get('school.phone'),
      this.get('school.email'),
      this.get('school.website'),
      this.get('school.npsn'),
      this.get('school.city'),
    ]);
    return {
      government: government ?? this.defaultSchool.government,
      dinas: dinas ?? this.defaultSchool.dinas,
      schoolName: name ?? this.defaultSchool.name,
      programKeahlian: programKeahlian ?? this.defaultSchool.programKeahlian,
      schoolAddress: address ?? this.defaultSchool.address,
      schoolPhone: phone ?? this.defaultSchool.phone,
      schoolEmail: email ?? this.defaultSchool.email,
      website: website ?? this.defaultSchool.website,
      npsn: npsn ?? this.defaultSchool.npsn,
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

  /** ID gelombang PKL yang sedang aktif (global). null bila belum diatur. */
  async getActiveCohortId(): Promise<string | null> {
    const raw = await this.get(ACTIVE_COHORT_KEY);
    const id = raw?.trim();
    return id ? id : null;
  }

  /** Tetapkan gelombang PKL aktif (global, tunggal). */
  async setActiveCohortId(cohortId: string, updatedById?: string): Promise<void> {
    await systemSettingRepository.upsert(ACTIVE_COHORT_KEY, {
      value: cohortId,
      type: 'string',
      description: 'Gelombang PKL yang sedang aktif (hanya siswa di gelombang ini yang bisa login)',
      updatedById: updatedById ?? null,
    });
  }
}

export const settingService = new SettingService();

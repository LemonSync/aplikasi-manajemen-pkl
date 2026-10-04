import { cohortRepository } from '../repositories/cohort.repository';
import { majorRepository } from '../repositories/major.repository';
import { industryRepository } from '../repositories/industry.repository';

/**
 * Service data master ringan (gelombang, jurusan, industri) untuk kebutuhan dropdown.
 */
export class MasterDataService {
  async listCohorts() {
    return cohortRepository.findMany();
  }

  async listMajors() {
    return majorRepository.findMany();
  }

  async listIndustries() {
    return industryRepository.findMany();
  }

  /** Bundel semua data master dalam satu panggilan (mengurangi round-trip). */
  async getLookups() {
    const [cohorts, majors, industries] = await Promise.all([
      cohortRepository.findMany(),
      majorRepository.findMany(),
      industryRepository.findMany(),
    ]);
    return { cohorts, majors, industries };
  }

  /**
   * Opsi kelas sesuai daftar resmi sekolah:
   * DKV 1..4, RPL 1..4, PSPT 1..4, ANIMASI 1..4, TKJ 1..4, PEKSOS 1..4
   */
  async listClassOptions() {
    const majors = await majorRepository.findMany();
    const codes = ['DKV', 'RPL', 'PSPT', 'ANIMASI', 'TKJ', 'PEKSOS'];
    const byCode = new Map(majors.map((m) => [m.code, m]));
    const options: Array<{ label: string; value: string; majorCode: string; majorId: string | null }> = [];
    for (const code of codes) {
      for (let n = 1; n <= 4; n++) {
        options.push({
          label: `${code} ${n}`,
          value: `${code} ${n}`,
          majorCode: code,
          majorId: byCode.get(code)?.id ?? null,
        });
      }
    }
    return options;
  }
}

export const masterDataService = new MasterDataService();
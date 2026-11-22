import { Prisma, RegistrationStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { companyRepository } from '../repositories/company.repository';
import { auditService } from './audit.service';
import { settingService } from './setting.service';
import { BadRequestError, ConflictError, NotFoundError } from '../errors/AppError';
import { MESSAGES, AUDIT_ACTIONS, ENTITY_TYPES } from '../config/constants';

export interface CompanyInput {
  name: string;
  address?: string | null;
  industryId?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  website?: string | null;
  quota?: number | null;
}

export interface CompanyQuotaInfo {
  quota: number | null; // null = tanpa batas
  terpakai: number;
  sisa: number | null; // null = tanpa batas
}

/** Konteks perhitungan kuota. */
export interface QuotaScope {
  /**
   * Gelombang yang dihitung. `undefined` = gelombang aktif, `null` = sengaja
   * menghitung seluruh gelombang.
   */
  cohortId?: string | null;
  excludeRegistrationId?: string;
}

/**
 * Service perusahaan mitra (DUDI) dengan kuota siswa PKL.
 *
 * Kuota berlaku PER GELOMBANG: `terpakai` hanya menghitung pendaftaran
 * DISETUJUI pada satu gelombang, jadi saat sekolah membuka gelombang baru
 * angkanya mulai dari nol lagi tanpa perlu reset/manual (siswa gelombang
 * lama sudah selesai dan tidak memakan slot perusahaan).
 *
 * Kuota dua penjaga:
 *  1. Submit pendaftaran (registration.service) ditolak bila sisa <= 0.
 *  2. Approve Surat Penerimaan (document.service) ditolak bila sisa <= 0.
 * `terpakai` diturunkan dari jumlah Surat Penerimaan berstatus DISETUJUI
 * milik siswa yang pendaftarannya menunjuk perusahaan tsb (auto-release
 * saat penerimaan di-reject/re-upload).
 */
export class CompanyService {
  /**
   * Jumlah pendaftaran DISETUJUI yang teratribusi ke sebuah perusahaan pada
   * satu gelombang. `excludeRegistrationId` dipakai Guard 2 (approve Surat
   * Penerimaan) agar pendaftaran siswa yang bersangkutan sendiri tidak ikut
   * dihitung — slotnya sudah diamankan saat pendaftaran di-ACC, jadi tidak
   * boleh dihitung sebagai pemakaian tambahan yang membuat kuota terlihat
   * penuh.
   */
  private async countApprovedAcceptance(
    companyId: string,
    cohortId: string | null,
    excludeRegistrationId?: string
  ): Promise<number> {
    return prisma.registration.count({
      where: {
        companyId,
        status: RegistrationStatus.DISETUJUI,
        deletedAt: null,
        ...(cohortId ? { cohortId } : {}),
        ...(excludeRegistrationId ? { id: { not: excludeRegistrationId } } : {}),
      },
    });
  }

  private async computeQuotaInfo(
    quota: number | null,
    companyId: string,
    scope: QuotaScope = {}
  ): Promise<CompanyQuotaInfo> {
    if (quota == null) return { quota: null, terpakai: 0, sisa: null };
    // Tanpa gelombang aktif yang ditetapkan, hitung seluruh gelombang agar
    // angkanya tidak menyesatkan jadi nol.
    const cohortId = await this.resolveCohortId(scope.cohortId);
    const terpakai = await this.countApprovedAcceptance(companyId, cohortId, scope.excludeRegistrationId);
    return { quota, terpakai, sisa: Math.max(0, quota - terpakai) };
  }

  async getQuotaInfo(companyId: string, scope: QuotaScope = {}): Promise<CompanyQuotaInfo> {
    const company = await companyRepository.findById(companyId);
    if (!company) throw new NotFoundError('Perusahaan tidak ditemukan (mungkin sudah dihapus)');
    return this.computeQuotaInfo(company.quota, companyId, scope);
  }

  /**
   * Guard kuota (submit pendaftaran & approve Surat Penerimaan). Kirim
   * `scope.cohortId` = gelombang pendaftaran tsb dan, untuk approve Surat
   * Penerimaan, `scope.excludeRegistrationId` = id pendaftaran siswa tsb.
   */
  async assertSisaAvailable(companyId: string, scope: QuotaScope = {}): Promise<CompanyQuotaInfo> {
    const info = await this.getQuotaInfo(companyId, scope);
    if (info.sisa !== null && info.sisa <= 0) {
      throw new BadRequestError(
        `Kuota perusahaan sudah penuh (${info.terpakai}/${info.quota} siswa). Silakan pilih perusahaan lain.`
      );
    }
    return info;
  }

  private async resolveCohortId(cohortId?: string | null): Promise<string | null> {
    if (cohortId !== undefined) return cohortId;
    return settingService.getActiveCohortId();
  }

  private async attachQuotaInfo<T extends { id: string; quota: number | null }>(items: T[], scope: QuotaScope = {}) {
    // Resolusi gelombang dilakukan sekali, bukan per perusahaan.
    const cohortId = await this.resolveCohortId(scope.cohortId);
    return Promise.all(
      items.map(async (item) => ({
        ...item,
        ...(await this.computeQuotaInfo(item.quota, item.id, { ...scope, cohortId })),
      }))
    );
  }

  async list(params: { page: number; perPage: number; search?: string; industryId?: string }) {
    const where: Prisma.CompanyWhereInput = {
      ...(params.industryId ? { industryId: params.industryId } : {}),
      ...(params.search
        ? { OR: [{ name: { contains: params.search } }, { city: { contains: params.search } }] }
        : {}),
    };
    const { items, total } = await companyRepository.paginate(
      where,
      (params.page - 1) * params.perPage,
      params.perPage
    );
    return { items: await this.attachQuotaInfo(items), total };
  }

  /**
   * Opsi perusahaan untuk form pendaftaran siswa: hanya perusahaan aktif
   * dengan sisa kuota > 0 (kuota null = tanpa batas).
   *
   * `includeFull=true` ikut mengembalikan perusahaan yang kuotanya sudah habis
   * supaya siswa bisa melihat seluruh daftar beserta isinya (`terpakai`/`quota`)
   * dan menandai sendiri yang penuh — bukan menduganya hilang. Memilih perusahaan
   * penuh tetap diblokir `assertSisaAvailable` saat submit.
   */
  async listOptions(includeFull = false) {
    const companies = await prisma.company.findMany({
      where: { deletedAt: null, isActive: true },
      include: { industry: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    const withInfo = await this.attachQuotaInfo(companies);
    return withInfo
      .filter((c) => includeFull || c.sisa === null || c.sisa > 0)
      .map((c) => ({
        id: c.id,
        name: c.name,
        address: c.address,
        city: c.city,
        phone: c.phone,
        industryName: c.industry?.name ?? null,
        quota: c.quota,
        terpakai: c.terpakai,
        sisa: c.sisa,
      }));
  }

  async getById(id: string) {
    const company = await companyRepository.findByIdWithRelations(id);
    if (!company) throw new NotFoundError(MESSAGES.NOT_FOUND);
    return { ...company, ...(await this.computeQuotaInfo(company.quota, company.id)) };
  }

  async create(input: CompanyInput, actorId: string) {
    const company = await companyRepository.create({
      name: input.name,
      address: input.address ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      city: input.city ?? null,
      website: input.website ?? null,
      quota: input.quota ?? null,
      ...(input.industryId ? { industry: { connect: { id: input.industryId } } } : {}),
    });
    await auditService.record({
      actorId,
      action: AUDIT_ACTIONS.CREATE_COMPANY,
      entityType: ENTITY_TYPES.COMPANY,
      entityId: company.id,
      metadata: { name: company.name, quota: company.quota },
    });
    return company;
  }

  async update(id: string, input: Partial<CompanyInput>) {
    await this.getById(id);
    return companyRepository.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.website !== undefined ? { website: input.website } : {}),
      ...(input.quota !== undefined ? { quota: input.quota } : {}),
      ...(input.industryId ? { industry: { connect: { id: input.industryId } } } : {}),
    });
  }

  async remove(id: string, actorId: string) {
    const company = await this.getById(id);
    // Jangan sampai perusahaan hilang dari pilihan siswa sementara masih ada
    // pendaftaran aktif yang menunjuk ke sana (riwayat jadi yatim + UI error).
    const usedBy = await prisma.registration.count({
      where: {
        companyId: id,
        deletedAt: null,
        status: {
          in: [
            RegistrationStatus.DRAFT,
            RegistrationStatus.DIAJUKAN,
            RegistrationStatus.DISETUJUI,
          ],
        },
      },
    });
    if (usedBy > 0) {
      throw new ConflictError(
        `Perusahaan masih dipakai ${usedBy} pendaftaran siswa dan tidak dapat dihapus. ` +
          'Silakan batalkan/ubah pendaftaran tersebut terlebih dahulu.'
      );
    }
    const deleted = await companyRepository.softDelete(id);
    await auditService.record({
      actorId,
      action: AUDIT_ACTIONS.UPDATE_COMPANY,
      entityType: ENTITY_TYPES.COMPANY,
      entityId: id,
      metadata: { action: 'SOFT_DELETE', name: company.name },
    });
    return deleted;
  }
}

export const companyService = new CompanyService();

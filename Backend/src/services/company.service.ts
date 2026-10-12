import { DocumentStatus, DocumentType, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { companyRepository } from '../repositories/company.repository';
import { auditService } from './audit.service';
import { BadRequestError, NotFoundError } from '../errors/AppError';
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

/**
 * Service perusahaan mitra (DUDI) dengan kuota siswa PKL.
 * Kuota dua penjaga:
 *  1. Submit pendaftaran (registration.service) ditolak bila sisa <= 0.
 *  2. Approve Surat Penerimaan (document.service) ditolak bila sisa <= 0.
 * `terpakai` diturunkan dari jumlah Surat Penerimaan berstatus DISETUJUI
 * milik siswa yang pendaftarannya menunjuk perusahaan tsb (auto-release
 * saat penerimaan di-reject/re-upload).
 */
export class CompanyService {
  /** Jumlah Surat Penerimaan DISETUJUI yang teratribusi ke sebuah perusahaan. */
  private async countApprovedAcceptance(companyId: string): Promise<number> {
    return prisma.document.count({
      where: {
        type: DocumentType.SURAT_PENERIMAAN,
        status: DocumentStatus.DISETUJUI,
        owner: {
          deletedAt: null,
          studentRegistrations: { some: { companyId, deletedAt: null } },
        },
      },
    });
  }

  private async computeQuotaInfo(quota: number | null, companyId: string): Promise<CompanyQuotaInfo> {
    if (quota == null) return { quota: null, terpakai: 0, sisa: null };
    const terpakai = await this.countApprovedAcceptance(companyId);
    return { quota, terpakai, sisa: Math.max(0, quota - terpakai) };
  }

  async getQuotaInfo(companyId: string): Promise<CompanyQuotaInfo> {
    const company = await companyRepository.findById(companyId);
    if (!company) throw new NotFoundError(MESSAGES.NOT_FOUND);
    return this.computeQuotaInfo(company.quota, companyId);
  }

  /** Guard kuota (submit pendaftaran & approve Surat Penerimaan). */
  async assertSisaAvailable(companyId: string): Promise<CompanyQuotaInfo> {
    const info = await this.getQuotaInfo(companyId);
    if (info.sisa !== null && info.sisa <= 0) {
      throw new BadRequestError(
        `Kuota perusahaan sudah penuh (${info.terpakai}/${info.quota} siswa). Silakan pilih perusahaan lain.`
      );
    }
    return info;
  }

  private async attachQuotaInfo<T extends { id: string; quota: number | null }>(items: T[]) {
    return Promise.all(
      items.map(async (item) => ({
        ...item,
        ...(await this.computeQuotaInfo(item.quota, item.id)),
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
   */
  async listOptions() {
    const companies = await prisma.company.findMany({
      where: { deletedAt: null, isActive: true },
      include: { industry: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    const withInfo = await this.attachQuotaInfo(companies);
    return withInfo
      .filter((c) => c.sisa === null || c.sisa > 0)
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
}

export const companyService = new CompanyService();

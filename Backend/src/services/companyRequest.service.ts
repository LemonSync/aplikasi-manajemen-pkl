import { CompanyRequestStatus, Prisma, Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { auditService } from './audit.service';
import { resolveScope, scopeUserWhere, andWhere } from './majorScope.service';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors/AppError';
import { AUDIT_ACTIONS, ENTITY_TYPES, MESSAGES } from '../config/constants';
import type { CreateCompanyRequestDTO, ListCompanyRequestQueryDTO } from '../validators/companyRequest.validator';

export interface AuditContextLite {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Service usulan tempat PKL dari siswa (fase 1).
 *
 * Alur: siswa mengusulkan perusahaan baru → status MENUNGGU → admin
 * menghubungi perusahaan → ACC (otomatis menjadi Company aktif, masuk
 * dropdown semua siswa) atau Tolak (tidak menjadi daftar).
 */
export class CompanyRequestService {
  /** Siswa mengirim usulan tempat PKL. Nama selalu disimpan KAPITAL. */
  async create(studentId: string, input: CreateCompanyRequestDTO, ctx: AuditContextLite) {
    const name = input.name.trim().toUpperCase();

    // Tolak jika nama sudah terdaftar sebagai perusahaan aktif —
    // siswa seharusnya memilihnya dari dropdown, bukan mengusulkan ulang.
    // Collation DB utf8mb4_unicode_ci → equals sudah case-insensitive.
    const existingCompany = await prisma.company.findFirst({
      where: { deletedAt: null, name: { equals: name } },
      select: { id: true },
    });
    if (existingCompany) {
      throw new ConflictError('Perusahaan dengan nama tersebut sudah terdaftar. Silakan pilih dari daftar perusahaan.');
    }

    // Satu siswa hanya boleh punya satu usulan yang sedang menunggu review.
    const pending = await prisma.companyRequest.findFirst({
      where: { studentId, status: CompanyRequestStatus.MENUNGGU },
      select: { id: true, name: true },
    });
    if (pending) {
      throw new ConflictError(`Anda sudah mengirim usulan "${pending.name}" yang masih menunggu review admin.`);
    }

    // Validasi industry bila dikirim.
    if (input.industryId) {
      const industry = await prisma.industry.findUnique({ where: { id: input.industryId }, select: { id: true } });
      if (!industry) throw new BadRequestError('Bidang usaha tidak valid.');
    }

    const request = await prisma.companyRequest.create({
      data: {
        studentId,
        name,
        address: input.address.trim(),
        industryId: input.industryId ?? null,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        website: input.website?.trim() || null,
      },
    });

    await auditService.record({
      actorId: studentId,
      action: AUDIT_ACTIONS.CREATE_COMPANY_REQUEST,
      entityType: ENTITY_TYPES.COMPANY_REQUEST,
      entityId: request.id,
      metadata: { name: request.name },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return request;
  }

  /** Riwayat usulan milik siswa sendiri. */
  async listMine(studentId: string, page: number, perPage: number) {
    const where: Prisma.CompanyRequestWhereInput = { studentId };
    const [items, total] = await Promise.all([
      prisma.companyRequest.findMany({
        where,
        include: {
          industry: { select: { name: true } },
          company: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      prisma.companyRequest.count({ where }),
    ]);
    return { items, total };
  }

  /** Daftar usulan untuk admin (ADMIN hanya jurusan yang diawasi). */
  async list(params: ListCompanyRequestQueryDTO & { page: number; perPage: number; actor: { id: string; role: Role } }) {
    const scope = await resolveScope(params.actor);
    const where = andWhere(
      {
        ...(params.status ? { status: params.status } : {}),
        ...(params.search
          ? {
              OR: [
                { name: { contains: params.search } },
                { student: { studentProfile: { fullName: { contains: params.search } } } },
              ],
            }
          : {}),
      },
      scopeUserWhere(scope, 'student')
    ) as Prisma.CompanyRequestWhereInput;
    const [items, total] = await Promise.all([
      prisma.companyRequest.findMany({
        where,
        include: {
          industry: { select: { name: true } },
          company: { select: { id: true, name: true } },
          student: {
            select: {
              id: true,
              username: true,
              studentProfile: { select: { fullName: true, nisn: true } },
            },
          },
          reviewedBy: { select: { username: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.perPage,
        take: params.perPage,
      }),
      prisma.companyRequest.count({ where }),
    ]);
    return { items, total };
  }

  /**
   * Review admin: APPROVE → otomatis membuat Company aktif (masuk dropdown
   * siswa); REJECT → ditandai ditolak, tidak menjadi daftar.
   */
  async review(
    id: string,
    actorId: string,
    actorRole: Role,
    action: 'APPROVE' | 'REJECT',
    note: string | null,
    ctx: AuditContextLite
  ) {
    const request = await prisma.companyRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundError('Usulan tempat PKL tidak ditemukan.');
    if (request.status !== CompanyRequestStatus.MENUNGGU) {
      throw new ConflictError('Usulan ini sudah direview sebelumnya.');
    }

    // Scope jurusan: ADMIN hanya boleh me-review usulan siswa dari jurusan yang diawasinya.
    const scope = await resolveScope({ id: actorId, role: actorRole });
    const scoped = scopeUserWhere(scope, 'student');
    if (scoped) {
      const allowed = await prisma.companyRequest.findFirst({
        where: andWhere({ id }, scoped) as Prisma.CompanyRequestWhereInput,
        select: { id: true },
      });
      if (!allowed) throw new ForbiddenError(MESSAGES.SCOPE);
    }

    if (action === 'REJECT') {
      const updated = await prisma.companyRequest.update({
        where: { id },
        data: {
          status: CompanyRequestStatus.DITOLAK,
          reviewNote: note,
          reviewedById: actorId,
          reviewedAt: new Date(),
        },
      });
      await auditService.record({
        actorId,
        action: AUDIT_ACTIONS.REJECT_COMPANY_REQUEST,
        entityType: ENTITY_TYPES.COMPANY_REQUEST,
        entityId: id,
        metadata: { name: request.name, note },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
      return { request: updated, company: null };
    }

    // ACC: transaksi — buat Company aktif + tandai DISETUJUI.
    // Nama bisa saja baru terdaftar saat antrian (race) → pakai nama existing.
    const nowReviewedAt = new Date();
    const [company, updated] = await prisma.$transaction(async (tx) => {
      const dup = await tx.company.findFirst({
        where: { deletedAt: null, name: { equals: request.name } },
      });
      const c =
        dup ??
        (await tx.company.create({
          data: {
            name: request.name,
            address: request.address,
            industryId: request.industryId,
            phone: request.phone,
            email: request.email,
            website: request.website,
            isActive: true,
            // Kuota belum diatur admin — tanpa batas sampai diedit manual.
            quota: null,
          },
        }));
      const r = await tx.companyRequest.update({
        where: { id },
        data: {
          status: CompanyRequestStatus.DISETUJUI,
          reviewNote: note,
          reviewedById: actorId,
          reviewedAt: nowReviewedAt,
          companyId: c.id,
        },
      });
      return [c, r] as const;
    });

    await auditService.record({
      actorId,
      action: AUDIT_ACTIONS.APPROVE_COMPANY_REQUEST,
      entityType: ENTITY_TYPES.COMPANY_REQUEST,
      entityId: id,
      metadata: { name: request.name, companyId: company.id, reusedExisting: Boolean(company.updatedAt < nowReviewedAt) },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return { request: updated, company };
  }
}

export const companyRequestService = new CompanyRequestService();

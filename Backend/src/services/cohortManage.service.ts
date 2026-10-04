import { CohortStatus, Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { NotFoundError } from '../errors/AppError';
import { AUDIT_ACTIONS, ENTITY_TYPES, MESSAGES } from '../config/constants';
import { auditService } from './audit.service';
import { CreateCohortDTO, UpdateCohortDTO } from '../validators/cohort.validator';

/** Status yang dianggap gelombang selesai (ditutup/diarsipkan). */
const CLOSED_STATUSES: CohortStatus[] = [CohortStatus.CLOSED, CohortStatus.ARCHIVED];

/** Akun yang dinonaktifkan saat gelombang ditutup. Guru & admin tidak. */
const CLEANUP_ROLES: Role[] = [Role.SISWA, Role.KETUA, Role.DUDI];

/**
 * Service manajemen gelombang.
 *
 * Penutupan gelombang bersifat SOFT: akun siswa/ketua/DUDI dinonaktifkan
 * (`deletedAt`) sehingga tidak bisa login, tetapi seluruh data operasional
 * (absensi, jurnal, nilai, dokumen, surat, riwayat pendaftaran) TETAP utuh
 * di database dan tetap bisa ditampilkan admin lewat filter gelombang arsip.
 * Membuka kembali gelombang memulihkan akun-akun tersebut.
 */
export class CohortService {
  async create(dto: CreateCohortDTO) {
    return prisma.cohort.create({
      data: {
        name: dto.name,
        academicYear: dto.academicYear ?? null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        description: dto.description ?? null,
      },
    });
  }

  async update(
    id: string,
    dto: UpdateCohortDTO,
    actorId?: string,
    ctx?: { ipAddress?: string; userAgent?: string }
  ): Promise<
    Awaited<ReturnType<typeof prisma.cohort.update>> & {
      deactivatedUsers: number;
      restoredUsers: number;
    }
  > {
    const cohort = await prisma.cohort.findUnique({ where: { id } });
    if (!cohort) throw new NotFoundError(MESSAGES.NOT_FOUND);

    const wasClosed = CLOSED_STATUSES.includes(cohort.status);
    const willClose = dto.status ? CLOSED_STATUSES.includes(dto.status) : wasClosed;

    const updated = await prisma.cohort.update({
      where: { id },
      data: {
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });

    // Efek samping transisi status: tutup = nonaktifkan akun, buka = pulihkan.
    let deactivatedUsers = 0;
    let restoredUsers = 0;
    if (!wasClosed && willClose) {
      deactivatedUsers = await this.setCohortAccountsActive(id, true);
    } else if (wasClosed && !willClose) {
      restoredUsers = await this.setCohortAccountsActive(id, false);
    }

    if (deactivatedUsers > 0 || restoredUsers > 0) {
      await auditService.record({
        actorId,
        action: deactivatedUsers > 0 ? AUDIT_ACTIONS.CLOSE_COHORT : AUDIT_ACTIONS.REOPEN_COHORT,
        entityType: ENTITY_TYPES.COHORT,
        entityId: id,
        metadata: { status: updated.status, deactivatedUsers, restoredUsers },
        ipAddress: ctx?.ipAddress,
        userAgent: ctx?.userAgent,
      });
    }

    return { ...updated, deactivatedUsers, restoredUsers };
  }

  /**
   * Nonaktifkan (deactivate=true) / pulihkan akun siswa, ketua, dan DUDI
   * milik satu gelombang. Hanya menyentuh `deletedAt` — data relasi tidak
   * diubah sama sekali (user soft-delete, bukan hard delete).
   *
   * Catatan: pemulihan berlaku untuk semua akun gelombang tersebut, termasuk
   * yang mungkin dinonaktifkan manual admin sebelumnya (jarang terjadi).
   */
  private async setCohortAccountsActive(cohortId: string, deactivate: boolean): Promise<number> {
    const where = {
      cohortId,
      role: { in: CLEANUP_ROLES },
      ...(deactivate ? { deletedAt: null } : { deletedAt: { not: null } }),
    };
    const count = await prisma.user.count({ where });
    if (count === 0) return 0;
    await prisma.user.updateMany({
      where,
      data: { deletedAt: deactivate ? new Date() : null },
    });
    return count;
  }

  async list(params: { page: number; perPage: number; status?: string }) {
    const where = params.status ? { status: params.status as never } : {};
    const [items, total] = await Promise.all([
      prisma.cohort.findMany({
        where,
        skip: (params.page - 1) * params.perPage,
        take: params.perPage,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.cohort.count({ where }),
    ]);
    return { items, total };
  }

  async getById(id: string) {
    const cohort = await prisma.cohort.findUnique({ where: { id } });
    if (!cohort) throw new NotFoundError(MESSAGES.NOT_FOUND);
    return cohort;
  }
}

export const cohortService = new CohortService();

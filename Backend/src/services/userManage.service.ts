import { prisma } from '../config/prisma';
import { DocumentType, RegistrationStatus, Role } from '@prisma/client';
import { hashPassword, generateRandomPassword } from '../utils/password';
import { encryptCredential } from '../utils/credentialCipher';
import { BadRequestError, NotFoundError } from '../errors/AppError';
import { MESSAGES, AUDIT_ACTIONS, ENTITY_TYPES } from '../config/constants';
import { auditService } from './audit.service';
import { resolveOrCreateClass, classNameWithFallback } from './classResolver.service';
import { CreateUserDTO, UpdateUserDTO, ResetPasswordDTO } from '../validators/user.validator';

/**
 * Service manajemen user (admin).
 */
export class UserManageService {
  async create(dto: CreateUserDTO) {
    const username = dto.username;
    const plainPassword = dto.password;

    // Validasi username & password
    if (!username || !plainPassword) {
      throw new BadRequestError('Username dan password wajib diisi');
    }

    const existing = await prisma.user.findFirst({
      where: { username, deletedAt: null },
    });
    if (existing) throw new BadRequestError('Username sudah digunakan');

    const passwordHash = await hashPassword(plainPassword);

    const user = await prisma.user.create({
      data: {
        username,
        identifier: dto.identifier || null,
        email: dto.email || null,
        passwordHash,
        role: dto.role,
        cohortId: dto.cohortId || null,
        phase: dto.role === 'SISWA' ? 'PRA_PKL' : null,
      },
    });

    // Buat profil berdasarkan role
    if (dto.role === 'SISWA' && dto.fullName && dto.nisn) {
      await prisma.studentProfile.create({
        data: {
          userId: user.id,
          fullName: dto.fullName,
          nisn: dto.nisn,
          classId: dto.classId ?? null,
          majorId: dto.majorId ?? null,
        },
      });
    }

    if (dto.role === 'GURU_PEMBIMBING' && dto.fullName && dto.nip) {
      await prisma.teacherProfile.create({
        data: {
          userId: user.id,
          fullName: dto.fullName,
          nip: dto.nip,
        },
      });
    }

    return user;
  }

  /**
   * Bulk: buat akun siswa dari baris Master Siswa (StudentRegistry) satu gelombang.
   * - Username = NISN, password acak dihasilkan sekali (disimpan terenkripsi di
   *   InitialCredential selama akun masih wajib ganti password).
   * - Baris master yang sudah punya akun (atau pernah punya, kini terhapus)
   *   dilewati dan dilaporkan beserta alasannya.
   * - Kelas dari Master Siswa ("XII-RPL-2") dipetakan ke baris Class
   *   ("XII RPL 2") dan diisi ke StudentProfile.classId; akun lama yang
   *   classId-nya masih null ikut di-backfill saat tombol dijalankan ulang.
   */
  async createStudentsFromRegistry(
    cohortId: string,
    actorId: string,
    ctx: { ipAddress?: string; userAgent?: string }
  ) {
    const cohort = await prisma.cohort.findUnique({ where: { id: cohortId }, select: { name: true } });
    if (!cohort) throw new NotFoundError('Gelombang tidak ditemukan');

    const rows = await prisma.studentRegistry.findMany({
      where: { cohortId, isActive: true },
      orderBy: { nisn: 'asc' },
    });
    if (!rows.length) throw new BadRequestError('Master siswa gelombang ini masih kosong');

    const created: Array<{
      userId: string;
      username: string;
      nisn: string;
      fullName: string;
      password: string;
    }> = [];
    const skipped: Array<{ nisn: string; fullName: string; reason: string }> = [];
    let classBackfilled = 0;

    for (const row of rows) {
      const existing = await prisma.user.findFirst({
        where: { OR: [{ username: row.nisn }, { studentProfile: { nisn: row.nisn } }] },
        select: { id: true, deletedAt: true, studentProfile: { select: { id: true, classId: true } } },
      });
      if (existing) {
        skipped.push({
          nisn: row.nisn,
          fullName: row.fullName,
          reason: existing.deletedAt ? 'pernah punya akun (terhapus)' : 'sudah punya akun',
        });
        // Backfill kelas untuk akun lama yang classId-nya masih null.
        if (!existing.deletedAt && existing.studentProfile && !existing.studentProfile.classId) {
          const backfillClassId = await resolveOrCreateClass(cohortId, row.className);
          if (backfillClassId) {
            await prisma.studentProfile.update({
              where: { id: existing.studentProfile.id },
              data: { classId: backfillClassId },
            });
            classBackfilled++;
          }
        }
        continue;
      }

      const classId = await resolveOrCreateClass(cohortId, row.className);
      const password = generateRandomPassword();
      const passwordHash = await hashPassword(password);
      try {
        const user = await prisma.$transaction(async (tx) => {
          const u = await tx.user.create({
            data: {
              username: row.nisn,
              identifier: row.nisn,
              passwordHash,
              role: Role.SISWA,
              cohortId,
              phase: 'PRA_PKL',
              mustChangePassword: true,
            },
            select: { id: true, username: true },
          });
          await tx.studentProfile.create({
            data: { userId: u.id, fullName: row.fullName, nisn: row.nisn, majorId: row.majorId, classId },
          });
          await tx.initialCredential.upsert({
            where: { userId: u.id },
            create: { userId: u.id, encryptedPassword: encryptCredential(password) },
            update: { encryptedPassword: encryptCredential(password) },
          });
          return u;
        });
        created.push({
          userId: user.id,
          username: user.username,
          nisn: row.nisn,
          fullName: row.fullName,
          password,
        });
      } catch (err) {
        skipped.push({
          nisn: row.nisn,
          fullName: row.fullName,
          reason: `gagal dibuat: ${(err as Error).message?.slice(0, 90) ?? 'unknown'}`,
        });
      }
    }

    await auditService.record({
      actorId,
      action: AUDIT_ACTIONS.CREATE_USER,
      entityType: ENTITY_TYPES.COHORT,
      entityId: cohortId,
      metadata: { bulk: 'MASTER_SISWA', cohortName: cohort.name, total: rows.length, created: created.length, skipped: skipped.length, classBackfilled },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return { total: rows.length, created, skipped, classBackfilled };
  }

  async update(id: string, dto: UpdateUserDTO) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError(MESSAGES.NOT_FOUND);

    return prisma.user.update({ where: { id }, data: dto });
  }

  async list(params: { page: number; perPage: number; role?: string; search?: string; cohortId?: string }) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (params.role) where.role = params.role;
    if (params.cohortId) where.cohortId = params.cohortId;
    if (params.search) {
      where.OR = [
        { username: { contains: params.search } },
        { identifier: { contains: params.search } },
        { email: { contains: params.search } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (params.page - 1) * params.perPage,
        take: params.perPage,
        orderBy: { createdAt: 'desc' },
        include: {
          studentProfile: { include: { class: { select: { name: true } } } },
          teacherProfile: true,
        },
      }),
      prisma.user.count({ where }),
    ]);
    return { items, total };
  }

  async getById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: { studentProfile: true, teacherProfile: true },
    });
    if (!user) throw new NotFoundError(MESSAGES.NOT_FOUND);
    return user;
  }

  /**
   * Data PKL siswa untuk Admin (Manajemen User).
   * - Pendaftaran: pendaftaran milik siswa + perusahaan tujuan.
   * - Fase 2: profil siswa, data orang tua, status Surat Pernyataan.
   * - Pembimbing: guru pembimbing yang menaungi siswa ini.
   */
  async getStudentData(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        identifier: true,
        role: true,
        phase: true,
        isActive: true,
        mustChangePassword: true,
        lastLoginAt: true,
        createdAt: true,
        cohort: { select: { name: true, academicYear: true } },
        studentProfile: {
          select: {
            fullName: true,
            nisn: true,
            phone: true,
            address: true,
            gender: true,
            birthDate: true,
            class: { select: { name: true } },
            major: { select: { name: true } },
            parentData: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundError(MESSAGES.NOT_FOUND);

    const registration = await prisma.registration.findFirst({
      where: { studentId: id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        company: { include: { industry: { select: { name: true } } } },
        major: { select: { name: true } },
        cohort: { select: { name: true, academicYear: true } },
      },
    });

    const supervision = await prisma.studentSupervisor.findUnique({
      where: { studentId: id },
      select: {
        assignedAt: true,
        supervisor: {
          select: { username: true, teacherProfile: { select: { fullName: true } } },
        },
      },
    });

    const pernyataan = await prisma.document.findFirst({
      where: { ownerId: id, type: DocumentType.SURAT_PERNYATAAN },
      orderBy: { createdAt: 'desc' },
      select: { status: true, note: true, verifiedAt: true, createdAt: true },
    });

    const profile = user.studentProfile;
    // Kelas: preferensi Class.name, fallback ke Master Siswa (NISN).
    const registryClassName = await classNameWithFallback(profile);
    return {
      user: {
        id: user.id,
        username: user.username,
        identifier: user.identifier,
        role: user.role,
        phase: user.phase,
        isActive: user.isActive,
        mustChangePassword: user.mustChangePassword,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        cohort: user.cohort,
      },
      pendaftaran: registration
        ? {
            code: registration.code,
            status: registration.status,
            submittedAt: registration.submittedAt,
            permohonanDownloadedAt: registration.permohonanDownloadedAt,
            cohort: registration.cohort,
            majorName: registration.major?.name ?? null,
            company: registration.company
              ? {
                  name: registration.company.name,
                  address: registration.company.address,
                  phone: registration.company.phone,
                  city: registration.company.city,
                  industry: registration.company.industry?.name ?? null,
                }
              : null,
          }
        : null,
      fase2: profile
        ? {
            profile: {
              fullName: profile.fullName,
              nisn: profile.nisn,
              phone: profile.phone,
              address: profile.address,
              gender: profile.gender,
              birthDate: profile.birthDate,
              className: registryClassName,
              majorName: profile.major?.name ?? null,
            },
            parentData: profile.parentData,
            pernyataan,
          }
        : null,
      pembimbing: supervision
        ? {
            supervisorName:
              supervision.supervisor.teacherProfile?.fullName ??
              supervision.supervisor.username,
            assignedAt: supervision.assignedAt,
          }
        : null,
    };
  }

  /**
   * Hapus akun user (soft delete — disembunyikan & tidak bisa login).
   * Aturan:
   *  - Tidak boleh menghapus diri sendiri.
   *  - Admin & super_admin dilindungi.
   *  - Pendaftaran milik user yang belum selesai ikut dinonaktifkan.
   */
  async delete(id: string, actorId: string) {
    if (id === actorId) {
      throw new BadRequestError('Tidak dapat menghapus akun sendiri');
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError(MESSAGES.NOT_FOUND);

    // Lindungi admin & super_admin dari penghapusan
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      throw new BadRequestError('Akun admin dan super admin tidak dapat dihapus');
    }

    // SOFT delete: akun disembunyikan dari daftar & tidak bisa login
    // (auth mengecek deletedAt), tetapi data terkait — absensi, jurnal,
    // nilai, dokumen, surat — TETAP tersimpan di database.
    //
    // Pendaftaran milik user ini IKUT dinonaktifkan bila belum selesai
    // (DRAFT/DIAJUKAN/DISETUJUI) supaya tidak menggantung setelah akun
    // siswa dinonaktifkan.
    const [, orphanedRegs] = await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
      prisma.registration.updateMany({
        where: {
          studentId: id,
          deletedAt: null,
          status: {
            in: [
              RegistrationStatus.DRAFT,
              RegistrationStatus.DIAJUKAN,
              RegistrationStatus.DISETUJUI,
            ],
          },
        },
        data: { deletedAt: new Date() },
      }),
    ]);
    return { ...user, orphanedRegistrations: orphanedRegs.count };
  }

  /**
   * Reset password user.
   * Admin bisa set password baru atau generate random.
   */
  async resetPassword(id: string, dto: ResetPasswordDTO): Promise<{ plainPassword: string }> {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError(MESSAGES.NOT_FOUND);

    if (!dto.newPassword && !dto.generateRandom) {
      throw new BadRequestError('Isi password baru atau centang generate random');
    }

    const plainPassword = dto.generateRandom ? generateRandomPassword() : (dto.newPassword ?? generateRandomPassword());
    const passwordHash = await hashPassword(plainPassword);

    await prisma.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true },
    });
    // Simpan versi terenkripsi agar password awal tetap bisa ditampilkan
    // oleh admin selama akun masih wajib mengganti password.
    await prisma.initialCredential.upsert({
      where: { userId: id },
      create: { userId: id, encryptedPassword: encryptCredential(plainPassword) },
      update: { encryptedPassword: encryptCredential(plainPassword) },
    });

    return { plainPassword };
  }
}

export const userManageService = new UserManageService();

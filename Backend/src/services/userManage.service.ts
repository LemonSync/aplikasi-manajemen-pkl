import { prisma } from '../config/prisma';
import { DocumentType, RegistrationStatus } from '@prisma/client';
import { hashPassword, generateRandomPassword } from '../utils/password';
import { encryptCredential } from '../utils/credentialCipher';
import { BadRequestError, NotFoundError } from '../errors/AppError';
import { MESSAGES } from '../config/constants';
import { autoAssignDudiMentors } from './dudiAssignment.service';
import { CreateUserDTO, UpdateUserDTO, ResetPasswordDTO } from '../validators/user.validator';

/**
 * Service manajemen user (admin).
 */
export class UserManageService {
  async create(dto: CreateUserDTO) {
    // Untuk KETUA: auto-generate username & password
    let username = dto.username;
    let plainPassword = dto.password;

    if (dto.role === 'KETUA') {
      // Generate username unik
      let counter = 1;
      username = `KETUA${String(counter).padStart(3, '0')}`;
      while (await prisma.user.findFirst({ where: { username } })) {
        counter++;
        username = `KETUA${String(counter).padStart(3, '0')}`;
      }
      // Generate password random
      plainPassword = generateRandomPassword();
    } else {
      // Validasi username & password untuk role lain
      if (!username || !plainPassword) {
        throw new BadRequestError('Username dan password wajib diisi');
      }
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
    // KETUA adalah akun kerja sementara, bukan identitas siswa. Profil siswa
    // hanya dibuat saat provisioning anggota (termasuk siswa ketua kelompok).
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

    // DUDI: link ke perusahaan via companyMentor
    if (dto.role === 'DUDI' && dto.companyId) {
      await prisma.companyMentor.create({
        data: {
          userId: user.id,
          companyId: dto.companyId,
          fullName: dto.fullName || dto.username,
        },
      });

      // Otomatis tugaskan ke kelompok aktif perusahaan ini (jika sudah ada)
      const companyGroups = await prisma.group.findMany({
        where: { companyId: dto.companyId, deletedAt: null, status: { not: 'DIBUBARKAN' } },
        select: { id: true },
      });
      for (const group of companyGroups) {
        await autoAssignDudiMentors(group.id, dto.companyId);
      }
    }

    // Untuk KETUA, kembalikan plain password agar admin bisa berikan ke siswa
    if (dto.role === 'KETUA') {
      return { ...user, password: plainPassword };
    }
    return user;
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
          studentProfile: true,
          teacherProfile: true,
          // DUDI: nama mentor + perusahaan agar tampil & bisa dicari di Manajemen User
          companyMentor: {
            select: { fullName: true, company: { select: { name: true } } },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);
    return { items, total };
  }

  async getById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: { studentProfile: true, teacherProfile: true, companyMentor: true },
    });
    if (!user) throw new NotFoundError(MESSAGES.NOT_FOUND);
    return user;
  }

  /**
   * Data PKL siswa untuk Admin (Manajemen User).
   * - Fase 1: pendaftaran awal — kelompok, perusahaan, no. HP anggota (diisi di form pra-pendaftaran).
   * - Fase 2: daftar ulang — profil siswa, data orang tua, status Surat Pernyataan.
   * Akun siswa baru dibuat saat Fase 2, jadi baris data di bawah hanya ada
   * untuk siswa yang sudah melalui pendaftaran (bagian kosong dikembalikan null).
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

    const membership = await prisma.registrationMember.findFirst({
      where: { userId: id, registration: { deletedAt: null } },
      orderBy: { registration: { createdAt: 'desc' } },
      include: {
        registration: {
          select: {
            code: true,
            status: true,
            groupName: true,
            createdAt: true,
            submittedAt: true,
            companyName: true,
            companyAddress: true,
            companyPhone: true,
            companyCity: true,
            companyIndustry: true,
            cohort: { select: { name: true, academicYear: true } },
            members: {
              select: { fullName: true, nisn: true, className: true, phone: true, isLeader: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    const group = await prisma.group.findFirst({
      where: { members: { some: { userId: id } }, deletedAt: null },
      select: {
        name: true,
        code: true,
        status: true,
        company: { select: { name: true } },
        dudiMentors: {
          where: { isPrimary: true },
          select: { dudi: { select: { username: true } } },
        },
      },
    });

    const pernyataan = await prisma.document.findFirst({
      where: { ownerId: id, type: DocumentType.SURAT_PERNYATAAN },
      orderBy: { createdAt: 'desc' },
      select: { status: true, note: true, verifiedAt: true, createdAt: true },
    });

    const profile = user.studentProfile;
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
      fase1: membership
        ? {
            registration: {
              code: membership.registration.code,
              status: membership.registration.status,
              groupName: membership.registration.groupName,
              submittedAt: membership.registration.submittedAt,
              cohort: membership.registration.cohort,
              company: {
                name: membership.registration.companyName,
                address: membership.registration.companyAddress,
                phone: membership.registration.companyPhone,
                city: membership.registration.companyCity,
                industry: membership.registration.companyIndustry,
              },
            },
            member: {
              fullName: membership.fullName,
              nisn: membership.nisn,
              className: membership.className,
              phone: membership.phone,
              isLeader: membership.isLeader,
            },
            members: membership.registration.members,
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
              className: profile.class?.name ?? null,
              majorName: profile.major?.name ?? null,
            },
            parentData: profile.parentData,
            pernyataan,
          }
        : null,
      group,
    };
  }

  /**
   * Hapus akun user (soft delete — disembunyikan & tidak bisa login).
   * Aturan:
   *  - Tidak boleh menghapus diri sendiri.
   *  - Hanya role SISWA, GURU_PEMBIMBING, DUDI yang boleh dihapus (admin & super_admin dilindungi).
   *  - Pendaftaran yang dipimpin user & belum membentuk kelompok ikut dinonaktifkan.
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
    // Pendaftaran yang dipimpin user ini IKUT dinonaktifkan bila belum
    // membentuk kelompok: pendaftaran yatim (ketua dihapus) akan terus
    // mengikat NISN anggota lewat assertMembersFree sehingga NISN tidak
    // bisa didaftarkan ulang oleh ketua baru, padahal di halaman Kelompok
    // tidak ada kelompoknya. Pendaftaran yang SUDAH menjadi kelompok tetap
    // dipertahankan (Group.registration menunjuk ke sana).
    const [, orphanedRegs] = await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
      prisma.registration.updateMany({
        where: {
          leaderId: id,
          deletedAt: null,
          group: null,
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
    // Simpan versi terenkripsi agar ketua pengaju dapat membagikan ulang
    // kredensial akun siswa yang diprovisioning.
    await prisma.initialCredential.upsert({
      where: { userId: id },
      create: { userId: id, encryptedPassword: encryptCredential(plainPassword) },
      update: { encryptedPassword: encryptCredential(plainPassword) },
    });

    return { plainPassword };
  }
}

export const userManageService = new UserManageService();

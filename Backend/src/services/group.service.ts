import { GroupStatus, Prisma, RegistrationStatus, Role, StudentPhase } from '@prisma/client';
import { prisma } from '../config/prisma';
import { groupRepository, GroupWithRelations } from '../repositories/group.repository';
import { registrationRepository } from '../repositories/registration.repository';
import { companyRepository } from '../repositories/company.repository';
import { industryRepository } from '../repositories/industry.repository';
import { hashPassword, generateRandomPassword } from '../utils/password';
import { decryptCredential, encryptCredential } from '../utils/credentialCipher';
import { auditService } from './audit.service';
import { autoAssignDudiMentors } from './dudiAssignment.service';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors/AppError';
import { AUDIT_ACTIONS, ENTITY_TYPES, MESSAGES } from '../config/constants';

export interface CreateGroupInput {
  name: string;
  cohortId: string;
  majorId?: string | null;
  companyId?: string | null;
  registrationId?: string | null;
  memberUserIds: string[];
  startDate?: string | null;
  endDate?: string | null;
  supervisorIds?: string[];
  publishAnnouncement?: boolean;
}

/**
 * Service kelompok PKL (Fase 2).
 * Aturan kunci:
 *   - Semua anggota WAJIB satu jurusan yang sama (validasi ketat).
 *   - Satu siswa tidak boleh berada di lebih dari satu kelompok pada gelombang yang sama.
 *   - Bila dibentuk dari sebuah Registration, anggota diambil/dipetakan dari pendaftaran
 *     dan perusahaan tujuan di-copy menjadi Company resmi.
 */
export class GroupService {
  private async generateCode(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `GRP-${year}-`;
    const count = await groupRepository.countByCodePrefix(prefix);
    return `${prefix}${String(count + 1).padStart(4, '0')}`;
  }

  /** Membentuk kelompok secara manual oleh admin. */
  async create(input: CreateGroupInput, actorId: string, ctx: { ipAddress?: string; userAgent?: string }) {
    const memberUserIds = [...input.memberUserIds];
    let studentLeaderId: string | null = null;
    let registration: Awaited<ReturnType<typeof registrationRepository.findById>> | null = null;

    if (input.registrationId) {
      registration = await registrationRepository.findById(input.registrationId);
      if (!registration) throw new NotFoundError('Pendaftaran tidak ditemukan');

      // Auto-create akun untuk anggota yang belum punya akun
      for (const member of registration.members) {
        if (!member.userId) {
          // NISN wajib ada untuk username
          let nisn = member.nisn;
          if (!nisn) {
            nisn = `NISN${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
          }
          // Pastikan nisn unik
          while (await prisma.studentProfile.findFirst({ where: { nisn } })) {
            nisn = `NISN${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
          }

          const plainPassword = generateRandomPassword();
          const passwordHash = await hashPassword(plainPassword);

          const new_user = await prisma.user.create({
            data: {
              username: nisn, // Username = NISN
              identifier: nisn,
              passwordHash,
              role: Role.SISWA,
              phase: StudentPhase.PRA_PKL,
              cohortId: input.cohortId,
              mustChangePassword: true,
              studentProfile: {
                create: {
                  fullName: member.fullName,
                  nisn,
                },
              },
            },
          });
          await prisma.registrationMember.update({
            where: { id: member.id },
            data: { userId: new_user.id },
          });
          if (member.isLeader) studentLeaderId = new_user.id;
          memberUserIds.push(new_user.id);
        } else {
          if (member.isLeader) studentLeaderId = member.userId;
          if (!memberUserIds.includes(member.userId)) {
            memberUserIds.push(member.userId);
          }
        }
      }
    }

    if (memberUserIds.length === 0) {
      throw new BadRequestError(MESSAGES.GROUP.NO_MEMBERS);
    }

    // --- Validasi siswa & jurusan seragam ---
    const users = await prisma.user.findMany({
      where: { id: { in: memberUserIds } },
      include: { studentProfile: true },
    });
    if (users.length !== memberUserIds.length) {
      throw new NotFoundError('Beberapa siswa tidak ditemukan');
    }
    if (users.some((user) => user.role !== Role.SISWA)) {
      throw new BadRequestError('Anggota kelompok harus menggunakan akun SISWA; akun KETUA hanya untuk pendaftaran sementara');
    }

    const majors = new Set(
      users
        .map((u) => u.studentProfile?.majorId ?? null)
        .filter((m): m is string => Boolean(m))
    );

    let majorId = input.majorId ?? null;
    if (majors.size > 1) {
      throw new BadRequestError(MESSAGES.GROUP.MAJOR_MISMATCH);
    }
    if (!majorId && majors.size === 1) {
      majorId = [...majors][0];
    }

    // --- Pastikan siswa belum tergabung di kelompok lain pada gelombang ini ---
    const existingMemberships = await prisma.groupMember.findMany({
      where: { userId: { in: memberUserIds }, group: { cohortId: input.cohortId, deletedAt: null } },
      include: { group: { select: { name: true } } },
    });
    if (existingMemberships.length > 0) {
      throw new ConflictError(
        `${MESSAGES.GROUP.MEMBER_EXISTS}: ${existingMemberships.map((m) => m.group.name).join(', ')}`
      );
    }

    // --- Resolve company (dari registration bila ada) ---
    let companyId = input.companyId ?? null;
    if (!companyId && registration) {
      const company = await this.resolveCompanyFromRegistration(registration.companyName, {
        address: registration.companyAddress,
        industry: registration.companyIndustry,
        phone: registration.companyPhone,
        city: registration.companyCity,
      });
      companyId = company.id;
    }

    const code = await this.generateCode();

    // --- Buat kelompok + anggota (transaksi) ---
    const group = await prisma.$transaction(async (tx) => {
      const created = await tx.group.create({
        data: {
          name: input.name,
          code,
          cohort: { connect: { id: input.cohortId } },
          status: GroupStatus.AKTIF,
          ...(majorId ? { major: { connect: { id: majorId } } } : {}),
          ...(companyId ? { company: { connect: { id: companyId } } } : {}),
          ...(input.registrationId ? { registration: { connect: { id: input.registrationId } } } : {}),
          startDate: input.startDate ? new Date(input.startDate) : null,
          endDate: input.endDate ? new Date(input.endDate) : null,
        },
      });

      await tx.groupMember.createMany({
        data: memberUserIds.map((userId, idx) => ({
          groupId: created.id,
          userId,
          // Saat bersumber dari registration, gunakan penanda siswa ketua;
          // akun KETUA sementara tidak pernah menjadi anggota kelompok.
          isLeader: studentLeaderId ? userId === studentLeaderId : idx === 0,
        })),
      });

      if (input.supervisorIds && input.supervisorIds.length > 0) {
        await tx.groupSupervisor.createMany({
          data: input.supervisorIds.map((userId, idx) => ({
            groupId: created.id,
            userId,
            isPrimary: idx === 0,
          })),
        });
      }

      // Tandai pendaftaran terkait sebagai DISETUJUI bila belum
      if (input.registrationId) {
        await tx.registration.update({
          where: { id: input.registrationId },
          data: { status: RegistrationStatus.DISETUJUI },
        });
      }

      // Pengumuman hasil pembentukan kelompok
      if (input.publishAnnouncement !== false) {
        await tx.announcement.create({
          data: {
            title: `Pembentukan Kelompok: ${created.name}`,
            body: `Kelompok ${created.name} (${created.code}) telah dibentuk. Silakan cek detail penempatan pada menu kelompok.`,
            cohortId: input.cohortId,
            authorId: actorId,
          },
        });
      }

      return created;
    });

    // Tugaskan otomatis mentor DUDI perusahaan ke kelompok baru
    const assignedDudi = await autoAssignDudiMentors(group.id, companyId);

    await auditService.record({
      actorId,
      action: AUDIT_ACTIONS.CREATE_GROUP,
      entityType: ENTITY_TYPES.GROUP,
      entityId: group.id,
      metadata: { code: group.code, members: memberUserIds.length, dudiMentors: assignedDudi },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return groupRepository.findByIdWithRelations(group.id);
  }

  /** Cari/buat company dari data pendaftaran (dipakai saat pembentukan kelompok). */
  private async resolveCompanyFromRegistration(
    name: string,
    info: { address?: string | null; industry?: string | null; phone?: string | null; city?: string | null }
  ) {
    const existing = await companyRepository.findByName(name);
    if (existing) return existing;

    let industryId: string | null = null;
    if (info.industry) {
      const industry = await industryRepository.findOrCreateByName(info.industry);
      industryId = industry.id;
    }

    return companyRepository.create({
      name,
      address: info.address ?? null,
      phone: info.phone ?? null,
      city: info.city ?? null,
      ...(industryId ? { industry: { connect: { id: industryId } } } : {}),
    });
  }

  /**
   * Detail kelompok. Bila `viewer` diberikan (endpoint publik role), akses
   * dicek: Admin/Kepsek bebas, guru hanya kelompok bimbingannya, siswa/ketua/dudi
   * hanya kelompok sendiri — mencegah IDOR (siswa membuka kelompok lain).
   * Panggilan internal (admin flow) tanpa `viewer` melewati cek ini.
   */
  async getById(id: string, viewer?: { userId: string; role: Role }) {
    const group = await groupRepository.findByIdWithRelations(id);
    if (!group) throw new NotFoundError(MESSAGES.NOT_FOUND);
    if (viewer) this.assertViewerAccess(group, viewer);
    return group;
  }

  private assertViewerAccess(
    group: GroupWithRelations,
    viewer: { userId: string; role: Role }
  ): void {
    const { userId, role } = viewer;
    if (role === Role.ADMIN || role === Role.SUPER_ADMIN || role === Role.KEPALA_SEKOLAH) return;

    if (role === Role.GURU_PEMBIMBING) {
      if (group.supervisors.some((s) => s.userId === userId)) return;
      throw new ForbiddenError(MESSAGES.SCOPE);
    }

    // SISWA / KETUA / DUDI: hanya kelompok sendiri (anggota atau mentor DUDI).
    const isMember = group.members.some((m) => m.userId === userId);
    const isDudi =
      group.dudiMentors.some((d) => d.dudiUserId === userId) ||
      (group.company?.mentors ?? []).some((m) => m.userId === userId);
    if (isMember || isDudi) return;
    throw new ForbiddenError(MESSAGES.SCOPE);
  }

  /** Kredensial awal kelompok; hanya untuk administrasi akun oleh Admin. */
  async getCredentials(id: string) {
    const group = await this.getById(id);
    const reveal = async (user: { id: string; username: string; mustChangePassword: boolean }) => {
      let credential = await prisma.initialCredential.findUnique({ where: { userId: user.id } });
      if (!credential && user.mustChangePassword) {
        // Backfill akun lama yang belum dipakai login pertama.
        const plainPassword = generateRandomPassword();
        await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(plainPassword) } });
        credential = await prisma.initialCredential.upsert({
          where: { userId: user.id },
          create: { userId: user.id, encryptedPassword: encryptCredential(plainPassword) },
          update: { encryptedPassword: encryptCredential(plainPassword) },
        });
      }
      return {
        userId: user.id,
        username: user.username,
        password: credential ? decryptCredential(credential.encryptedPassword) : '(password telah diubah; reset oleh Admin bila diperlukan)',
      };
    };

    const students = await Promise.all(group.members.map(async (member) => ({
      ...(await reveal(member.user)),
      fullName: member.user.studentProfile?.fullName ?? member.user.username,
      isLeader: member.isLeader,
    })));
    const dudi = await Promise.all((group.company?.mentors ?? []).map(async (mentor) => ({
      ...(await reveal(mentor.user)), fullName: mentor.fullName,
    })));
    return { students, dudi };
  }

  /** Admin: menetapkan/mengganti guru pembimbing kelompok. */
  async setSupervisors(
    groupId: string,
    supervisorIds: string[],
    actorId: string,
    ctx: { ipAddress?: string; userAgent?: string }
  ) {
    const group = await this.getById(groupId);
    if (supervisorIds.length === 0) {
      throw new BadRequestError('Pilih minimal satu guru pembimbing');
    }
    const uniqueIds = [...new Set(supervisorIds)];
    const teacherCount = await prisma.user.count({
      where: { id: { in: uniqueIds }, role: Role.GURU_PEMBIMBING, deletedAt: null },
    });
    if (teacherCount !== uniqueIds.length) {
      throw new BadRequestError('Semua pembimbing harus akun Guru Pembimbing yang aktif');
    }

    await prisma.$transaction([
      prisma.groupSupervisor.deleteMany({ where: { groupId } }),
      prisma.groupSupervisor.createMany({
        data: uniqueIds.map((userId, idx) => ({ groupId, userId, isPrimary: idx === 0 })),
      }),
    ]);

    await auditService.record({
      actorId,
      action: AUDIT_ACTIONS.UPDATE_GROUP,
      entityType: ENTITY_TYPES.GROUP,
      entityId: group.id,
      metadata: { action: 'SET_SUPERVISORS', supervisorIds: uniqueIds },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return this.getById(groupId);
  }

  async setDudiMentors(groupId: string, mentors: Array<{ dudiUserId: string; isPrimary: boolean }>) {
    const group = await this.getById(groupId);
    const ids = mentors.map((mentor) => mentor.dudiUserId);
    const valid = await prisma.companyMentor.count({ where: { userId: { in: ids }, companyId: group.companyId ?? '__none__' } });
    if (valid !== ids.length) throw new BadRequestError('DUDI harus berasal dari perusahaan kelompok ini');
    await prisma.$transaction([
      prisma.groupDudiMentor.deleteMany({ where: { groupId } }),
      prisma.groupDudiMentor.createMany({ data: mentors.map((mentor) => ({ groupId, ...mentor })) }),
    ]);
  }

  /** Kelompok yang diikuti siswa (untuk dashboard siswa). */
  async getMyGroups(userId: string) {
    return groupRepository.findByMember(userId);
  }

  /** Kelompok yang dibimbing guru (scope guard untuk guru). */
  async getSupervisedGroups(teacherId: string) {
    const rows = await prisma.groupSupervisor.findMany({
      where: { userId: teacherId, group: { deletedAt: null } },
      select: { groupId: true },
    });
    const ids = rows.map((r) => r.groupId);
    if (ids.length === 0) return [];
    const { items } = await groupRepository.paginate({ id: { in: ids } }, 0, 100);
    return items;
  }

  /** Memastikan guru adalah pembimbing kelompok (scope guard). */
  async assertSupervisor(teacherId: string, groupId: string): Promise<void> {
    const rel = await prisma.groupSupervisor.findFirst({ where: { userId: teacherId, groupId } });
    if (!rel) throw new BadRequestError(MESSAGES.SCOPE);
  }

  async list(params: {
    page: number;
    perPage: number;
    cohortId?: string;
    status?: GroupStatus;
    companyId?: string;
  }) {
    const where: Prisma.GroupWhereInput = {
      ...(params.cohortId ? { cohortId: params.cohortId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.companyId ? { companyId: params.companyId } : {}),
    };
    return groupRepository.paginate(where, (params.page - 1) * params.perPage, params.perPage);
  }

  async update(
    id: string,
    data: { name?: string; status?: GroupStatus; startDate?: string | null; endDate?: string | null },
    actorId: string
  ) {
    await this.getById(id);
    const updated = await groupRepository.update(id, {
      ...(data.name ? { name: data.name } : {}),
      ...(data.status ? { status: data.status } : {}),
      ...(data.startDate !== undefined ? { startDate: data.startDate ? new Date(data.startDate) : null } : {}),
      ...(data.endDate !== undefined ? { endDate: data.endDate ? new Date(data.endDate) : null } : {}),
    });
    await auditService.record({
      actorId,
      action: AUDIT_ACTIONS.UPDATE_GROUP,
      entityType: ENTITY_TYPES.GROUP,
      entityId: id,
      metadata: data as Prisma.InputJsonValue,
    });
    return updated;
  }

  /**
   * Hapus kelompok + hapus akun semua anggota.
   * Hanya bisa dihapus jika kelompok belum aktif (DRAFT) atau belum ada absensi.
   */
  async delete(id: string, actorId: string): Promise<void> {
    const group = await groupRepository.findByIdWithRelations(id);
    if (!group) throw new NotFoundError(MESSAGES.NOT_FOUND);

    // Cek apakah ada absensi terkait kelompok ini
    const attendanceCount = await prisma.attendance.count({
      where: { groupId: id },
    });
    if (attendanceCount > 0) {
      throw new BadRequestError('Tidak dapat menghapus kelompok yang sudah memiliki absensi');
    }

    // Cek data akademik/surat yang tidak boleh hilang
    const [gradeCount, letterCount] = await Promise.all([
      prisma.grade.count({ where: { groupId: id } }),
      prisma.generatedLetter.count({ where: { relatedGroupId: id } }),
    ]);
    if (gradeCount > 0 || letterCount > 0) {
      throw new BadRequestError(
        'Tidak dapat menghapus kelompok yang sudah memiliki nilai atau surat terbit. Nonaktifkan kelompok melalui status DIBUBARKAN.'
      );
    }

    // Ambil semua userId anggota
    const memberUserIds = group.members.map((m) => m.userId);

    await prisma.$transaction(async (tx) => {
      // Hapus group members, supervisors, placements
      await tx.groupMember.deleteMany({ where: { groupId: id } });
      await tx.groupSupervisor.deleteMany({ where: { groupId: id } });
      await tx.groupPlacement.deleteMany({ where: { groupId: id } });

      // Hapus kelompok
      await tx.group.delete({ where: { id } });

      // Hapus akun semua anggota
      for (const userId of memberUserIds) {
        // Hapus SISWA, DUDI, dan KETUA
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (user && (user.role === Role.SISWA || user.role === Role.DUDI || user.role === Role.KETUA)) {
          await tx.user.delete({ where: { id: userId } });
        }
      }
    });

    await auditService.record({
      actorId,
      action: AUDIT_ACTIONS.UPDATE_GROUP,
      entityType: ENTITY_TYPES.GROUP,
      entityId: id,
      metadata: { action: 'DELETE', deletedMembers: memberUserIds.length },
    });
  }
}

export const groupService = new GroupService();

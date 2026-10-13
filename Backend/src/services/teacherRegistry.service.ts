import { prisma } from '../config/prisma';
import { Role } from '@prisma/client';
import { teacherRegistryRepository } from '../repositories/teacherRegistry.repository';
import { hashPassword, generateRandomPassword } from '../utils/password';
import { encryptCredential } from '../utils/credentialCipher';
import { BadRequestError, NotFoundError } from '../errors/AppError';
import { AUDIT_ACTIONS, ENTITY_TYPES } from '../config/constants';
import { auditService } from './audit.service';
import { ensureSchoolMajors } from './schoolMajor.service';

/** NIP: 18 digit angka (spasi diabaikan, format NIP lama "1985 01 01 ..." tetap diterima). */
export const NIP_PATTERN = /^\d{18}$/;
export const normalizeNip = (raw: unknown): string => String(raw ?? '').replace(/\s+/g, '');

export interface ProvisionedTeacherAccount {
  userId: string;
  username: string;
  nip: string;
  fullName: string;
  password: string;
}

export interface TeacherProvisionResult {
  created: ProvisionedTeacherAccount[];
  skipped: number;
  errors: Array<{ nip: string; reason: string }>;
}

export interface TeacherRegistryRemoveResult {
  fullName: string;
  nip: string;
  accounts: number;
  supervisions: number;
  visits: number;
}

export class TeacherRegistryService {
  async lookup(nip: string, cohortId: string) {
    const row = await prisma.teacherRegistry.findFirst({ where: { nip, cohortId, isActive: true }, include: { major: true } });
    if (!row) throw new NotFoundError('NIP tidak ditemukan pada master guru gelombang ini');
    return row;
  }

  /**
   * Buat akun GURU_PEMBIMBING untuk satu baris master (username = NIP).
   * Mengembalikan null bila sudah punya akun (username/identifier/profil NIP sama).
   */
  private async createAccountFor(row: {
    id: string;
    nip: string;
    fullName: string;
    majorId: string | null;
  }): Promise<ProvisionedTeacherAccount | null> {
    const existing = await prisma.user.findFirst({
      where: { OR: [{ username: row.nip }, { identifier: row.nip }, { teacherProfile: { nip: row.nip } }] },
      select: { id: true },
    });
    if (existing) return null;

    const password = generateRandomPassword();
    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          username: row.nip,
          identifier: row.nip,
          passwordHash,
          role: Role.GURU_PEMBIMBING,
          cohortId: null, // guru = staf global, tidak terikat satu gelombang
          phase: null,
          mustChangePassword: true,
        },
        select: { id: true, username: true },
      });
      await tx.teacherProfile.create({
        data: { userId: u.id, fullName: row.fullName, nip: row.nip, majorId: row.majorId },
      });
      await tx.initialCredential.upsert({
        where: { userId: u.id },
        create: { userId: u.id, encryptedPassword: encryptCredential(password) },
        update: { encryptedPassword: encryptCredential(password) },
      });
      return u;
    });

    return { userId: user.id, username: user.username, nip: row.nip, fullName: row.fullName, password };
  }

  /**
   * Pastikan semua baris master aktif satu gelombang punya akun (idempoten).
   * Dipanggil otomatis setelah import Excel / tambah manual, dan bisa dipakai
   * sebagai prosedur "tambal" bila ada baris yang belum punya akun.
   */
  async ensureAccounts(
    cohortId: string,
    opts: { actorId?: string; ipAddress?: string; userAgent?: string } = {}
  ): Promise<TeacherProvisionResult> {
    const rows = await teacherRegistryRepository.findActiveByCohort(cohortId);
    const result: TeacherProvisionResult = { created: [], skipped: 0, errors: [] };

    for (const row of rows) {
      try {
        const account = await this.createAccountFor(row);
        if (account) result.created.push(account);
        else result.skipped++;
      } catch (err) {
        result.errors.push({ nip: row.nip, reason: (err as Error).message?.slice(0, 120) ?? 'unknown' });
      }
    }

    if (opts.actorId && result.created.length > 0) {
      await auditService.record({
        actorId: opts.actorId,
        action: AUDIT_ACTIONS.CREATE_USER,
        entityType: ENTITY_TYPES.COHORT,
        entityId: cohortId,
        metadata: { bulk: 'MASTER_GURU', created: result.created.length, skipped: result.skipped, errors: result.errors.length },
        ipAddress: opts.ipAddress,
        userAgent: opts.userAgent,
      });
    }

    return result;
  }

  /**
   * Tambah guru manual ke Master Guru (admin), dengan pengecekan duplikat NIP.
   * Akun login (username = NIP) dibuat otomatis.
   */
  async create(input: {
    cohortId?: unknown;
    nip?: unknown;
    fullName?: unknown;
    majorCode?: unknown;
  }): Promise<{
    record: Awaited<ReturnType<typeof teacherRegistryRepository.upsert>>;
    account: ProvisionedTeacherAccount | null;
    restored: boolean;
  }> {
    await ensureSchoolMajors();
    const cohortId = String(input.cohortId ?? '').trim();
    if (!cohortId) throw new BadRequestError('Gelombang wajib dipilih');
    const cohort = await prisma.cohort.findUnique({ where: { id: cohortId } });
    if (!cohort) throw new NotFoundError('Gelombang tidak ditemukan');

    const nip = normalizeNip(input.nip);
    if (!NIP_PATTERN.test(nip)) throw new BadRequestError('NIP harus terdiri dari 18 digit angka');

    const fullName = String(input.fullName ?? '').trim();
    if (!fullName) throw new BadRequestError('Nama lengkap wajib diisi');

    // Resolve jurusan (opsional)
    const majors = await prisma.major.findMany();
    const majorMap = new Map(majors.map((m) => [m.code.toUpperCase(), m.id]));
    const majorCode = String(input.majorCode ?? '').trim();
    let majorId: string | null = null;
    if (majorCode) {
      majorId = majorMap.get(majorCode.toUpperCase()) ?? null;
      if (!majorId) throw new BadRequestError(`Jurusan "${majorCode}" tidak ditemukan`);
    }

    // Cek duplikat (NIP unique global — termasuk baris nonaktif & gelombang lain)
    const existing = await prisma.teacherRegistry.findUnique({
      where: { nip },
      include: { cohort: { select: { name: true } } },
    });
    if (existing && existing.isActive) {
      throw new BadRequestError(
        existing.cohortId === cohortId
          ? `NIP ${nip} sudah terdaftar di Master Guru gelombang ini`
          : `NIP ${nip} sudah terdaftar di gelombang "${existing.cohort.name}"`
      );
    }

    const record = await teacherRegistryRepository.upsert({ nip, fullName, cohortId, majorId });
    const account = await this.createAccountFor({ id: record.id, nip, fullName, majorId });
    return { record, account, restored: existing !== null };
  }

  /**
   * Hapus data guru dari master + hapus PERMANEN akun guru tersebut.
   * Relasi dengan onDelete: Restrict (penugasan bimbingan & kunjungan) dihapus
   * lebih dulu agar penghapusan akun tidak gagal.
   */
  async remove(id: string): Promise<TeacherRegistryRemoveResult> {
    const row = await teacherRegistryRepository.findById(id);
    if (!row) throw new NotFoundError('Data guru tidak ditemukan');
    const nip = row.nip;

    const users = await prisma.user.findMany({
      where: {
        role: 'GURU_PEMBIMBING',
        OR: [{ username: nip }, { identifier: nip }, { teacherProfile: { nip } }],
      },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);

    const counts: TeacherRegistryRemoveResult = {
      fullName: row.fullName,
      nip,
      accounts: userIds.length,
      supervisions: 0,
      visits: 0,
    };

    for (const uid of userIds) {
      counts.supervisions += (await prisma.studentSupervisor.deleteMany({ where: { supervisorId: uid } })).count;
      counts.visits += (await prisma.visit.deleteMany({ where: { supervisorId: uid } })).count;
      // Akun dihapus permanen -> TeacherProfile, InitialCredential, RefreshToken,
      // Notification, dst. ikut terhapus otomatis via FK onDelete: Cascade;
      // kolom verifiedBy/actor/giver (FK SetNull) otomatis dikosongkan.
      await prisma.user.delete({ where: { id: uid } });
    }

    // Baris master disembunyikan (dipulihkan bila di-import ulang Excel).
    await teacherRegistryRepository.softDelete(id);

    return counts;
  }
}

export const teacherRegistryService = new TeacherRegistryService();

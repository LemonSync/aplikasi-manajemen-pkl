import {
  DocumentStatus,
  DocumentType,
  Registration,
  RegistrationStatus,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { registrationRepository } from '../repositories/registration.repository';
import { registrationMemberRepository } from '../repositories/registrationMember.repository';
import { cohortRepository } from '../repositories/cohort.repository';
import { majorRepository } from '../repositories/major.repository';
import { industryRepository } from '../repositories/industry.repository';
import { letterService } from './letter.service';
import { auditService } from './audit.service';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors/AppError';
import { AUDIT_ACTIONS, ENTITY_TYPES, MESSAGES } from '../config/constants';
import { readStoredFile } from '../utils/storage';
import { documentRepository } from '../repositories/document.repository';

export interface RegistrationMemberInput {
  userId?: string | null;
  fullName?: string | null;
  nisn?: string | null;
  className?: string | null;
  phone?: string | null;
  address?: string | null;
  isLeader?: boolean;
}

export interface SaveRegistrationInput {
  groupName: string;
  cohortId: string;
  majorId?: string | null;
  companyName: string;
  companyAddress: string;
  companyIndustry?: string | null;
  companyPhone?: string | null;
  companyCity?: string | null;
  companyWebsite?: string | null;
  companyContacts?: string[] | null;
  members: RegistrationMemberInput[];
}

/**
 * Service pendaftaran PKL (Fase 1: Pra-Pendaftaran).
 * Aturan:
 *  - Satu siswa hanya boleh memiliki satu pendaftaran aktif.
 *  - Semua anggota diasumsikan dari jurusan yang sama (validasi di level admin saat pembentukan kelompok).
 *  - Surat Permohonan PDF hanya dibuat setelah ajuan disetujui Admin.
 */
export class RegistrationService {
  /** Membuat kode unik pendaftaran, mis. REG-2024-0001. */
  private async generateCode(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `REG-${year}-`;
    const count = await registrationRepository.countByCodePrefix(prefix);
    return `${prefix}${String(count + 1).padStart(4, '0')}`;
  }

  /**
   * Tolak bila ada NISN yang masih terikat pendaftaran/kelompok LAIN
   * (status DRAFT aktif / DIAJUKAN / DISETUJUI). Pendaftaran berstatus
   * DITOLAK atau sudah di-soft-delete tidak mengikat.
   */
  private async assertMembersFree(
    nisns: Array<string | null | undefined>,
    excludeRegistrationId?: string
  ): Promise<void> {
    const list = [...new Set(nisns.filter((n): n is string => !!n))];
    if (list.length === 0) return;

    const conflicts = await prisma.registrationMember.findMany({
      where: {
        nisn: { in: list },
        registration: {
          deletedAt: null,
          status: {
            in: [RegistrationStatus.DRAFT, RegistrationStatus.DIAJUKAN, RegistrationStatus.DISETUJUI],
          },
          ...(excludeRegistrationId ? { NOT: { id: excludeRegistrationId } } : {}),
        },
      },
      include: { registration: { select: { code: true, groupName: true, status: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (conflicts.length === 0) return;

    const statusLabel: Record<RegistrationStatus, string> = {
      DRAFT: 'masih draft',
      DIAJUKAN: 'menunggu persetujuan admin',
      DISETUJUI: 'sudah disetujui admin',
      DITOLAK: 'ditolak',
    };
    const seen = new Set<string>();
    const msgs: string[] = [];
    for (const c of conflicts) {
      if (!c.nisn || seen.has(c.nisn)) continue;
      seen.add(c.nisn);
      msgs.push(
        `NISN ${c.nisn} (${c.fullName}) sudah terdaftar di kelompok "${c.registration.groupName}" [${c.registration.code} - ${statusLabel[c.registration.status]}]`
      );
    }
    throw new BadRequestError(`Sebagian anggota sudah terikat kelompok lain: ${msgs.join(' | ')}`);
  }

  /** Membuat (atau mengambil) pendaftaran DRAFT milik siswa. */
  async saveDraft(leaderId: string, input: SaveRegistrationInput) {
    // Gelombang ketua sudah ditentukan Admin saat pembuatan akun → form tidak
    // boleh menggantinya (input dipaksa mengikuti gelombang akun ketua).
    const leader = await prisma.user.findUnique({
      where: { id: leaderId },
      select: { cohortId: true },
    });
    const cohortId = leader?.cohortId ?? input.cohortId;

    // Validasi master data
    const cohort = await cohortRepository.findById(cohortId);
    if (!cohort) throw new NotFoundError('Gelombang tidak ditemukan');
    if (input.majorId) {
      const major = await majorRepository.findById(input.majorId);
      if (!major) throw new NotFoundError('Jurusan tidak ditemukan');
    }
    if (!input.members || input.members.length === 0) {
      throw new BadRequestError(MESSAGES.GROUP.NO_MEMBERS);
    }
    const nisns = input.members.map((member) => member.nisn?.trim());
    if (nisns.some((nisn) => !nisn) || new Set(nisns).size !== nisns.length) {
      throw new BadRequestError('NISN wajib diisi dan tidak boleh duplikat dalam satu kelompok');
    }
    const masterStudents = await prisma.studentRegistry.findMany({
      where: { nisn: { in: nisns as string[] }, cohortId, isActive: true },
    });
    const masterByNisn = new Map(masterStudents.map((student) => [student.nisn, student]));

    // Auto-isi NAMA & KELAS dari Master Siswa (berdasarkan NISN) bila kosong,
    // lalu pastikan data yang dikirim konsisten dengan master.
    const problems: string[] = [];
    const members = input.members.map((member) => {
      const nisn = (member.nisn ?? '').trim();
      const master = masterByNisn.get(nisn);
      const sentName = (member.fullName ?? '').trim();
      const sentClass = (member.className ?? '').trim();
      if (!master) {
        problems.push(`NISN ${nisn} tidak terdaftar pada Master Siswa gelombang ini`);
        return { ...member, nisn, fullName: sentName, className: sentClass };
      }
      const fullName = sentName || master.fullName;
      const className = sentClass || master.className;
      if (sentName && master.fullName.toLowerCase() !== fullName.toLowerCase()) {
        problems.push(`NISN ${nisn}: nama tidak cocok dengan Master Siswa`);
      }
      if (sentClass && master.className !== className) {
        problems.push(`NISN ${nisn}: kelas tidak cocok dengan Master Siswa`);
      }
      return { ...member, nisn, fullName, className };
    });
    if (problems.length > 0) {
      throw new BadRequestError(problems.join(' | '));
    }

    const existing = await registrationRepository.findActiveByLeader(leaderId);
    if (existing && existing.status !== RegistrationStatus.DRAFT) {
      throw new ConflictError('Pendaftaran sudah diajukan dan tidak dapat diubah');
    }

    // Anggota tidak boleh sudah terikat pendaftaran/kelompok lain.
    await this.assertMembersFree(nisns, existing?.id);

    const scalarData = {
      groupName: input.groupName,
      companyName: input.companyName,
      companyAddress: input.companyAddress,
      companyIndustry: input.companyIndustry ?? null,
      companyPhone: input.companyPhone ?? null,
      companyCity: input.companyCity ?? null,
      companyWebsite: input.companyWebsite ?? null,
      companyContacts: (input.companyContacts ?? null) as never,
    };

    let registrationId: string;

    if (existing) {
      await registrationRepository.update(existing.id, {
        ...scalarData,
        cohort: { connect: { id: cohortId } },
        ...(input.majorId
          ? { major: { connect: { id: input.majorId } } }
          : { major: { disconnect: true } }),
      });
      registrationId = existing.id;
    } else {
      const code = await this.generateCode();
      const created = await registrationRepository.create({
        code,
        ...scalarData,
        cohort: { connect: { id: cohortId } },
        ...(input.majorId ? { major: { connect: { id: input.majorId } } } : {}),
        leader: { connect: { id: leaderId } },
      });
      registrationId = created.id;
    }

    // Sync anggota: hapus semua lalu buat ulang (form sederhana, atomik).
    await registrationMemberRepository.deleteByRegistration(registrationId);
    await registrationMemberRepository.createMany(
      registrationId,
      members.map((m) => ({
        userId: m.userId ?? null,
        fullName: m.fullName ?? '',
        nisn: m.nisn ?? null,
        className: m.className ?? null,
        phone: m.phone ?? null,
        address: m.address ?? null,
        isLeader: m.isLeader ?? false,
      }))
    );

    // Pastikan ketua tercatat sebagai anggota
    const refreshed = await registrationRepository.findById(registrationId);
    if (refreshed && !refreshed.members.some((m) => m.isLeader)) {
      await registrationMemberRepository.createMany(registrationId, [
        { isLeader: true, fullName: '(Ketua)' },
      ]);
    }

    return registrationRepository.findById(registrationId);
  }
  private async getOwnedRegistration(leaderId: string, id: string) {
    const registration = await registrationRepository.findById(id);
    if (!registration) throw new NotFoundError(MESSAGES.NOT_FOUND);
    if (registration.leaderId !== leaderId) {
      throw new ForbiddenError(MESSAGES.SCOPE);
    }
    return registration;
  }

  async getMyRegistration(leaderId: string) {
    return registrationRepository.findActiveByLeader(leaderId);
  }

  async getById(id: string) {
    const registration = await registrationRepository.findById(id);
    if (!registration) throw new NotFoundError(MESSAGES.NOT_FOUND);
    return registration;
  }

  /** Mengajukan pendaftaran untuk ditinjau Admin. */
  async submit(leaderId: string, id: string, ctx: { ipAddress?: string; userAgent?: string }) {
    const registration = await this.getOwnedRegistration(leaderId, id);

    if (registration.status !== RegistrationStatus.DRAFT) {
      throw new ConflictError('Pendaftaran sudah pernah diajukan');
    }
    if (registration.members.length === 0) {
      throw new BadRequestError(MESSAGES.GROUP.NO_MEMBERS);
    }

    // Cek ulang saat pengajuan: anggota tidak boleh sudah terikat kelompok lain.
    await this.assertMembersFree(registration.members.map((m) => m.nisn), registration.id);

    // Simpan bidang industri (input bebas) ke master bila belum ada
    if (registration.companyIndustry) {
      await industryRepository.findOrCreateByName(registration.companyIndustry);
    }

    await registrationRepository.update(registration.id, {
      status: RegistrationStatus.DIAJUKAN,
      submittedAt: new Date(),
    });

    await auditService.record({
      actorId: leaderId,
      action: AUDIT_ACTIONS.CREATE_REGISTRATION,
      entityType: ENTITY_TYPES.REGISTRATION,
      entityId: registration.id,
      metadata: { status: RegistrationStatus.DIAJUKAN },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return { registration: await registrationRepository.findById(registration.id), documentId: null };
  }

  /** Buat surat final sekali saja, setelah Admin menyetujui ajuan. */
  private async generateApplicationLetter(registration: NonNullable<Awaited<ReturnType<typeof registrationRepository.findById>>>) {
    const existing = registration.document;
    if (existing?.files.some((file) => file.isActive)) return existing.id;

    const leader = await prisma.user.findUnique({ where: { id: registration.leaderId } });
    const leaderName = leader?.username ?? 'Ketua Kelompok';
    const letter = await letterService.generateLetter({
      type: DocumentType.SURAT_PERMOHONAN,
      title: 'Surat Permohonan Praktik Kerja Lapangan',
      recipientLines: [
        'Kepada Yth.',
        'Pimpinan ' + registration.companyName,
        registration.companyAddress,
      ],
      bodyParagraphs: [
        'Dengan hormat,',
        `Sehubungan dengan pelaksanaan Praktik Kerja Lapangan (PKL) pada gelombang ${registration.cohort?.name ?? '-'}, kami bermaksud mengajukan permohonan agar siswa-siswi kami dapat melaksanakan PKL di ${registration.companyName}.`,
        `Adapun anggota kelompok yang diajukan adalah sebagai berikut: ${registration.members
          .map((m, i) => `${i + 1}) ${m.fullName}${m.className ? ` (${m.className})` : ''}`)
          .join(', ')}.`,
        'Demikian surat permohonan ini kami sampaikan. Atas perhatian dan kerja samanya kami ucapkan terima kasih.',
      ],
      cohortId: registration.cohortId,
      payload: {
        registrationId: registration.id,
        companyName: registration.companyName,
        leaderName,
      },
    });

    // Simpan sebagai Document milik ketua (Surat Permohonan ter-generate)
    const doc = await documentRepository.create({
      type: DocumentType.SURAT_PERMOHONAN,
      status: DocumentStatus.DISETUJUI, // surat ter-generate dianggap final untuk dicetak
      title: `Surat Permohonan - ${registration.groupName}`,
      owner: { connect: { id: registration.leaderId } },
      cohort: { connect: { id: registration.cohortId } },
      registration: { connect: { id: registration.id } },
    });

    const pdfBuffer = readStoredFile(letter.relativePath);
    if (pdfBuffer) {
      await documentRepository.createFile({
        document: { connect: { id: doc.id } },
        originalName: `surat-permohonan-${registration.code}.pdf`,
        storedPath: letter.relativePath,
        mimeType: 'application/pdf',
        sizeBytes: pdfBuffer.length,
        version: 1,
        isActive: true,
      });
    }

    return doc.id;
  }

  /** Daftar pendaftaran (admin) dengan filter. */
  async list(params: {
    page: number;
    perPage: number;
    status?: RegistrationStatus;
    cohortId?: string;
  }) {
    const where = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.cohortId ? { cohortId: params.cohortId } : {}),
    };
    return registrationRepository.paginate(where, (params.page - 1) * params.perPage, params.perPage);
  }

  /** Persetujuan/penolakan ajuan oleh admin. */
  async review(
    id: string,
    actorId: string,
    action: 'APPROVE' | 'REJECT',
    note: string | undefined,
    ctx: { ipAddress?: string; userAgent?: string }
  ) {
    const registration = await registrationRepository.findById(id);
    if (!registration) throw new NotFoundError(MESSAGES.NOT_FOUND);
    if (registration.status !== RegistrationStatus.DIAJUKAN) {
      throw new BadRequestError('Pendaftaran tidak dalam status menunggu persetujuan');
    }

    if (action === 'REJECT' && !note) {
      throw new BadRequestError('Alasan penolakan wajib diisi');
    }

    // Persetujuan terakhir: pastikan tidak ada anggota yang sudah terikat
    // pendaftaran/kelompok lain (mis. ajuan lain yang diajukan lebih dulu).
    if (action === 'APPROVE') {
      await this.assertMembersFree(registration.members.map((m) => m.nisn), registration.id);
    }

    const updated: Registration = await registrationRepository.update(id, {
      status: action === 'APPROVE' ? RegistrationStatus.DISETUJUI : RegistrationStatus.DITOLAK,
      note: note ?? null,
      reviewedBy: { connect: { id: actorId } },
      reviewedAt: new Date(),
    });

    await auditService.record({
      actorId,
      action: action === 'APPROVE' ? AUDIT_ACTIONS.APPROVE : AUDIT_ACTIONS.REJECT,
      entityType: ENTITY_TYPES.REGISTRATION,
      entityId: id,
      metadata: { note },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    if (action === 'APPROVE') {
      const approved = await registrationRepository.findById(id);
      if (!approved) throw new NotFoundError(MESSAGES.NOT_FOUND);
      const documentId = await this.generateApplicationLetter(approved);
      await auditService.record({
        actorId,
        action: AUDIT_ACTIONS.GENERATE_LETTER,
        entityType: ENTITY_TYPES.DOCUMENT,
        entityId: documentId,
        metadata: { registrationId: id, type: DocumentType.SURAT_PERMOHONAN },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
    }

    return updated;
  }

  /**
   * Ambil pendaftaran yang digrup berdasarkan nama kelompok.
   * Mengembalikan array kelompok, setiap kelompok berisi daftar siswa dengan nama yang sama.
   * Sertakan data form Fase 1 (tempat PKL + identitas anggota: NISN, nama,
   * kelas, no. HP, alamat) agar admin bisa verifikasi tanpa membuka layar lain.
   */
  async listGrouped(cohortId?: string) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (cohortId) where.cohortId = cohortId;

    const registrations = await prisma.registration.findMany({
      where,
      include: {
        leader: { include: { studentProfile: true } },
        cohort: true,
        major: true,
        members: { orderBy: [{ isLeader: 'desc' }, { createdAt: 'asc' }] },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by groupName
    const groupMap = new Map<string, typeof registrations>();
    for (const reg of registrations) {
      const key = reg.groupName;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(reg);
    }

    // Convert to array
    const groups = Array.from(groupMap.entries()).map(([groupName, regs]) => {
      const first = regs[0];
      return {
        groupName,
        companyName: first?.companyName ?? '-',
        companyAddress: first?.companyAddress ?? '-',
        companyIndustry: first?.companyIndustry ?? null,
        companyPhone: first?.companyPhone ?? null,
        companyCity: first?.companyCity ?? null,
        companyWebsite: first?.companyWebsite ?? null,
        companyContacts: (first?.companyContacts as string[] | null) ?? null,
        majorName: first?.major?.name ?? null,
        cohortName: first?.cohort?.name ?? null,
        cohortId: first?.cohortId ?? null,
        registrations: regs.map((r) => ({
          id: r.id,
          code: r.code,
          leaderId: r.leaderId,
          leaderName: r.leader?.studentProfile?.fullName ?? r.leader?.username ?? '-',
          status: r.status,
          createdAt: r.createdAt,
          members: r.members.map((m) => ({
            id: m.id,
            userId: m.userId,
            fullName: m.fullName,
            nisn: m.nisn,
            className: m.className,
            phone: m.phone,
            address: m.address,
            isLeader: m.isLeader,
          })),
        })),
        totalCount: regs.length,
        approvedCount: regs.filter((r) => r.status === 'DISETUJUI').length,
      };
    });

    return groups;
  }
}

export const registrationService = new RegistrationService();

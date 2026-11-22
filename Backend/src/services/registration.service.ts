import {
  CohortStatus,
  DocumentStatus,
  DocumentType,
  Registration,
  RegistrationStatus,
  Role,
  StudentPhase,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { registrationRepository } from '../repositories/registration.repository';
import { cohortRepository } from '../repositories/cohort.repository';
import { majorRepository } from '../repositories/major.repository';
import { companyService } from './company.service';
import { letterService } from './letter.service';
import { settingService } from './setting.service';
import { auditService } from './audit.service';
import { resolveScope, scopeUserWhere, andWhere } from './majorScope.service';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../errors/AppError';
import { AUDIT_ACTIONS, ENTITY_TYPES, MESSAGES } from '../config/constants';
import { readStoredFile } from '../utils/storage';
import { documentRepository } from '../repositories/document.repository';
import { LETTER_TEXT } from '../config/letter.config';

export interface SaveRegistrationInput {
  cohortId?: string;
  companyId: string;
  majorId?: string | null;
}

/**
 * Service pendaftaran PKL per siswa (Fase 1: Pra-Pendaftaran).
 * Aturan:
 *  - Satu baris pendaftaran per (siswa, gelombang); perusahaan dipilih
 *    dari daftar (harus punya sisa kuota > 0 saat submit).
 *  - Surat Permohonan PDF dibuat setelah ajuan disetujui Admin.
 *  - Kuota perusahaan dicek dua kali: saat submit & saat approve
 *    Surat Penerimaan (lihat companyService.assertSisaAvailable).
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
   * Validasi diri pendaftar: akun siswa valid & NISN-nya terdaftar
   * pada Master Siswa gelombang terkait (aktif).
   */
  private async assertRegistrable(studentId: string, cohortId: string) {
    const user = await prisma.user.findUnique({
      where: { id: studentId },
      select: {
        username: true,
        deletedAt: true,
        studentProfile: { select: { nisn: true, majorId: true } },
      },
    });
    if (!user || user.deletedAt) throw new ForbiddenError('Akun tidak valid');

    const nisn = user.studentProfile?.nisn ?? user.username;
    const registry = await prisma.studentRegistry.findFirst({
      where: { nisn, cohortId, isActive: true },
      select: { majorId: true },
    });
    if (!registry) {
      throw new BadRequestError(`NISN ${nisn} tidak terdaftar pada Master Siswa gelombang ini`);
    }
    return {
      nisn,
      majorId: user.studentProfile?.majorId ?? registry.majorId ?? null,
    };
  }

  /**
   * Batalkan dokumen ronde ini (Surat Permohonan + Surat Penerimaan) yang
   * terikat pada pendaftaran. Dipanggil saat pilihan perusahaan pada baris
   * pendaftaran berganti: baris Registration dipakai ulang (satu baris per
   * siswa+gelombang), jadi tanpa penanda ini surat dari perusahaan lama akan
   * dinilai sebagai surat dari perusahaan baru — siswa terlempar ke fase
   * berikutnya dan antrean verifikasi admin berisi dua surat sekaligus.
   * File lama tetap disimpan sebagai jejak; status TIDAK_BERLAKU membuatnya
   * keluar dari inbox dan tidak bisa di-ACC.
   */
  private async invalidateRoundDocuments(registrationId: string, reason: string): Promise<number> {
    const { count } = await prisma.document.updateMany({
      where: {
        registrationId,
        type: { in: [DocumentType.SURAT_PERMOHONAN, DocumentType.SURAT_PENERIMAAN] },
        status: { not: DocumentStatus.TIDAK_BERLAKU },
      },
      data: { status: DocumentStatus.TIDAK_BERLAKU, note: reason },
    });
    return count;
  }

  /** Simpan (atau perbarui) pendaftaran DRAFT milik siswa. */
  async saveDraft(studentId: string, input: SaveRegistrationInput) {
    const user = await prisma.user.findUnique({
      where: { id: studentId },
      select: { cohortId: true },
    });
    const cohortId = user?.cohortId ?? input.cohortId;
    if (!cohortId) throw new BadRequestError('Gelombang tidak ditentukan');

    const cohort = await cohortRepository.findById(cohortId);
    if (!cohort) throw new NotFoundError('Gelombang tidak ditemukan');
    if (cohort.status === CohortStatus.CLOSED || cohort.status === CohortStatus.ARCHIVED) {
      throw new ForbiddenError(MESSAGES.COHORT_LOCKED);
    }

    const company = await companyService.getById(input.companyId);
    if (!company.isActive) throw new BadRequestError('Perusahaan tidak aktif untuk pendaftaran');

    const { majorId: studentMajorId } = await this.assertRegistrable(studentId, cohortId);
    const majorId = input.majorId ?? studentMajorId;
    if (majorId && !(await majorRepository.findById(majorId))) {
      throw new NotFoundError('Jurusan tidak ditemukan');
    }

    // Satu baris per (siswa, gelombang): baris lama di-reuse bila masih DRAFT,
    // sudah DITOLAK (dibuka kembali), atau DIBATALKAN (berubah pikiran/ganti
    // perusahaan — kembali ke Fase 1 memilih perusahaan baru).
    const existing = await prisma.registration.findFirst({
      where: { studentId, cohortId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (
      existing &&
      existing.status !== RegistrationStatus.DRAFT &&
      existing.status !== RegistrationStatus.DITOLAK &&
      existing.status !== RegistrationStatus.DIBATALKAN
    ) {
      throw new ConflictError('Pendaftaran sudah diajukan dan tidak dapat diubah');
    }

    const scalarData = {
      cohort: { connect: { id: cohortId } },
      company: { connect: { id: input.companyId } },
      ...(majorId ? { major: { connect: { id: majorId } } } : { major: { disconnect: true } }),
    };

    if (existing) {
      // Ganti perusahaan = mulai ronde baru: surat ronde sebelumnya tidak lagi
      // berlaku untuk pendaftaran ini (siswa harus unduh surat & upload surat
      // penerimaan dari perusahaan yang baru).
      if (existing.companyId !== input.companyId) {
        await this.invalidateRoundDocuments(
          existing.id,
          'Tidak berlaku — siswa mengganti perusahaan tujuan'
        );
      }
      await registrationRepository.update(existing.id, {
        ...scalarData,
        status: RegistrationStatus.DRAFT,
        note: null,
        submittedAt: null,
        reviewedBy: { disconnect: true },
        reviewedAt: null,
        permohonanDownloadedAt: null,
      });
      return registrationRepository.findById(existing.id);
    }

    const code = await this.generateCode();
    const created = await registrationRepository.create({
      code,
      cohort: { connect: { id: cohortId } },
      company: { connect: { id: input.companyId } },
      // `disconnect` bukan opsi yang valid pada create — siswa tanpa jurusan
      // (mis. Master Siswa belum punya major) tetap boleh mendaftar.
      ...(majorId ? { major: { connect: { id: majorId } } } : {}),
      student: { connect: { id: studentId } },
    });
    return registrationRepository.findById(created.id);
  }

  private async getOwnedRegistration(studentId: string, id: string) {
    const registration = await registrationRepository.findById(id);
    if (!registration) throw new NotFoundError(MESSAGES.NOT_FOUND);
    if (registration.studentId !== studentId) {
      throw new ForbiddenError(MESSAGES.SCOPE);
    }
    return registration;
  }

  async getMyRegistration(studentId: string) {
    return registrationRepository.findActiveByStudent(studentId);
  }

  /**
   * Siswa berubah pikiran / ingin ganti perusahaan (mis. surat permohonan
   * ditolak perusahaan). Tersedia di Fase 2 sebelum Surat Penerimaan/Pernyataan
   * disetujui. Efek:
   *  - Pendaftaran ditandai DIBATALKAN → kuota perusahaan lama otomatis dilepas
   *    (kuota hanya menghitung pendaftaran DISETUJUI).
   *  - Surat (permohonan & penerimaan) yang sudah terbit/tergantung untuk
   *    perusahaan lama ditandai TIDAK_BERLAKU dan keluar dari inbox admin.
   *  - Fase siswa dikembalikan ke PRA_PKL untuk memilih perusahaan baru.
   */
  async cancelAndChangeCompany(studentId: string, ctx: { ipAddress?: string; userAgent?: string }) {
    const registration = await registrationRepository.findActiveByStudent(studentId);
    if (!registration) throw new NotFoundError(MESSAGES.NOT_FOUND);
    if (registration.status !== RegistrationStatus.DISETUJUI) {
      throw new BadRequestError('Hanya pendaftaran yang sudah disetujui yang dapat dibatalkan untuk ganti perusahaan');
    }

    // Terlalu jauh untuk berubah pikiran: surat resmi perusahaan INI sudah
    // disetujui admin. Surat Pernyataan bersifat umum (tidak terikat
    // perusahaan) sehingga tetap dihitung.
    const [penerimaan, pernyataan] = await Promise.all([
      prisma.document.findFirst({
        where: {
          registrationId: registration.id,
          type: DocumentType.SURAT_PENERIMAAN,
          status: DocumentStatus.DISETUJUI,
        },
        select: { id: true },
      }),
      prisma.document.findFirst({
        where: { ownerId: studentId, type: DocumentType.SURAT_PERNYATAAN, status: DocumentStatus.DISETUJUI },
        select: { id: true },
      }),
    ]);
    if (penerimaan || pernyataan) {
      throw new BadRequestError(
        'Surat Penerimaan/Surat Pernyataan sudah disetujui admin — tidak dapat berubah pikiran lagi'
      );
    }

    const updated = await registrationRepository.update(registration.id, {
      status: RegistrationStatus.DIBATALKAN,
      note: 'Berubah pikiran — siswa kembali ke Fase 1 untuk memilih perusahaan baru',
    });

    // Surat penerimaan yang masih menggantung (perusahaan lama) dibatalkan
    // sekarang juga — kalau tidak, admin masih bisa me-ACC surat yang salah dan
    // siswa otomatis melompati Fase 2 untuk perusahaan barunya.
    const invalidatedDocuments = await this.invalidateRoundDocuments(
      registration.id,
      'Tidak berlaku — siswa berubah pikiran dan mengganti perusahaan'
    );

    // Kembalikan fase ke pra-pendaftaran agar bisa mendaftar di perusahaan lain
    await prisma.user.update({ where: { id: studentId }, data: { phase: StudentPhase.PRA_PKL } });

    await auditService.record({
      actorId: studentId,
      action: AUDIT_ACTIONS.CANCEL_REGISTRATION,
      entityType: ENTITY_TYPES.REGISTRATION,
      entityId: registration.id,
      metadata: {
        companyId: registration.companyId,
        companyQuotaReleased: true,
        phaseResetTo: StudentPhase.PRA_PKL,
        invalidatedDocuments,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return updated;
  }

  async getById(id: string, actor: { id: string; role: Role }) {
    const registration = await registrationRepository.findById(id);
    if (!registration) throw new NotFoundError(MESSAGES.NOT_FOUND);
    const staffRoles: Role[] = [Role.ADMIN, Role.SUPER_ADMIN, Role.KEPALA_SEKOLAH];
    if (!staffRoles.includes(actor.role) && registration.studentId !== actor.id) {
      throw new ForbiddenError(MESSAGES.SCOPE);
    }
    return registration;
  }

  /** Mengajukan pendaftaran untuk ditinjau Admin (Guard 1: kuota perusahaan). */
  async submit(studentId: string, id: string, ctx: { ipAddress?: string; userAgent?: string }) {
    const registration = await this.getOwnedRegistration(studentId, id);

    if (registration.status !== RegistrationStatus.DRAFT) {
      throw new ConflictError('Pendaftaran sudah pernah diajukan');
    }

    // Guard 1 (dua penjaga kuota): perusahaan tujuan harus masih tersedia & aktif.
    const targetCompany = await prisma.company.findFirst({
      where: { id: registration.companyId, deletedAt: null },
      select: { isActive: true },
    });
    if (!targetCompany || !targetCompany.isActive) {
      throw new BadRequestError(
        'Perusahaan tujuan sudah tidak tersedia (dihapus/dinonaktifkan admin). Simpan ulang pilihan perusahaan Anda.'
      );
    }
    await companyService.assertSisaAvailable(registration.companyId, { cohortId: registration.cohortId });

    await registrationRepository.update(registration.id, {
      status: RegistrationStatus.DIAJUKAN,
      submittedAt: new Date(),
    });

    await auditService.record({
      actorId: studentId,
      action: AUDIT_ACTIONS.CREATE_REGISTRATION,
      entityType: ENTITY_TYPES.REGISTRATION,
      entityId: registration.id,
      metadata: { status: RegistrationStatus.DIAJUKAN, companyId: registration.companyId },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return { registration: await registrationRepository.findById(registration.id), documentId: null };
  }

  /** Buat surat permohonan (per siswa) sekali saja, setelah Admin menyetujui ajuan. */
  private async generateApplicationLetter(
    registration: NonNullable<Awaited<ReturnType<typeof registrationRepository.findById>>>,
    number?: string | null
  ) {
    const existing = registration.document;
    if (existing?.files.some((file) => file.isActive)) return existing.id;

    const studentName =
      registration.student?.studentProfile?.fullName ??
      registration.student?.username ??
      'Siswa';
    const nisn = registration.student?.studentProfile?.nisn ?? null;
    const company = registration.company;
    if (!company) {
      throw new BadRequestError(
        'Perusahaan pada pendaftaran ini tidak valid (sudah dihapus). Hubungi Admin untuk memulihkan data perusahaan sebelum surat diterbitkan.'
      );
    }

    const school = await settingService.getSchoolIdentity();
    const rangeText = await letterService.getPklRangeText(registration.cohortId);
    const academicYear = letterService.academicYearFromCohortName(registration.cohort?.name);
    const programKeahlian = registration.major?.name ?? '-';

    const dateClause = LETTER_TEXT.application.dateClause(rangeText);

    const letter = await letterService.generateLetter({
      type: DocumentType.SURAT_PERMOHONAN,
      number: number ?? null,
      hal: LETTER_TEXT.application.subject,
      recipientLines: ['Bapak / Ibu Pimpinan', company.name],
      recipientCity: company.city ?? school.city,
      paragraphs: [
        LETTER_TEXT.application.opener +
          LETTER_TEXT.application.body(school.schoolName, academicYear, company.name, dateClause),
        LETTER_TEXT.application.studentIntro,
      ],
      table: {
        preset: 'siswa',
        columns: [...LETTER_TEXT.application.tableHeaders],
        rows: [['1.', studentName, programKeahlian]],
      },
      closing: LETTER_TEXT.application.closing,
      cohortId: registration.cohortId,
      payload: {
        registrationId: registration.id,
        companyName: company.name,
        studentName,
        nisn,
      },
    });

    // Simpan sebagai Document milik siswa (Surat Permohonan ter-generate)
    const doc = await documentRepository.create({
      type: DocumentType.SURAT_PERMOHONAN,
      status: DocumentStatus.DISETUJUI, // surat ter-generate dianggap final untuk dicetak
      title: `Surat Permohonan - ${studentName}`,
      owner: { connect: { id: registration.studentId } },
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
    actor: { id: string; role: Role };
  }) {
    // Scope jurusan: SUPER_ADMIN/KEPALA semua; ADMIN hanya jurusan yang diawasi.
    const scope = await resolveScope(params.actor);
    const where = andWhere(
      {
        ...(params.status ? { status: params.status } : {}),
        ...(params.cohortId ? { cohortId: params.cohortId } : {}),
      },
      scopeUserWhere(scope, 'student')
    ) as Record<string, unknown>;
    return registrationRepository.paginate(where, (params.page - 1) * params.perPage, params.perPage);
  }

  /** Persetujuan/penolakan ajuan oleh admin. */
  async review(
    id: string,
    actorId: string,
    actorRole: Role,
    action: 'APPROVE' | 'REJECT',
    note: string | undefined,
    letterNumber: string | null | undefined,
    ctx: { ipAddress?: string; userAgent?: string }
  ) {
    const registration = await registrationRepository.findById(id);
    if (!registration) throw new NotFoundError(MESSAGES.NOT_FOUND);

    // Guard scope jurusan: ADMIN hanya boleh me-review pendaftaran milik
    // siswa dalam jurusan yang diawasinya.
    const scope = await resolveScope({ id: actorId, role: actorRole });
    if (!scopeUserWhere(scope, 'student')) {
      // scope=all → tidak ada batasan
    } else {
      const allowed = await prisma.registration.findFirst({
        where: andWhere({ id }, scopeUserWhere(scope, 'student')!),
        select: { id: true },
      });
      if (!allowed) throw new ForbiddenError(MESSAGES.SCOPE);
    }
    const missingApprovedLetter =
      action === 'APPROVE' &&
      registration.status === RegistrationStatus.DISETUJUI &&
      !registration.document?.files.some((file) => file.isActive);
    if (registration.status !== RegistrationStatus.DIAJUKAN && !missingApprovedLetter) {
      throw new BadRequestError('Pendaftaran tidak dalam status menunggu persetujuan');
    }

    if (action === 'REJECT' && !note) {
      throw new BadRequestError('Alasan penolakan wajib diisi');
    }

    let updated: Registration;
    if (missingApprovedLetter) {
      updated = registration;
    } else if (action === 'APPROVE') {
      // Lock perusahaan selama hitung-kuota + approval agar dua approval
      // bersamaan tidak menjual slot kuota yang sama.
      updated = await prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe('SELECT id FROM companies WHERE id = ? FOR UPDATE', registration.companyId);
        // Perusahaan yang di-soft-delete tetap boleh diselesaikan approve-nya
        // (riwayat pendaftaran siswa tidak boleh menggantung); kuota tetap dijaga.
        const company = await tx.company.findFirst({
          where: { id: registration.companyId },
          select: { quota: true },
        });
        if (!company) throw new NotFoundError('Perusahaan tidak ditemukan');
        if (company.quota !== null) {
          // Pemakaian dihitung per gelombang — pendaftaran gelombang sebelumnya
          // tidak memakan kuota gelombang ini.
          const used = await tx.registration.count({
            where: {
              companyId: registration.companyId,
              cohortId: registration.cohortId,
              status: RegistrationStatus.DISETUJUI,
              deletedAt: null,
            },
          });
          if (used >= company.quota) {
            throw new BadRequestError(`Kuota perusahaan sudah penuh (${used}/${company.quota} siswa). Silakan pilih perusahaan lain.`);
          }
        }
        return tx.registration.update({
          where: { id },
          data: {
            status: RegistrationStatus.DISETUJUI,
            note: note ?? null,
            reviewedBy: { connect: { id: actorId } },
            reviewedAt: new Date(),
          },
        }) as Promise<Registration>;
      });
    } else {
      updated = await registrationRepository.update(id, {
        status: RegistrationStatus.DITOLAK,
        note: note ?? null,
        reviewedBy: { connect: { id: actorId } },
        reviewedAt: new Date(),
      });
    }

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
      // Nomor surat diketik manual oleh admin (boleh kosong → surat tanpa nomor).
      const letterNo = letterNumber?.trim() || null;
      try {
        const approved = await registrationRepository.findById(id);
        if (!approved) throw new NotFoundError(MESSAGES.NOT_FOUND);
        const documentId = await this.generateApplicationLetter(approved, letterNo);
        await auditService.record({
          actorId,
          action: AUDIT_ACTIONS.GENERATE_LETTER,
          entityType: ENTITY_TYPES.DOCUMENT,
          entityId: documentId,
          metadata: { registrationId: id, type: DocumentType.SURAT_PERMOHONAN, number: letterNo },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        });
      } catch (error) {
        // Jangan meninggalkan status DISETUJUI bila PDF/dokumen gagal dibuat.
        await registrationRepository.update(id, {
          status: RegistrationStatus.DIAJUKAN,
          reviewedBy: { disconnect: true },
          reviewedAt: null,
        });
        throw error;
      }
    }

    return updated;
  }
}

export const registrationService = new RegistrationService();

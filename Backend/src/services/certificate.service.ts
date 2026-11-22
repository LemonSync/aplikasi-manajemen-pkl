import QRCode from 'qrcode';
import { ApprovalStatus, Role, StudentPhase } from '@prisma/client';
import { prisma } from '../config/prisma';
import { SERTIFIKAT_NUMBER } from '../config/sertifikat.config';
import { PENILAIAN_ITEMS } from '../config/penilaian.config';
import { renderSertifikatPdf, SertifikatPdfData, SertifikatScoreRow } from '../templates/sertifikat.template';
import { deleteStoredFile, readStoredFile, saveBuffer } from '../utils/storage';
import { settingService } from './setting.service';
import { classNameWithFallback } from './classResolver.service';
import { auditService } from './audit.service';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors/AppError';
import { AUDIT_ACTIONS, ENTITY_TYPES, MESSAGES } from '../config/constants';

/**
 * Sertifikat PKL (Fase 4) — PDF 2 halaman: sertifikat + LEMBARAN PENILAIAN.
 *
 * Aturan yang diminta sekolah:
 *  - Nomor sertifikat dibangkitkan otomatis dengan format contoh sekolah
 *    (400.10.5.4/urut/SMKN9/bulan-romawi/tahun) supaya siswa tidak perlu
 *    menunggu admin; admin tetap dapat menimpanya lewat jalur MANUAL yang
 *    tidak dihitung ulang oleh sistem.
 *  - Logo perusahaan WAJIB diunggah siswa sebelum sertifikat bisa dibuat.
 *  - Nilai harus sudah dikirim (terkunci) dan tidak sedang berstatus DITOLAK.
 */

const LOGO_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const ROMAN_MONTH = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

const fmtDate = (d: Date | string | null | undefined): string | null =>
  d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

/** Contoh sekolah mencetak "Medan, 17 November 2025". */
const fmtTerbit = (d: Date): string =>
  d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

const buildNumber = (sequence: number, issuedAt: Date): string =>
  [
    SERTIFIKAT_NUMBER.classification,
    String(sequence).padStart(SERTIFIKAT_NUMBER.sequencePad, '0'),
    SERTIFIKAT_NUMBER.schoolCode,
    ROMAN_MONTH[issuedAt.getMonth()],
    String(issuedAt.getFullYear()),
  ].join('/');

export interface CertificateLogoFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export interface SertifikatStatus {
  studentId: string;
  studentName: string;
  nisn: string | null;
  companyName: string | null;
  /** Nilai sudah dikirim dan terkunci. */
  gradeSubmitted: boolean;
  gradeSubmittedAt: string | null;
  /** Status persetujuan guru atas nilai — DITOLAK membuka kembali form penilaian. */
  approvalStatus: ApprovalStatus | null;
  approvalNote: string | null;
  finalScore: number | null;
  predicate: string | null;
  hasLogo: boolean;
  logoName: string | null;
  /** Nama penandatangan kanan halaman 1 — diisi siswa, boleh kosong. */
  kepalaBagianName: string | null;
  number: string | null;
  numberSource: string | null;
  issuedAt: string | null;
  /** PDF sudah terbit (snapshot tersimpan di storage). */
  ready: boolean;
}

/** Baris daftar sertifikat untuk halaman admin/guru. */
export interface CertificateRow {
  id: string;
  studentId: string;
  username: string;
  fullName: string;
  nisn: string | null;
  className: string | null;
  number: string;
  numberSource: string;
  hasLogo: boolean;
  issuedAt: string | null;
  /** PDF sudah terbit (snapshot tersedia di storage). */
  ready: boolean;
}

export class CertificateService {
  /** Status kesiapan sertifikat — dipakai halaman siswa (checklist) dan admin. */
  async getStatus(actor: { id: string; role: string }, studentId?: string): Promise<SertifikatStatus> {
    const targetId = await this.resolveTargetStudent(actor, studentId);

    const [cert, student, grade, registration] = await Promise.all([
      prisma.certificate.findUnique({ where: { studentId: targetId } }),
      prisma.user.findUnique({
        where: { id: targetId },
        select: { username: true, studentProfile: { select: { fullName: true, nisn: true } } },
      }),
      prisma.grade.findFirst({
        where: { studentId: targetId, giverRole: Role.DUDI },
        orderBy: { createdAt: 'desc' },
      }),
      this.activeRegistration(targetId),
    ]);
    if (!student) throw new NotFoundError('Siswa tidak ditemukan');

    const approval = grade
      ? await prisma.approval.findFirst({
          where: { entityType: ENTITY_TYPES.GRADE, entityId: grade.id },
          orderBy: { createdAt: 'desc' },
          select: { status: true, note: true },
        })
      : null;

    return {
      studentId: targetId,
      studentName: student.studentProfile?.fullName ?? student.username,
      nisn: student.studentProfile?.nisn ?? null,
      companyName: registration?.company?.name ?? null,
      gradeSubmitted: Boolean(grade?.submittedAt),
      gradeSubmittedAt: grade?.submittedAt ? grade.submittedAt.toISOString() : null,
      approvalStatus: approval?.status ?? null,
      approvalNote: approval?.note ?? null,
      finalScore: grade?.finalScore != null ? Number(grade.finalScore) : null,
      predicate: grade?.predicate ?? null,
      hasLogo: Boolean(cert?.logoPath),
      logoName: cert?.logoName ?? null,
      kepalaBagianName: cert?.kepalaBagianName ?? null,
      number: cert?.number ?? null,
      numberSource: cert?.numberSource ?? null,
      issuedAt: cert?.issuedAt ? cert.issuedAt.toISOString() : null,
      ready: Boolean(cert?.pdfPath),
    };
  }

  /**
   * Simpan logo perusahaan (wajib sebelum sertifikat dibuat). Mengunggah ulang =
   * mengganti logo, dan snapshot PDF lama dibuang supaya terbit ulang sesuai logo baru.
   */
  async uploadLogo(
    actor: { id: string; role: string },
    file: CertificateLogoFile | undefined,
    ctx: { ipAddress?: string; userAgent?: string }
  ): Promise<SertifikatStatus> {
    const studentId = await this.resolveTargetStudent(actor);
    if (!file?.buffer?.length) throw new BadRequestError('File logo belum diunggah');
    if (!LOGO_MIME.has(file.mimetype)) {
      throw new BadRequestError('Logo perusahaan harus berupa gambar JPG atau PNG');
    }
    const isPng = file.mimetype === 'image/png';
    const validSignature = isPng
      ? file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
    if (!validSignature) throw new BadRequestError('Isi file tidak sesuai dengan tipe gambar');

    const filename = `logo-pkl-${studentId}-${Date.now()}${isPng ? '.png' : '.jpg'}`;
    const { relativePath } = saveBuffer('logos', filename, file.buffer);

    const existing = await prisma.certificate.findUnique({ where: { studentId } });
    if (existing) {
      if (existing.logoPath) deleteStoredFile(existing.logoPath);
      if (existing.pdfPath) deleteStoredFile(existing.pdfPath);
      await prisma.certificate.update({
        where: { studentId },
        data: { logoPath: relativePath, logoName: file.originalname || filename, pdfPath: null },
      });
    } else {
      await this.createWithNumber(studentId, {
        logoPath: relativePath,
        logoName: file.originalname || filename,
      });
    }

    await auditService.record({
      actorId: actor.id,
      action: AUDIT_ACTIONS.UPLOAD_DOCUMENT,
      entityType: ENTITY_TYPES.CERTIFICATE,
      entityId: studentId,
      metadata: { logoPerusahaan: filename },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return this.getStatus(actor, studentId);
  }

  /**
   * Simpan nama "Kepala Bagian Teknik dan Pengelolaan" — penandatangan kanan
   * halaman 1. Boleh dikosongkan (ditandatangani manual di atas kertas), dan
   * mengubahnya setelah sertifikat terbit membuang snapshot lama supaya PDF
   * berikutnya memakai nama baru.
   */
  async setPenandatangan(
    actor: { id: string; role: string },
    kepalaBagianName: string,
    ctx: { ipAddress?: string; userAgent?: string }
  ): Promise<SertifikatStatus> {
    const studentId = await this.resolveTargetStudent(actor);
    const nama = kepalaBagianName.trim();
    if (nama.length > 120) throw new BadRequestError('Nama penandatangan maksimal 120 karakter');

    const existing = await prisma.certificate.findUnique({ where: { studentId } });
    if (existing) {
      if (existing.kepalaBagianName === (nama || null)) return this.getStatus(actor, studentId);
      if (existing.pdfPath) deleteStoredFile(existing.pdfPath);
      await prisma.certificate.update({
        where: { studentId },
        data: { kepalaBagianName: nama || null, pdfPath: null },
      });
    } else {
      await this.createWithNumber(studentId, { kepalaBagianName: nama || null });
    }

    await auditService.record({
      actorId: actor.id,
      action: AUDIT_ACTIONS.UPDATE_USER,
      entityType: ENTITY_TYPES.CERTIFICATE,
      entityId: studentId,
      metadata: { penandatanganKabag: nama || null },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return this.getStatus(actor, studentId);
  }

  /**
   * Terbitkan sertifikat. Snapshot dipakai ulang selama belum ada perubahan,
   * supaya nomor dan isi PDF tidak berubah-ubah setiap kali siswa mengunduh.
   */
  async getOrCreatePdf(
    actor: { id: string; role: string },
    studentId?: string,
    ctx: { ipAddress?: string; userAgent?: string } = {}
  ): Promise<{ buffer: Buffer; filename: string; number: string }> {
    const targetId = await this.resolveTargetStudent(actor, studentId);
    const cert = await prisma.certificate.findUnique({ where: { studentId: targetId } });
    if (!cert?.logoPath) {
      throw new BadRequestError(
        'Unggah logo perusahaan tempat PKL terlebih dahulu sebelum membuat sertifikat'
      );
    }

    const data = await this.collectData(targetId, cert);
    const code = data.nisn ?? targetId;
    const filename = `Sertifikat-PKL-${code}.pdf`.replace(/[^\w.-]+/g, '_');

    if (cert.pdfPath) {
      const stored = readStoredFile(cert.pdfPath);
      if (stored) return { buffer: stored, filename, number: cert.number };
    }

    const buffer = await renderSertifikatPdf(data);
    const { relativePath } = saveBuffer('letters', `sertifikat-${code}-${Date.now()}.pdf`, buffer);
    await prisma.certificate.update({
      where: { id: cert.id },
      data: { pdfPath: relativePath, issuedAt: new Date() },
    });

    await auditService.record({
      actorId: actor.id,
      action: AUDIT_ACTIONS.GENERATE_CERTIFICATE,
      entityType: ENTITY_TYPES.CERTIFICATE,
      entityId: targetId,
      metadata: { number: cert.number, numberSource: cert.numberSource },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return { buffer, filename, number: cert.number };
  }

  /** Admin/SuperAdmin: timpa nomor sertifikat dengan nomor resmi dari sekolah. */
  async setManualNumber(
    actorId: string,
    certificateId: string,
    number: string,
    ctx: { ipAddress?: string; userAgent?: string }
  ) {
    const cert = await prisma.certificate.findUnique({ where: { id: certificateId } });
    if (!cert) throw new NotFoundError('Sertifikat tidak ditemukan');

    const trimmed = number.trim();
    const clash = await prisma.certificate.findFirst({
      where: { number: trimmed, id: { not: certificateId } },
      select: { id: true },
    });
    if (clash) throw new ConflictError('Nomor itu sudah dipakai sertifikat siswa lain');

    // Snapshot lama dibuang: PDF berikutnya terbit dengan nomor baru.
    if (cert.pdfPath) deleteStoredFile(cert.pdfPath);
    await prisma.certificate.update({
      where: { id: certificateId },
      data: { number: trimmed, numberSource: 'MANUAL', pdfPath: null },
      select: { id: true, studentId: true, number: true, numberSource: true },
    });

    await auditService.record({
      actorId,
      action: AUDIT_ACTIONS.UPDATE_USER,
      entityType: ENTITY_TYPES.CERTIFICATE,
      entityId: cert.studentId,
      metadata: { nomorSertifikat: trimmed, numberSource: 'MANUAL' },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return this.getStatus({ id: actorId, role: Role.ADMIN }, cert.studentId);
  }

  /** Daftar sertifikat; guru pembimbing hanya melihat siswa bimbingannya. */
  async list(
    actor: { id: string; role: string },
    params: { page: number; perPage: number; cohortId?: string }
  ): Promise<{ items: CertificateRow[]; total: number }> {
    const where: Record<string, unknown> = {
      ...(params.cohortId ? { cohortId: params.cohortId } : {}),
    };

    if (actor.role === Role.GURU_PEMBIMBING) {
      const links = await prisma.studentSupervisor.findMany({
        where: { supervisorId: actor.id },
        select: { studentId: true },
      });
      if (links.length === 0) return { items: [], total: 0 };
      where.studentId = { in: links.map((l) => l.studentId) };
    }

    const [items, total] = await Promise.all([
      prisma.certificate.findMany({
        where,
        skip: (params.page - 1) * params.perPage,
        take: params.perPage,
        orderBy: { createdAt: 'desc' },
        include: {
          student: {
            select: {
              username: true,
              studentProfile: {
                select: { fullName: true, nisn: true, class: { select: { name: true } } },
              },
            },
          },
        },
      }),
      prisma.certificate.count({ where }),
    ]);

    return {
      items: items.map((c) => ({
        id: c.id,
        studentId: c.studentId,
        username: c.student.username,
        fullName: c.student.studentProfile?.fullName ?? c.student.username,
        nisn: c.student.studentProfile?.nisn ?? null,
        className: c.student.studentProfile?.class?.name ?? null,
        number: c.number,
        numberSource: c.numberSource,
        hasLogo: Boolean(c.logoPath),
        issuedAt: c.issuedAt ? c.issuedAt.toISOString() : null,
        ready: Boolean(c.pdfPath),
      })),
      total,
    };
  }

  /* ------------------------------------------------------------------ *
   * Internal
   * ------------------------------------------------------------------ */

  /** Siswa selalu untuk dirinya sendiri; staf menentukan siswa secara eksplisit. */
  private async resolveTargetStudent(
    actor: { id: string; role: string },
    studentId?: string
  ): Promise<string> {
    if (actor.role === Role.SISWA) {
      if (studentId && studentId !== actor.id) throw new ForbiddenError(MESSAGES.SCOPE);
      return actor.id;
    }
    if (!studentId) throw new BadRequestError('ID siswa wajib diisi');
    if (actor.role === Role.GURU_PEMBIMBING) {
      const link = await prisma.studentSupervisor.findUnique({
        where: { studentId },
        select: { supervisorId: true },
      });
      if (link?.supervisorId !== actor.id) throw new ForbiddenError(MESSAGES.SCOPE);
    }
    return studentId;
  }

  private async cohortIdOf(studentId: string): Promise<string | null> {
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { cohortId: true },
    });
    return student?.cohortId ?? null;
  }

  /**
   * Buat baris sertifikat dengan nomor urut tahun berjalan. Kolom `number` unik,
   * jadi dua siswa yang mengirim permintaan bersamaan dicoba ulang dengan urut
   * berikutnya (maks 25 percobaan — jauh di atas jumlah siswa satu sekolah).
   */
  private async createWithNumber(
    studentId: string,
    data: { logoPath?: string | null; logoName?: string | null; kepalaBagianName?: string | null }
  ): Promise<void> {
    const cohortId = await this.cohortIdOf(studentId);
    for (let attempt = 0; attempt < 25; attempt++) {
      const number = await this.nextNumber();
      try {
        await prisma.certificate.create({
          data: { studentId, cohortId, number, numberSource: 'SISTEM', ...data },
        });
        return;
      } catch (err) {
        const duplicated =
          typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
        if (!duplicated) throw err;
      }
    }
    throw new ConflictError('Nomor sertifikat otomatis sedang penuh, hubungi admin');
  }

  /** Nomor berikutnya untuk tahun berjalan (urut = jumlah sertifikat dibuat tahun ini + 1). */
  private async nextNumber(issuedAt = new Date()): Promise<string> {
    const startOfYear = new Date(issuedAt.getFullYear(), 0, 1);
    const issuedBefore = await prisma.certificate.count({
      where: { createdAt: { gte: startOfYear } },
    });
    return buildNumber(issuedBefore + 1, issuedAt);
  }

  private async activeRegistration(studentId: string) {
    const cohortId = await this.cohortIdOf(studentId);
    return prisma.registration.findFirst({
      where: {
        studentId,
        deletedAt: null,
        ...(cohortId ? { cohortId } : {}),
        status: { in: ['DIAJUKAN', 'DISETUJUI'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { company: { select: { name: true } } },
    });
  }

  /** Kumpulkan seluruh data PDF — gagal bila nilai belum terkunci atau ditolak. */
  private async collectData(
    studentId: string,
    cert: { number: string; logoPath: string | null; kepalaBagianName: string | null }
  ): Promise<SertifikatPdfData> {
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: {
        username: true,
        cohortId: true,
        studentProfile: {
          select: {
            fullName: true,
            nisn: true,
            birthDate: true,
            class: { select: { name: true } },
            major: { select: { name: true } },
          },
        },
        supervision: {
          select: {
            supervisor: {
              select: { username: true, teacherProfile: { select: { fullName: true, nip: true } } },
            },
          },
        },
      },
    });
    if (!student) throw new NotFoundError('Siswa tidak ditemukan');

    const grade = await prisma.grade.findFirst({
      where: { studentId, giverRole: Role.DUDI },
      orderBy: { createdAt: 'desc' },
      include: { aspects: true },
    });
    if (!grade?.submittedAt) {
      throw new BadRequestError('Nilai PKL belum dikirim — selesaikan penilaian terlebih dahulu');
    }
    const approval = await prisma.approval.findFirst({
      where: { entityType: ENTITY_TYPES.GRADE, entityId: grade.id },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    });
    if (approval?.status === ApprovalStatus.DITOLAK) {
      throw new BadRequestError('Nilai PKL ditolak guru pembimbing — perbaiki lalu kirim ulang');
    }

    const [school, registration, signatory, pklSchedule] = await Promise.all([
      settingService.getSchoolIdentity(),
      this.activeRegistration(studentId),
      prisma.letterSignatory.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } }),
      prisma.phaseSchedule.findFirst({
        where: {
          phase: StudentPhase.PKL_AKTIF,
          ...(student.cohortId ? { cohortId: student.cohortId } : {}),
        },
      }),
    ]);

    const issuedAt = new Date();
    const className = await classNameWithFallback(student.studentProfile);
    const mulai = fmtDate(pklSchedule?.startDate);
    const selesai = fmtDate(pklSchedule?.endDate);
    const nisn = student.studentProfile?.nisn ?? student.username;

    return {
      number: cert.number,
      issuedDateText: fmtTerbit(issuedAt),
      schoolName: school.schoolName,
      companyName: registration?.company?.name ?? '-',
      studentName: student.studentProfile?.fullName ?? student.username,
      className,
      majorName: student.studentProfile?.major?.name ?? null,
      nisn,
      birthLabel: fmtDate(student.studentProfile?.birthDate),
      pklRange: mulai && selesai ? `Mulai : ${mulai}  Selesai : ${selesai}` : null,
      predicate: grade.predicate,
      finalScore: grade.finalScore != null ? Number(grade.finalScore) : null,
      rataRata: grade.scoreDudi != null ? Number(grade.scoreDudi) : null,
      reportScore: grade.scoreReport != null ? Number(grade.scoreReport) : null,
      rows: this.scoreRows(grade.aspects),
      mentorName: grade.mentorName,
      guruName:
        student.supervision?.supervisor.teacherProfile?.fullName ??
        student.supervision?.supervisor.username ??
        null,
      guruNip: student.supervision?.supervisor.teacherProfile?.nip ?? null,
      kepalaName: signatory?.name ?? null,
      kepalaNip: signatory?.nip ?? null,
      kepalaBagianName: cert.kepalaBagianName,
      signatureBuffer: signatory?.signaturePath ? readStoredFile(signatory.signaturePath) : null,
      companyLogoBuffer: cert.logoPath ? readStoredFile(cert.logoPath) : null,
      qrBuffer: await this.qrFor(cert.number, nisn),
    };
  }

  /** Rincian butir — label resmi selalu dari konfigurasi, bukan dari penyimpanan. */
  private scoreRows(
    aspects: Array<{ groupCode: string | null; code: string | null; score: unknown }>
  ): SertifikatScoreRow[] {
    return PENILAIAN_ITEMS.map((item) => {
      const stored = aspects.find((a) => a.groupCode === item.groupCode && a.code === item.code);
      return {
        groupCode: item.groupCode,
        code: item.code,
        label: item.label,
        score: stored ? Number(stored.score) : 0,
      };
    });
  }

  /** QR memakai slot template; isinya teks verifikasi karena tidak ada URL publik. */
  private async qrFor(number: string, nisn: string): Promise<Buffer | null> {
    try {
      return await QRCode.toBuffer(`SERTIFIKAT PKL ${SERTIFIKAT_NUMBER.schoolCode} | ${number} | ${nisn}`, {
        margin: 1,
        width: 444,
        errorCorrectionLevel: 'M',
      });
    } catch {
      return null;
    }
  }
}

export const certificateService = new CertificateService();

import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { letterService } from '../services/letter.service';
import { finalReportService } from '../services/finalReport.service';
import { phaseService } from '../services/phase.service';
import { studentWorkflowService } from '../services/studentWorkflow.service';
import { notificationService } from '../services/notification.service';
import { auditService } from '../services/audit.service';
import { sendSuccess } from '../utils/response';
import { getRequestContext } from '../utils/request';
import { asyncHandler } from '../utils/asyncHandler';
import { readStoredFile } from '../utils/storage';
import { NotFoundError, BadRequestError, ForbiddenError } from '../errors/AppError';
import { AUDIT_ACTIONS, ENTITY_TYPES, MESSAGES } from '../config/constants';
import { registryClassByNisn } from '../services/classResolver.service';
import { CompletePhaseDTO, GenerateBulkLetterDTO } from '../validators/phase4.validator';
import { DocumentType, Prisma, Role, StudentPhase } from '@prisma/client';

type LetterScopePayload = {
  supervisorId?: string;
  supervisorName?: string;
  students?: Array<{ id: string; name?: string }>;
};

const STAFF_ROLES: Role[] = [Role.ADMIN, Role.SUPER_ADMIN, Role.KEPALA_SEKOLAH];

const BULK_LETTER_META: Record<
  'SURAT_PENGANTAR' | 'SURAT_MONITORING' | 'SURAT_PENJEMPUTAN',
  {
    label: string;
    hal: string;
    buildIntro: (range: string, replyNumber?: string) => string;
    outro: string;
    withPembimbing: boolean;
  }
> = {
  SURAT_PENGANTAR: {
    label: 'Surat Pengantar PKL',
    hal: 'Pengiriman Siswa PKL',
    buildIntro: (range, replyNumber) =>
      `Dengan Hormat, menindaklanjuti surat Bapak / Ibu dengan nomor : ${replyNumber || '........'} tertanggal dengan Perihal Penerimaan Siswa Praktek Kerja Lapangan (PKL), bersama ini kami kirimkan nama – nama siswa/i yang akan melaksanakan Praktek Kerja Lapangan (PKL) di Institusi / Lembaga yang Bapak / Ibu pimpin mulai **Tanggal ${range}** sebagai berikut:`,
    outro:
      'Demikian kami kirimkan, atas bantuan dan kerjasama yang Bapak / Ibu berikan kami ucapkan terima kasih.',
    withPembimbing: true,
  },
  SURAT_MONITORING: {
    label: 'Surat Monitoring PKL',
    hal: 'Monitoring Pembimbinan PKL',
    buildIntro: (range) =>
      `Dengan Hormat, bersama ini kami sampaikan daftar siswa yang berada dalam bimbingan kami beserta tempat PKL masing-masing, untuk keperluan monitoring pembimbinan pada masa PKL **${range}**:`,
    outro:
      'Kami mohon bantuan Bapak / Ibu dalam memonitor dan membimbing siswa kami selama pelaksanaan PKL. Demikian surat ini kami sampaikan, atas perhatian serta kerjasamanya kami ucapkan terima kasih.',
    withPembimbing: false,
  },
  SURAT_PENJEMPUTAN: {
    label: 'Surat Penjemputan Siswa',
    hal: 'Penjemputan Siswa PKL',
    buildIntro: (range) =>
      `Dengan Hormat, sehubungan dengan telah berakhirnya masa Praktek Kerja Lapangan (PKL) pada **${range}**, bersama ini kami daftarkan siswa-siswi kami yang kami tarik dari tempat PKL:`,
    outro:
      'Mohon siswa-siswi tersebut diizinkan untuk tidak melaksanakan aktivitas PKL lagi di perusahaan Bapak / Ibu. Demikian surat ini kami sampaikan, atas perhatian serta kerjasamanya kami ucapkan terima kasih.',
    withPembimbing: false,
  },
};

/**
 * Controller Fase 4 — surat bulk guru, daftar surat, transisi fase.
 */
export class Phase4Controller {
  /**
   * GET /api/phase4/final-report — unduh Laporan Hasil PKL per siswa
   * (diterbitkan otomatis satu kali setelah masa PKL selesai).
   * Siswa: laporannya sendiri. Guru: siswa bimbingannya (query ?studentId=).
   * Admin/kepsek: siswa mana pun (?studentId= wajib).
   */
  downloadFinalReport = asyncHandler(async (req: Request, res: Response) => {
    const { buffer, filename } = await finalReportService.getOrCreateForStudent(
      { id: req.user!.sub, role: req.user!.role },
      req.query.studentId as string | undefined
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  });

  /**
   * POST /api/phase4/bulk-letter — Guru/Admin: terbitkan surat bulk
   * (pengantar / monitoring / penjemputan) berisi daftar SELURUH siswa
   * bimbingan + nama & alamat perusahaan. Sekali generate untuk semua siswa.
   */
  generateBulkLetter = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as GenerateBulkLetterDTO;
    const ctx = getRequestContext(req);
    const actor = req.user!;
    const meta = BULK_LETTER_META[dto.type];

    // Guru selalu menerbitkan untuk siswa bimbingannya sendiri.
    const supervisorId = actor.role === Role.GURU_PEMBIMBING ? actor.sub : dto.supervisorId;
    if (!supervisorId) {
      throw new BadRequestError('Guru pembimbing wajib dipilih');
    }

    const supervisor = await prisma.user.findFirst({
      where: { id: supervisorId, role: Role.GURU_PEMBIMBING, isActive: true, deletedAt: null },
      select: {
        id: true,
        username: true,
        teacherProfile: { select: { fullName: true, nip: true, phone: true } },
      },
    });
    if (!supervisor) throw new NotFoundError('Guru pembimbing tidak ditemukan atau tidak aktif');

    const links = await prisma.studentSupervisor.findMany({
      where: { supervisorId },
      include: {
        student: {
          select: {
            id: true,
            cohortId: true,
            username: true,
            studentProfile: {
              select: {
                fullName: true,
                nisn: true,
                class: { select: { name: true } },
                major: { select: { name: true } },
              },
            },
            studentRegistrations: {
              where: { deletedAt: null, status: { in: ['DIAJUKAN', 'DISETUJUI'] } },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { company: { select: { name: true, address: true, city: true } } },
            },
          },
        },
      },
      orderBy: { assignedAt: 'asc' },
    });

    const students = links.map((l) => l.student);
    if (students.length === 0) {
      throw new BadRequestError('Belum ada siswa bimbingan untuk guru ini');
    }

    // Kelas: preferensi Class.name, fallback ke Master Siswa (NISN).
    const registryClass = await registryClassByNisn(students.map((s) => s.studentProfile?.nisn));

    const rows = students.map((s, i) => {
      const reg = s.studentRegistrations[0];
      const nisn = s.studentProfile?.nisn ?? null;
      return {
        no: `${i + 1}.`,
        id: s.id,
        name: s.studentProfile?.fullName ?? s.username,
        nisn,
        className: s.studentProfile?.class?.name ?? (nisn ? registryClass.get(nisn) ?? null : null),
        majorName: s.studentProfile?.major?.name ?? null,
        company: reg?.company?.name ?? '-',
        address: reg?.company?.address ?? '-',
        companyCity: reg?.company?.city ?? null,
      };
    });

    const uniqueCompanies = [
      ...new Map(
        rows
          .filter((r) => r.company !== '-')
          .map((r) => [r.company, { name: r.company, address: r.address, city: r.companyCity }])
      ).values(),
    ];
    const teacherName = supervisor.teacherProfile?.fullName ?? supervisor.username;
    const cohortId = students.find((s) => s.cohortId)?.cohortId ?? null;
    const rangeText = (await letterService.getPklRangeText(cohortId)) ?? 'masa PKL yang ditentukan';

    // Surat bulk (Pengantar/Monitoring/Penjemputan) memuat daftar siswa yang bisa
    // berada di perusahaan berbeda — baris "Kepada Yth" ditujukan generik ke
    // pimpinan perusahaan (bukan menamai satu perusahaan tertentu).
    const recipientLines = ['Bapak / Ibu Pimpinan Perusahaan', 'Di Tempat'];
    const recipientCity = '';

    // Tabel seragam 6 kolom: NISN + kelas + perusahaan/alamat per siswa
    // (siswa bimbingan bisa berada di perusahaan berbeda-beda).
    const table = {
      columns: ['NO', 'NISN', 'NAMA SISWA', 'KELAS', 'PERUSAHAAN', 'ALAMAT'],
      rows: rows.map((r) => [r.no, r.nisn ?? '-', r.name, r.className ?? '-', r.company, r.address ?? '-']),
      widths: [26, 56, 88, 52, 90, 87] as number[],
      aligns: ['center', 'center', 'left', 'center', 'left', 'left'] as Array<'left' | 'center' | 'right'>,
    };

    const result = await letterService.generateLetter({
      type: dto.type as DocumentType,
      number: dto.number ?? null,
      hal: meta.hal,
      recipientLines,
      recipientCity,
      paragraphs: [meta.buildIntro(rangeText, dto.replyNumber ?? undefined)],
      table,
      pembimbing: meta.withPembimbing
        ? {
            nama: teacherName,
            nip: supervisor.teacherProfile?.nip ?? null,
            alamat: '-',
            telp: supervisor.teacherProfile?.phone ?? null,
          }
        : null,
      closing: meta.outro,
      cohortId,
      createdById: actor.sub,
      payload: {
        supervisorId,
        supervisorName: teacherName,
        students: rows.map((r) => ({ id: r.id, name: r.name })),
        companies: uniqueCompanies,
      },
    });

    // Kabari seluruh siswa bimbingan bahwa surat terbit.
    let notified = 0;
    for (const student of students) {
      await notificationService.create(
        student.id,
        meta.label,
        `${teacherName} menerbitkan ${meta.label} yang memuat data Anda. Silakan unduh pada menu Surat/Dokumen.`,
        'LETTER',
        '/dokumen'
      );
      notified += 1;
    }

    await auditService.record({
      actorId: actor.sub,
      action: AUDIT_ACTIONS.GENERATE_LETTER,
      entityType: ENTITY_TYPES.DOCUMENT,
      entityId: result.letterId,
      metadata: { type: dto.type, supervisorId, studentCount: students.length },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return sendSuccess(
      res,
      { ...result, studentCount: students.length, notified },
      `${meta.label} berhasil digenerate untuk ${students.length} siswa`,
      201
    );
  });

  private asScopePayload(payload: Prisma.JsonValue): LetterScopePayload {
    return (payload && typeof payload === 'object' ? payload : {}) as LetterScopePayload;
  }

  /** Apakah pengguna berhak melihat surat ini? */
  private async canAccessLetter(
    letter: { createdById: string | null; payload: Prisma.JsonValue },
    user: { sub: string; role: Role }
  ): Promise<boolean> {
    if (STAFF_ROLES.includes(user.role)) return true;
    const payload = this.asScopePayload(letter.payload);
    if (user.role === Role.GURU_PEMBIMBING) {
      return letter.createdById === user.sub || payload.supervisorId === user.sub;
    }
    return Array.isArray(payload.students) && payload.students.some((s) => s.id === user.sub);
  }

  /**
   * GET /api/phase4/letters
   * Staff: semua surat. Guru: yang dia terbitkan / atas namanya.
   * Siswa: surat yang memuat dirinya.
   */
  listLetters = asyncHandler(async (req: Request, res: Response) => {
    const type = req.query.type as DocumentType | undefined;
    const user = req.user!;

    const letters = await prisma.generatedLetter.findMany({
      where: type ? { type } : {},
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        number: true,
        subject: true,
        signerName: true,
        createdById: true,
        createdAt: true,
        payload: true,
      },
    });

    let filtered = letters;
    if (!STAFF_ROLES.includes(user.role)) {
      filtered = [];
      for (const letter of letters) {
        if (await this.canAccessLetter(letter, user)) filtered.push(letter);
      }
    }

    const items = filtered.map((letter) => {
      const payload = this.asScopePayload(letter.payload);
      return {
        id: letter.id,
        type: letter.type,
        number: letter.number,
        subject: letter.subject,
        signerName: letter.signerName,
        createdById: letter.createdById,
        supervisorName: payload.supervisorName ?? null,
        studentCount: Array.isArray(payload.students) ? payload.students.length : 0,
        createdAt: letter.createdAt,
      };
    });
    return sendSuccess(res, items, 'OK');
  });

  /** GET /api/phase4/letters/:id/download — unduh PDF surat (scope sama dengan list) */
  downloadLetter = asyncHandler(async (req: Request, res: Response) => {
    const letter = await prisma.generatedLetter.findUnique({ where: { id: req.params.id as string } });
    if (!letter?.pdfPath) throw new NotFoundError('Surat tidak ditemukan');

    const allowed = await this.canAccessLetter(letter, req.user!);
    if (!allowed) throw new ForbiddenError(MESSAGES.SCOPE);

    const buffer = readStoredFile(letter.pdfPath);
    if (!buffer) throw new NotFoundError('File surat tidak ditemukan di storage');

    const filename = `${letter.type}-${letter.number ? `${letter.number}-` : ''}${letter.id}.pdf`
      .replace(/[^\w.-]+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  });

  /** POST /api/phase4/complete — Admin: update fase pkl-aktif → pkl-selesai */
  completePhase = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as CompletePhaseDTO;
    const ctx = getRequestContext(req);

    const results: Array<Record<string, string>> = [];
    const skipped: Array<Record<string, string>> = [];

    for (const studentId of dto.studentIds) {
      // Sinkronkan dengan jadwal + kelengkapan dokumen terlebih dahulu,
      // agar transisi selalu satu langkah dan tidak gagal di tengah loop.
      await studentWorkflowService.syncScheduledPhase(studentId);
      const student = await prisma.user.findUnique({
        where: { id: studentId },
        select: { phase: true },
      });
      if (!student) {
        skipped.push({ studentId, reason: 'Siswa tidak ditemukan' });
        continue;
      }
      if (student.phase !== StudentPhase.PKL_AKTIF) {
        skipped.push({ studentId, reason: `Fase saat ini ${student.phase}, bukan PKL_AKTIF` });
        continue;
      }

      await phaseService.transition(studentId, StudentPhase.PKL_SELESAI, {
        ...ctx,
        actorId: req.user!.sub,
      });
      results.push({ studentId, from: StudentPhase.PKL_AKTIF, to: StudentPhase.PKL_SELESAI });
    }

    return sendSuccess(
      res,
      { results, skipped },
      `${results.length} siswa berpindah ke PKL_SELESAI${skipped.length ? `, ${skipped.length} dilewati` : ''}`
    );
  });
}

export const phase4Controller = new Phase4Controller();

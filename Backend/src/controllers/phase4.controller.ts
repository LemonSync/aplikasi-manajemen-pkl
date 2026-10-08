import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { letterService } from '../services/letter.service';
import { finalReportService } from '../services/finalReport.service';
import { phaseService } from '../services/phase.service';
import { studentWorkflowService } from '../services/studentWorkflow.service';
import { groupRepository } from '../repositories/group.repository';
import { auditService } from '../services/audit.service';
import { sendSuccess } from '../utils/response';
import { getRequestContext } from '../utils/request';
import { asyncHandler } from '../utils/asyncHandler';
import { readStoredFile } from '../utils/storage';
import { NotFoundError, BadRequestError, ForbiddenError } from '../errors/AppError';
import { AUDIT_ACTIONS, ENTITY_TYPES, MESSAGES } from '../config/constants';
import {
  GenerateWithdrawalLetterDTO,
  CompletePhaseDTO,
  GeneratePengantarLetterDTO,
  GeneratePenugasanLetterDTO,
} from '../validators/phase4.validator';
import { DocumentType, Role, StudentPhase } from '@prisma/client';

/**
 * Controller Fase 4 — surat penugasan, surat pengantar, surat penarikan + transisi fase.
 */
export class Phase4Controller {
  /**
   * GET /api/phase4/final-report — SISWA: unduh Laporan Hasil PKL kelompoknya
   * (diterbitkan otomatis satu kali setelah masa PKL selesai).
   */
  downloadFinalReport = asyncHandler(async (req: Request, res: Response) => {
    const { buffer, filename } = await finalReportService.getOrCreateForStudent(req.user!.sub);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  });
  /** POST /api/phase4/assignment-letter — Admin: generate surat penugasan pembimbing */
  generateAssignmentLetter = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as GeneratePenugasanLetterDTO;
    const ctx = getRequestContext(req);

    const group = await groupRepository.findByIdWithRelations(dto.groupId);
    if (!group) throw new NotFoundError('Kelompok tidak ditemukan');

    // Cek guru pembimbing adalah anggota GroupSupervisor
    const isSupervisor = group.supervisors.some((s) => s.userId === dto.supervisorId);
    if (!isSupervisor) {
      throw new BadRequestError('Guru tersebut bukan pembimbing kelompok ini');
    }

    const supervisor = group.supervisors.find((s) => s.userId === dto.supervisorId);
    const teacherName = supervisor?.user?.teacherProfile?.fullName ?? supervisor?.user?.username ?? 'Guru';
    const teacherNip = supervisor?.user?.teacherProfile?.nip ?? '';

    const result = await letterService.generateLetter({
      type: DocumentType.SURAT_PENUGASAN,
      number: dto.number ?? null,
      title: 'SURAT PENUGASAN PEMBIMBING PRAKTIK KERJA LAPANGAN',
      recipientLines: [
        'Kepada Yth.',
        `${teacherName}`,
        'di Tempat',
      ],
      bodyParagraphs: [
        'Dengan hormat,',
        'Berdasarkan kebutuhan pembimbingan selama pelaksanaan Praktik Kerja Lapangan (PKL), dengan ini kami menugaskan:',
        `Nama: ${teacherName}`,
        `NIP: ${teacherNip || '-'}`,
        `Kelompok: ${group.name}`,
        `Perusahaan: ${group.company?.name ?? '-'}`,
        `Periode PKL: ${group.startDate ? new Date(group.startDate).toLocaleDateString('id-ID') : '-'} s/d ${group.endDate ? new Date(group.endDate).toLocaleDateString('id-ID') : '-'}`,
        'Bapak/Ibu diharapkan dapat membimbing dan memonitor siswa selama pelaksanaan PKL di perusahaan tersebut.',
        'Demikian surat penugasan ini kami buat dengan sebenarnya. Atas perhatian dan kerjasamanya, kami ucapkan terima kasih.',
      ],
      closing: 'Terima kasih atas kerjasamanya.',
      cohortId: group.cohortId,
      relatedGroupId: group.id,
      payload: { supervisorId: dto.supervisorId, teacherName, groupName: group.name },
    });

    await auditService.record({
      actorId: req.user!.sub,
      action: AUDIT_ACTIONS.GENERATE_LETTER,
      entityType: ENTITY_TYPES.DOCUMENT,
      entityId: result.letterId,
      metadata: { type: DocumentType.SURAT_PENUGASAN, supervisorId: dto.supervisorId, groupName: group.name },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return sendSuccess(res, result, 'Surat penugasan pembimbing berhasil digenerate', 201);
  });

  /** POST /api/phase4/introduction-letter — Admin: generate surat pengantar PKL ke perusahaan */
  generateIntroductionLetter = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as GeneratePengantarLetterDTO;
    const ctx = getRequestContext(req);

    const group = await groupRepository.findByIdWithRelations(dto.groupId);
    if (!group) throw new NotFoundError('Kelompok tidak ditemukan');

    const memberNames = group.members
      .map((m, i) => `${i + 1}. ${m.user?.studentProfile?.fullName ?? m.user?.username ?? 'Siswa'}`)
      .join('\n');

    const result = await letterService.generateLetter({
      type: DocumentType.SURAT_PENGANTAR,
      number: dto.number ?? null,
      title: 'SURAT PENGANTAR PRAKTIK KERJA LAPANGAN',
      recipientLines: [
        'Kepada Yth.',
        `Pimpinan ${group.company?.name ?? 'Perusahaan'}`,
        `${group.company?.address ?? ''}`,
        'di Tempat',
      ],
      bodyParagraphs: [
        'Dengan hormat,',
        'Bersama surat ini kami kirimkan siswa-siswi kami untuk melaksanakan Praktik Kerja Lapangan (PKL) di perusahaan Bapak/Ibu:',
        memberNames,
        `Kelompok: ${group.name}`,
        `Periode PKL: ${group.startDate ? new Date(group.startDate).toLocaleDateString('id-ID') : '-'} s/d ${group.endDate ? new Date(group.endDate).toLocaleDateString('id-ID') : '-'}`,
        'Kami mohon bantuan dan bimbingan Bapak/Ibu selama siswa kami melaksanakan PKL di perusahaan yang Bapak/Ibu pimpin.',
        'Demikian surat pengantar ini kami buat dengan sebenarnya. Atas perhatian dan kerjasamanya, kami ucapkan terima kasih.',
      ],
      closing: 'Terima kasih atas kerjasamanya.',
      cohortId: group.cohortId,
      relatedGroupId: group.id,
      payload: { groupName: group.name, companyName: group.company?.name },
    });

    await auditService.record({
      actorId: req.user!.sub,
      action: AUDIT_ACTIONS.GENERATE_LETTER,
      entityType: ENTITY_TYPES.DOCUMENT,
      entityId: result.letterId,
      metadata: { type: DocumentType.SURAT_PENGANTAR, groupName: group.name },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return sendSuccess(res, result, 'Surat pengantar PKL berhasil digenerate', 201);
  });

  /** POST /api/phase4/withdrawal-letter — Admin: generate surat penarikan siswa */
  generateWithdrawalLetter = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as GenerateWithdrawalLetterDTO;
    const ctx = getRequestContext(req);

    const group = await groupRepository.findByIdWithRelations(dto.groupId);
    if (!group) throw new NotFoundError('Kelompok tidak ditemukan');

    // Validasi semua siswa adalah anggota kelompok
    const memberUserIds = group.members.map((m) => m.userId);
    const invalidStudents = dto.studentIds.filter((id) => !memberUserIds.includes(id));
    if (invalidStudents.length > 0) {
      throw new BadRequestError('Beberapa siswa bukan anggota kelompok ini');
    }

    const results = [];
    for (const studentId of dto.studentIds) {
      const member = group.members.find((m) => m.userId === studentId);
      const studentName = member?.user?.studentProfile?.fullName ?? member?.user?.username ?? 'Siswa';

      const result = await letterService.generateLetter({
        type: DocumentType.SURAT_PENARIKAN,
        number: dto.number ?? null,
        title: 'SURAT PENARIKAN SISWA PRAKTIK KERJA LAPANGAN',
        recipientLines: [
          `Kepada Yth.`,
          `${group.company?.name ?? 'Perusahaan'}`,
          `di Tempat`,
        ],
        bodyParagraphs: [
          `Dengan hormat,`,
          `Sehubungan dengan telah berakhirnya masa Praktik Kerja Lapangan (PKL), bersama ini kami menarik siswa kami:`,
          `Nama: ${studentName}`,
          `Kelompok: ${group.name}`,
          `Mohon siswa tersebut diizinkan untuk tidak melaksanakan aktivitas PKL lagi di perusahaan Bapak/Ibu.`,
          `Demikian surat penarikan ini kami buat dengan sebenarnya. Atas perhatian dan kerjasamanya, kami ucapkan terima kasih.`,
        ],
        closing: 'Terima kasih atas kerjasamanya.',
        cohortId: group.cohortId,
        relatedGroupId: group.id,
        payload: { studentId, studentName, groupName: group.name },
      });

      await auditService.record({
        actorId: req.user!.sub,
        action: AUDIT_ACTIONS.GENERATE_LETTER,
        entityType: ENTITY_TYPES.DOCUMENT,
        entityId: result.letterId,
        metadata: { type: DocumentType.SURAT_PENARIKAN, studentId, groupName: group.name },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      results.push(result);
    }

    return sendSuccess(res, results, 'Surat penarikan berhasil digenerate', 201);
  });

  /** ID kelompok yang diikuti siswa (termasuk kelompok dari pendaftaran yang dipimpinnya). */
  private async studentGroupIds(userId: string): Promise<string[]> {
    const [memberships, ledRegistrations] = await Promise.all([
      prisma.groupMember.findMany({ where: { userId }, select: { groupId: true } }),
      prisma.registration.findMany({ where: { leaderId: userId }, select: { id: true } }),
    ]);
    const ids = memberships.map((m) => m.groupId);
    if (ledRegistrations.length > 0) {
      const groups = await prisma.group.findMany({
        where: { registrationId: { in: ledRegistrations.map((r) => r.id) } },
        select: { id: true },
      });
      ids.push(...groups.map((g) => g.id));
    }
    return [...new Set(ids)];
  }

  /**
   * GET /api/phase4/letters — Admin: semua surat; Siswa: hanya surat kelompoknya.
   */
  listLetters = asyncHandler(async (req: Request, res: Response) => {
    const groupId = req.query.groupId as string | undefined;
    const type = req.query.type as DocumentType | undefined;
    const role = req.user!.role;
    const isStaff = role === Role.ADMIN || role === Role.SUPER_ADMIN;

    let relatedGroupFilter: { in: string[] } | undefined;
    if (!isStaff) {
      const allowed = await this.studentGroupIds(req.user!.sub);
      const finalIds = groupId ? allowed.filter((id) => id === groupId) : allowed;
      if (finalIds.length === 0) return sendSuccess(res, [], 'OK');
      relatedGroupFilter = { in: finalIds };
    } else if (groupId) {
      relatedGroupFilter = { in: [groupId] };
    }

    const letters = await prisma.generatedLetter.findMany({
      where: {
        ...(relatedGroupFilter ? { relatedGroupId: relatedGroupFilter } : {}),
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        number: true,
        subject: true,
        signerName: true,
        relatedGroupId: true,
        createdAt: true,
      },
    });
    return sendSuccess(res, letters, 'OK');
  });

  /** GET /api/phase4/letters/:id/download — Admin & pemilik kelompok: unduh PDF surat */
  downloadLetter = asyncHandler(async (req: Request, res: Response) => {
    const letter = await prisma.generatedLetter.findUnique({ where: { id: req.params.id as string } });
    if (!letter?.pdfPath) throw new NotFoundError('Surat tidak ditemukan');

    const role = req.user!.role;
    if (role !== Role.ADMIN && role !== Role.SUPER_ADMIN) {
      const allowed = await this.studentGroupIds(req.user!.sub);
      if (!letter.relatedGroupId || !allowed.includes(letter.relatedGroupId)) {
        throw new ForbiddenError(MESSAGES.SCOPE);
      }
    }

    const buffer = readStoredFile(letter.pdfPath);
    if (!buffer) throw new NotFoundError('File surat tidak ditemukan di storage');

    const filename = `${letter.type}-${letter.number ? `${letter.number}-` : ''}${letter.id}.pdf`
      .replace(/[^\w.\-]+/g, '_');
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

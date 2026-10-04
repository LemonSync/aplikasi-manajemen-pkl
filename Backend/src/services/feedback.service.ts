import { Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { feedbackRepository } from '../repositories/feedback.repository';
import { auditService } from './audit.service';
import { BadRequestError, ForbiddenError } from '../errors/AppError';
import { ENTITY_TYPES, MESSAGES } from '../config/constants';
import { CreateFeedbackDTO } from '../validators/phase4.validator';

/**
 * Service feedback DUDI (Fase 4).
 */
export class FeedbackService {
  /** DUDI: input feedback per siswa (hanya siswa pada kelompok yang diawasinya). */
  async create(
    authorId: string,
    authorRole: string,
    dto: CreateFeedbackDTO,
    ctx: { ipAddress?: string; userAgent?: string }
  ) {
    if (authorRole === Role.DUDI) {
      if (!dto.groupId) throw new BadRequestError('Kelompok wajib diisi saat DUDI menginput feedback');
      const assignment = await prisma.groupDudiMentor.findUnique({
        where: { groupId_dudiUserId: { groupId: dto.groupId, dudiUserId: authorId } },
      });
      if (!assignment) throw new ForbiddenError(MESSAGES.SCOPE);
      const isMember = await prisma.groupMember.findFirst({
        where: { groupId: dto.groupId, userId: dto.studentId },
        select: { id: true },
      });
      if (!isMember) throw new BadRequestError('Siswa bukan anggota kelompok ini');
    }

    const feedback = await feedbackRepository.create({
      author: { connect: { id: authorId } },
      studentId: dto.studentId,
      groupId: dto.groupId ?? null,
      body: dto.body,
    });

    await auditService.record({
      actorId: authorId,
      action: 'CREATE_FEEDBACK',
      entityType: ENTITY_TYPES.USER,
      entityId: dto.studentId,
      metadata: { feedbackId: feedback.id },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return feedback;
  }

  /** Lihat feedback per siswa. DUDI hanya untuk siswa pada kelompok bimbingannya. */
  async listByStudent(studentId: string, actor: { id: string; role: string }) {
    if (actor.role === Role.DUDI) {
      const supervised = await prisma.groupDudiMentor.findFirst({
        where: { dudiUserId: actor.id, group: { members: { some: { userId: studentId } }, deletedAt: null } },
        select: { groupId: true },
      });
      if (!supervised) throw new ForbiddenError(MESSAGES.SCOPE);
    }
    return feedbackRepository.findMany({ studentId });
  }

  /** Admin: daftar semua feedback (paginated). */
  async list(params: { page: number; perPage: number; studentId?: string; groupId?: string }) {
    const where = {
      ...(params.studentId ? { studentId: params.studentId } : {}),
      ...(params.groupId ? { groupId: params.groupId } : {}),
    };
    return feedbackRepository.paginate(where, (params.page - 1) * params.perPage, params.perPage);
  }
}

export const feedbackService = new FeedbackService();

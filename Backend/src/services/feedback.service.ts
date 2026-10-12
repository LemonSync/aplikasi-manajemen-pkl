import { Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { feedbackRepository } from '../repositories/feedback.repository';
import { auditService } from './audit.service';
import { BadRequestError, ForbiddenError } from '../errors/AppError';
import { AUDIT_ACTIONS, ENTITY_TYPES, MESSAGES } from '../config/constants';
import { CreateFeedbackDTO } from '../validators/phase4.validator';

/**
 * Service feedback untuk siswa (Fase 4) — dari admin/guru pembimbing.
 */
export class FeedbackService {
  /** Admin: bebas. Guru: hanya untuk siswa bimbingannya. */
  async create(
    authorId: string,
    authorRole: string,
    dto: CreateFeedbackDTO,
    ctx: { ipAddress?: string; userAgent?: string }
  ) {
    if (authorRole === Role.GURU_PEMBIMBING) {
      const link = await prisma.studentSupervisor.findUnique({
        where: { studentId: dto.studentId },
        select: { supervisorId: true },
      });
      if (link?.supervisorId !== authorId) throw new BadRequestError(MESSAGES.SCOPE);
    }

    const feedback = await feedbackRepository.create({
      author: { connect: { id: authorId } },
      studentId: dto.studentId,
      body: dto.body,
    });

    await auditService.record({
      actorId: authorId,
      action: AUDIT_ACTIONS.CREATE_FEEDBACK,
      entityType: ENTITY_TYPES.USER,
      entityId: dto.studentId,
      metadata: { feedbackId: feedback.id },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return feedback;
  }

  /**
   * Lihat feedback per siswa.
   * Siswa: hanya miliknya sendiri. Guru: hanya siswa bimbingannya. Admin: bebas.
   */
  async listByStudent(studentId: string, actor: { id: string; role: string }) {
    if (actor.role === Role.SISWA) {
      if (studentId !== actor.id) throw new ForbiddenError(MESSAGES.SCOPE);
    } else if (actor.role === Role.GURU_PEMBIMBING) {
      const link = await prisma.studentSupervisor.findUnique({
        where: { studentId },
        select: { supervisorId: true },
      });
      if (link?.supervisorId !== actor.id) throw new BadRequestError(MESSAGES.SCOPE);
    }
    return feedbackRepository.findMany({ studentId });
  }

  /** Admin: daftar semua feedback (paginated). */
  async list(params: { page: number; perPage: number; studentId?: string }) {
    const where = {
      ...(params.studentId ? { studentId: params.studentId } : {}),
    };
    return feedbackRepository.paginate(where, (params.page - 1) * params.perPage, params.perPage);
  }
}

export const feedbackService = new FeedbackService();

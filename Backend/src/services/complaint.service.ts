import { ComplaintStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { complaintRepository } from '../repositories/complaint.repository';
import { auditService } from './audit.service';
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors/AppError';
import { AUDIT_ACTIONS, ENTITY_TYPES, MESSAGES } from '../config/constants';

export interface CreateComplaintInput {
  subject: string;
  body: string;
}

/**
 * Service pengaduan siswa (Fase 3).
 * Siswa membuat pengaduan (author); guru pembimbing dari siswa tersebut
 * dan admin dapat membalas/melihat.
 */
export class ComplaintService {
  async create(
    userId: string,
    input: CreateComplaintInput,
    ctx: { ipAddress?: string; userAgent?: string }
  ) {
    const complaint = await complaintRepository.create({
      author: { connect: { id: userId } },
      subject: input.subject,
      body: input.body,
      status: ComplaintStatus.TERBUKA,
    });

    await auditService.record({
      actorId: userId,
      action: AUDIT_ACTIONS.CREATE_COMPLAINT,
      entityType: ENTITY_TYPES.COMPLAINT,
      entityId: complaint.id,
      metadata: { subject: input.subject },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return complaintRepository.findById(complaint.id);
  }

  async getById(id: string) {
    const complaint = await complaintRepository.findById(id);
    if (!complaint) throw new NotFoundError(MESSAGES.NOT_FOUND);
    return complaint;
  }

  /** Pastikan aktor berhak melihat/membalas pengaduan. */
  async assertCanAccess(actorId: string, actorRole: string, complaintId: string) {
    const complaint = await this.getById(complaintId);
    // Admin/kepsek/super-admin boleh akses semua
    if (['ADMIN', 'SUPER_ADMIN', 'KEPALA_SEKOLAH'].includes(actorRole)) return complaint;
    // Penulis sendiri
    if (complaint.authorId === actorId) return complaint;
    // Guru pembimbing dari siswa penulis
    const link = await prisma.studentSupervisor.findUnique({
      where: { studentId: complaint.authorId },
      select: { supervisorId: true },
    });
    if (link?.supervisorId === actorId) return complaint;
    throw new ForbiddenError(MESSAGES.COMPLAINT.NOT_OWNER);
  }

  /** Balas pengaduan. */
  async reply(
    actorId: string,
    actorRole: string,
    complaintId: string,
    body: string,
    ctx: { ipAddress?: string; userAgent?: string }
  ) {
    const complaint = await this.assertCanAccess(actorId, actorRole, complaintId);
    if (complaint.status === ComplaintStatus.SELESAI) {
      throw new BadRequestError(MESSAGES.COMPLAINT.CLOSED);
    }

    await complaintRepository.addReply({
      complaint: { connect: { id: complaintId } },
      author: { connect: { id: actorId } },
      body,
    });

    await auditService.record({
      actorId,
      action: AUDIT_ACTIONS.REPLY_COMPLAINT,
      entityType: ENTITY_TYPES.COMPLAINT,
      entityId: complaintId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return complaintRepository.findById(complaintId);
  }

  /** Tutup pengaduan (pemilik atau admin). */
  async close(actorId: string, actorRole: string, complaintId: string) {
    const complaint = await this.assertCanAccess(actorId, actorRole, complaintId);
    await complaintRepository.update(complaint.id, { status: ComplaintStatus.SELESAI });
    return complaintRepository.findById(complaintId);
  }

  /** Daftar pengaduan milik siswa. */
  async myComplaints(userId: string, params: { page: number; perPage: number }) {
    return complaintRepository.paginate(
      { authorId: userId },
      (params.page - 1) * params.perPage,
      params.perPage
    );
  }

  /** Daftar pengaduan (admin/guru) dengan filter. */
  async list(
    params: {
      page: number;
      perPage: number;
      status?: ComplaintStatus;
      authorId?: string;
      cohortId?: string;
    },
    actor?: { id: string; role: string }
  ) {
    const where: Prisma.ComplaintWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.authorId ? { authorId: params.authorId } : {}),
      // Filter per gelombang lewat relasi penulis
      ...(params.cohortId ? { author: { cohortId: params.cohortId } } : {}),
    };

    // Guru pembimbing hanya melihat pengaduan siswa bimbingannya
    if (actor && actor.role === 'GURU_PEMBIMBING') {
      const links = await prisma.studentSupervisor.findMany({
        where: { supervisorId: actor.id },
        select: { studentId: true },
      });
      const supervisedIds = links.map((l) => l.studentId);
      if (params.authorId) {
        if (!supervisedIds.includes(params.authorId)) throw new BadRequestError(MESSAGES.SCOPE);
      } else if (supervisedIds.length === 0) {
        return { items: [], total: 0 };
      } else {
        where.authorId = { in: supervisedIds };
      }
    }

    return complaintRepository.paginate(where, (params.page - 1) * params.perPage, params.perPage);
  }
}

export const complaintService = new ComplaintService();

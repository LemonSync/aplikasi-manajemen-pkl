import { ComplaintStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { complaintRepository } from '../repositories/complaint.repository';
import { groupRepository } from '../repositories/group.repository';
import { auditService } from './audit.service';
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors/AppError';
import { AUDIT_ACTIONS, ENTITY_TYPES, MESSAGES } from '../config/constants';

export interface CreateComplaintInput {
  subject: string;
  body: string;
}

/**
 * Service pengaduan siswa (Fase 3).
 * Siswa dapat membuat pengaduan; guru pembimbing/DUDI/admin dapat membalas.
 */
export class ComplaintService {
  async create(
    userId: string,
    input: CreateComplaintInput,
    ctx: { ipAddress?: string; userAgent?: string }
  ) {
    const group = await groupRepository.findActiveByMember(userId);

    const complaint = await complaintRepository.create({
      author: { connect: { id: userId } },
      ...(group ? { group: { connect: { id: group.id } } } : {}),
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
    // Pembimbing kelompok terkait
    if (complaint.groupId) {
      const group = await groupRepository.findByIdWithRelations(complaint.groupId);
      if (group?.supervisors.some((s) => s.userId === actorId)) return complaint;
    }
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
      groupId?: string;
      authorId?: string;
      cohortId?: string;
    },
    actor?: { id: string; role: string }
  ) {
    const where: Prisma.ComplaintWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.groupId ? { groupId: params.groupId } : {}),
      ...(params.authorId ? { authorId: params.authorId } : {}),
      ...(params.cohortId ? { group: { cohortId: params.cohortId } } : {}),
    };

    // Guru pembimbing hanya melihat pengaduan kelompok bimbingannya
    if (actor && actor.role === 'GURU_PEMBIMBING') {
      const supervised = await prisma.groupSupervisor.findMany({
        where: { userId: actor.id },
        select: { groupId: true },
      });
      const ids = supervised.map((s) => s.groupId);
      if (params.groupId) {
        if (!ids.includes(params.groupId)) throw new ForbiddenError(MESSAGES.SCOPE);
      } else if (ids.length === 0) {
        return { items: [], total: 0 };
      } else {
        where.groupId = { in: ids };
      }
    }

    return complaintRepository.paginate(where, (params.page - 1) * params.perPage, params.perPage);
  }
}

export const complaintService = new ComplaintService();

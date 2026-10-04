import { Complaint, ComplaintReply, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

export type ComplaintWithRelations = Prisma.ComplaintGetPayload<{
  include: {
    author: { select: { id: true; username: true; studentProfile: { select: { fullName: true } } } };
    group: { select: { id: true; name: true } };
    replies: { include: { author: { select: { id: true; username: true } } } };
  };
}>;

/**
 * Repository pengaduan + balasan (Fase 3).
 */
export class ComplaintRepository {
  async findById(id: string): Promise<ComplaintWithRelations | null> {
    return prisma.complaint.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, username: true, studentProfile: { select: { fullName: true } } } },
        group: { select: { id: true, name: true } },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, username: true } } },
        },
      },
    });
  }

  async create(data: Prisma.ComplaintCreateInput): Promise<Complaint> {
    return prisma.complaint.create({ data });
  }

  async update(id: string, data: Prisma.ComplaintUpdateInput): Promise<Complaint> {
    return prisma.complaint.update({ where: { id }, data });
  }

  async addReply(data: Prisma.ComplaintReplyCreateInput): Promise<ComplaintReply> {
    return prisma.complaintReply.create({ data });
  }

  async paginate(
    where: Prisma.ComplaintWhereInput,
    skip: number,
    take: number
  ): Promise<{ items: ComplaintWithRelations[]; total: number }> {
    const [items, total] = await Promise.all([
      prisma.complaint.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          author: { select: { id: true, username: true, studentProfile: { select: { fullName: true } } } },
          group: { select: { id: true, name: true } },
          replies: {
            orderBy: { createdAt: 'asc' },
            include: { author: { select: { id: true, username: true } } },
          },
        },
      }),
      prisma.complaint.count({ where }),
    ]);
    return { items, total };
  }
}

export const complaintRepository = new ComplaintRepository();

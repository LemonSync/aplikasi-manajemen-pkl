import { prisma } from '../config/prisma';
import { CreateAnnouncementDTO } from '../validators/announcement.validator';

export class AnnouncementService {
  async create(authorId: string, dto: CreateAnnouncementDTO) {
    return prisma.announcement.create({
      data: {
        author: { connect: { id: authorId } },
        title: dto.title,
        body: dto.body,
        ...(dto.cohortId ? { cohort: { connect: { id: dto.cohortId } } } : {}),
        isPinned: dto.isPinned ?? false,
      },
    });
  }

  async list(params: { page: number; perPage: number; cohortId?: string }) {
    const where: Record<string, unknown> = {};
    if (params.cohortId) where.cohortId = params.cohortId;

    const [items, total] = await Promise.all([
      prisma.announcement.findMany({
        where,
        skip: (params.page - 1) * params.perPage,
        take: params.perPage,
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        include: { author: { select: { id: true, username: true } } },
      }),
      prisma.announcement.count({ where }),
    ]);
    return { items, total };
  }
}

export const announcementService = new AnnouncementService();

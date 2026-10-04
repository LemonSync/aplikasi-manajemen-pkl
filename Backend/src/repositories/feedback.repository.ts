import { Feedback, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

export type FeedbackWithAuthor = Prisma.FeedbackGetPayload<{
  include: { author: true };
}>;

/**
 * Repository feedback DUDI.
 */
export class FeedbackRepository {
  async findById(id: string): Promise<FeedbackWithAuthor | null> {
    return prisma.feedback.findUnique({
      where: { id },
      include: { author: true },
    });
  }

  async create(data: Prisma.FeedbackCreateInput): Promise<Feedback> {
    return prisma.feedback.create({ data });
  }

  async findMany(where: Prisma.FeedbackWhereInput): Promise<FeedbackWithAuthor[]> {
    return prisma.feedback.findMany({
      where,
      include: { author: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async paginate(
    where: Prisma.FeedbackWhereInput,
    skip: number,
    take: number
  ): Promise<{ items: FeedbackWithAuthor[]; total: number }> {
    const [items, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { author: true },
      }),
      prisma.feedback.count({ where }),
    ]);
    return { items, total };
  }
}

export const feedbackRepository = new FeedbackRepository();

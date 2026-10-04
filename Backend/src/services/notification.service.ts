import { prisma } from '../config/prisma';

/**
 * Service notifikasi in-app.
 */
export class NotificationService {
  async create(userId: string, title: string, body: string, type?: string, link?: string) {
    return prisma.notification.create({
      data: { userId, title, body, type: type ?? null, link: link ?? null },
    });
  }

  async listByUser(userId: string, page: number, perPage: number) {
    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        skip: (page - 1) * perPage,
        take: perPage,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where: { userId } }),
    ]);
    return { items, total };
  }

  async markRead(id: string, userId: string) {
    return prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}

export const notificationService = new NotificationService();

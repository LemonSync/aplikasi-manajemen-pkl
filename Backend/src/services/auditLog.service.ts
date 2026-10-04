import { prisma } from '../config/prisma';

/**
 * Service audit log — untuk admin/super-admin melihat log.
 */
export class AuditLogService {
  async list(params: { page: number; perPage: number; action?: string; actorId?: string; entityType?: string }) {
    const where: Record<string, unknown> = {};
    if (params.action) where.action = params.action;
    if (params.actorId) where.actorId = params.actorId;
    if (params.entityType) where.entityType = params.entityType;

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: (params.page - 1) * params.perPage,
        take: params.perPage,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { id: true, username: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  }
}

export const auditLogService = new AuditLogService();

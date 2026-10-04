import { AuditLog, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Repository audit log untuk aksi kritikal.
 */
export class AuditLogRepository {
  async create(data: Prisma.AuditLogCreateInput): Promise<AuditLog> {
    return prisma.auditLog.create({ data });
  }

  async findMany(where: Prisma.AuditLogWhereInput, skip: number, take: number): Promise<AuditLog[]> {
    return prisma.auditLog.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async count(where: Prisma.AuditLogWhereInput): Promise<number> {
    return prisma.auditLog.count({ where });
  }
}

export const auditLogRepository = new AuditLogRepository();

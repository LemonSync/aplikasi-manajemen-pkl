import { Prisma } from '@prisma/client';
import { auditLogRepository } from '../repositories/auditLog.repository';
import { logger } from '../config/logger';

export interface AuditContext {
  actorId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Service untuk mencatat audit log. Non-blocking (tidak menggagalkan request
 * bila pencatatan gagal) agar tidak mengganggu alur utama.
 */
export class AuditService {
  static async record(ctx: AuditContext): Promise<void> {
    try {
      await auditLogRepository.create({
        action: ctx.action,
        entityType: ctx.entityType ?? null,
        entityId: ctx.entityId ?? null,
        metadata: ctx.metadata,
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
        ...(ctx.actorId ? { actor: { connect: { id: ctx.actorId } } } : {}),
      });
    } catch (err) {
      logger.warn('Gagal mencatat audit log', { error: (err as Error).message, action: ctx.action });
    }
  }
}

export const auditService = AuditService;

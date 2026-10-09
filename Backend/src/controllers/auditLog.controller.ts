import { Request, Response } from 'express';
import { auditLogService } from '../services/auditLog.service';
import { sendSuccess, buildPaginationMeta } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePagination } from '../utils/pagination';

export class AuditLogController {
  list = asyncHandler(async (req: Request, res: Response) => {
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const action = req.query.action as string | undefined;
    const actorId = req.query.actorId as string | undefined;
    const entityType = req.query.entityType as string | undefined;
    const search = (req.query.search as string | undefined)?.trim() || undefined;
    const { items, total } = await auditLogService.list({ page, perPage, action, actorId, entityType, search });
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });
}

export const auditLogController = new AuditLogController();

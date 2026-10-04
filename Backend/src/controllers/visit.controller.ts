import { Request, Response } from 'express';
import { visitService } from '../services/visit.service';
import { sendSuccess, buildPaginationMeta } from '../utils/response';
import { getRequestContext } from '../utils/request';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePagination } from '../utils/pagination';
import { CreateVisitDTO, ListVisitQueryDTO } from '../validators/phase3.validator';

/**
 * Controller kunjungan/monitoring guru (Fase 3).
 */
export class VisitController {
  /** POST /api/visits */
  create = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as CreateVisitDTO;
    const ctx = getRequestContext(req);
    const result = await visitService.create(req.user!.sub, dto, ctx);
    return sendSuccess(res, result, 'Jadwal kunjungan dibuat', 201);
  });

  /** GET /api/visits/me */
  myVisits = asyncHandler(async (req: Request, res: Response) => {
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await visitService.myVisits(req.user!.sub, { page, perPage });
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });

  /** GET /api/visits */
  list = asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListVisitQueryDTO;
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await visitService.list(
      {
        page,
        perPage,
        groupId: query.groupId,
        supervisorId: query.supervisorId,
      },
      { id: req.user!.sub, role: req.user!.role }
    );
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });

  /** POST /api/visits/:id/complete */
  complete = asyncHandler(async (req: Request, res: Response) => {
    const { note } = req.body as { note?: string };
    const result = await visitService.markVisited(
      req.user!.sub,
      req.params.id as string,
      note,
      req.user!.role
    );
    return sendSuccess(res, result, 'Kunjungan ditandai selesai');
  });
}

export const visitController = new VisitController();

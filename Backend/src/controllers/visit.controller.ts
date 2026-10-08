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

  /** POST /api/visits/:id/complete — wajib foto bukti (multipart field "photo") */
  complete = asyncHandler(async (req: Request, res: Response) => {
    const file = req.file;
    const result = await visitService.complete(req.user!.sub, req.params.id as string, {
      note: (req.body as { note?: string }).note,
      role: req.user!.role,
      file: file ? { buffer: file.buffer, mimetype: file.mimetype, originalname: file.originalname } : undefined,
    });
    return sendSuccess(res, result, 'Monitoring ditandai selesai dengan bukti foto');
  });

  /** POST /api/visits/:id/postpone */
  postpone = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as { note?: string | null; scheduledAt?: string | null };
    const result = await visitService.postpone(req.user!.sub, req.params.id as string, {
      ...dto,
      role: req.user!.role,
    });
    return sendSuccess(res, result, 'Monitoring ditunda');
  });

  /** POST /api/visits/:id/resume */
  resume = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as { scheduledAt?: string | null };
    const result = await visitService.resume(req.user!.sub, req.params.id as string, {
      ...dto,
      role: req.user!.role,
    });
    return sendSuccess(res, result, 'Monitoring dilanjutkan');
  });

  /** POST /api/visits/:id/cancel */
  cancel = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as { note?: string | null };
    const result = await visitService.cancel(req.user!.sub, req.params.id as string, {
      ...dto,
      role: req.user!.role,
    });
    return sendSuccess(res, result, 'Monitoring dibatalkan');
  });

  /** GET /api/visits/:id/photo — bukti foto monitoring */
  photo = asyncHandler(async (req: Request, res: Response) => {
    const { buffer, filename } = await visitService.getPhoto(
      req.user!.sub,
      req.params.id as string,
      req.user!.role
    );
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `inline; filename="${filename.replace(/[^\w.\-]+/g, '_')}"`);
    return res.send(buffer);
  });
}

export const visitController = new VisitController();

import { Request, Response } from 'express';
import { complaintService } from '../services/complaint.service';
import { sendSuccess, buildPaginationMeta } from '../utils/response';
import { getRequestContext } from '../utils/request';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePagination } from '../utils/pagination';
import {
  CreateComplaintDTO,
  ReplyComplaintDTO,
  ListComplaintQueryDTO,
} from '../validators/phase3.validator';

/**
 * Controller pengaduan (Fase 3).
 */
export class ComplaintController {
  /** POST /api/complaints */
  create = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as CreateComplaintDTO;
    const ctx = getRequestContext(req);
    const result = await complaintService.create(req.user!.sub, dto, ctx);
    return sendSuccess(res, result, 'Pengaduan dikirim', 201);
  });

  /** GET /api/complaints/me */
  myComplaints = asyncHandler(async (req: Request, res: Response) => {
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await complaintService.myComplaints(req.user!.sub, { page, perPage });
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });

  /** GET /api/complaints */
  list = asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListComplaintQueryDTO;
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await complaintService.list(
      {
        page,
        perPage,
        status: query.status,
        groupId: query.groupId,
        authorId: query.authorId,
        cohortId: query.cohortId,
      },
      { id: req.user!.sub, role: req.user!.role }
    );
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });

  /** GET /api/complaints/:id */
  detail = asyncHandler(async (req: Request, res: Response) => {
    const result = await complaintService.assertCanAccess(
      req.user!.sub,
      req.user!.role,
      req.params.id as string
    );
    return sendSuccess(res, result, 'OK');
  });

  /** POST /api/complaints/:id/replies */
  reply = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as ReplyComplaintDTO;
    const ctx = getRequestContext(req);
    const result = await complaintService.reply(
      req.user!.sub,
      req.user!.role,
      req.params.id as string,
      dto.body,
      ctx
    );
    return sendSuccess(res, result, 'Balasan terkirim', 201);
  });

  /** POST /api/complaints/:id/close */
  close = asyncHandler(async (req: Request, res: Response) => {
    const result = await complaintService.close(
      req.user!.sub,
      req.user!.role,
      req.params.id as string
    );
    return sendSuccess(res, result, 'Pengaduan ditutup');
  });
}

export const complaintController = new ComplaintController();

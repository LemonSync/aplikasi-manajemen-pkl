import { Request, Response } from 'express';
import { feedbackService } from '../services/feedback.service';
import { sendSuccess, buildPaginationMeta } from '../utils/response';
import { getRequestContext } from '../utils/request';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePagination } from '../utils/pagination';
import { CreateFeedbackDTO, ListFeedbackQueryDTO } from '../validators/phase4.validator';

/**
 * Controller feedback DUDI (Fase 4).
 */
export class FeedbackController {
  /** POST /api/feedbacks — DUDI: input feedback */
  create = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as CreateFeedbackDTO;
    const ctx = getRequestContext(req);
    const result = await feedbackService.create(req.user!.sub, req.user!.role, dto, ctx);
    return sendSuccess(res, result, 'Feedback berhasil dikirim', 201);
  });

  /** GET /api/feedbacks/student/:studentId — Lihat feedback per siswa */
  listByStudent = asyncHandler(async (req: Request, res: Response) => {
    const result = await feedbackService.listByStudent(req.params.studentId as string, {
      id: req.user!.sub,
      role: req.user!.role,
    });
    return sendSuccess(res, result, 'OK');
  });

  /** GET /api/feedbacks — Admin: daftar semua feedback */
  list = asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListFeedbackQueryDTO;
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await feedbackService.list({
      page,
      perPage,
      studentId: query.studentId,
      groupId: query.groupId,
    });
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });
}

export const feedbackController = new FeedbackController();

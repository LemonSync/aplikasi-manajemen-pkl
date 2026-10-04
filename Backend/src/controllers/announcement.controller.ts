import { Request, Response } from 'express';
import { announcementService } from '../services/announcement.service';
import { sendSuccess, buildPaginationMeta } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePagination } from '../utils/pagination';
import { CreateAnnouncementDTO, ListAnnouncementQueryDTO } from '../validators/announcement.validator';

export class AnnouncementController {
  create = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as CreateAnnouncementDTO;
    const result = await announcementService.create(req.user!.sub, dto);
    return sendSuccess(res, result, 'Pengumuman berhasil dibuat', 201);
  });

  list = asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListAnnouncementQueryDTO;
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await announcementService.list({ page, perPage, cohortId: query.cohortId });
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });
}

export const announcementController = new AnnouncementController();

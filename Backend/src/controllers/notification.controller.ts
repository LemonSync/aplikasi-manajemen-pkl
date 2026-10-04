import { Request, Response } from 'express';
import { notificationService } from '../services/notification.service';
import { sendSuccess, buildPaginationMeta } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePagination } from '../utils/pagination';

export class NotificationController {
  myNotifications = asyncHandler(async (req: Request, res: Response) => {
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await notificationService.listByUser(req.user!.sub, page, perPage);
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });

  markRead = asyncHandler(async (req: Request, res: Response) => {
    await notificationService.markRead(req.params.id as string, req.user!.sub);
    return sendSuccess(res, null, 'Notifikasi ditandai sudah dibaca');
  });

  markAllRead = asyncHandler(async (req: Request, res: Response) => {
    await notificationService.markAllRead(req.user!.sub);
    return sendSuccess(res, null, 'Semua notifikasi ditandai sudah dibaca');
  });
}

export const notificationController = new NotificationController();

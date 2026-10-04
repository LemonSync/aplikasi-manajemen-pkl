import { Request, Response } from 'express';
import { exportService } from '../services/export.service';
import { sendSuccess } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';

export class ExportController {
  grades = asyncHandler(async (req: Request, res: Response) => {
    const groupId = req.query.groupId as string | undefined;
    const data = await exportService.grades(groupId);
    return sendSuccess(res, data, 'OK');
  });

  attendances = asyncHandler(async (req: Request, res: Response) => {
    const { groupId, from, to } = req.query as { groupId?: string; from?: string; to?: string };
    const data = await exportService.attendances({ groupId, from, to });
    return sendSuccess(res, data, 'OK');
  });
}

export const exportController = new ExportController();

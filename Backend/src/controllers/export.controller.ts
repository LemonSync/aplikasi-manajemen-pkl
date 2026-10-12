import { Request, Response } from 'express';
import { exportService } from '../services/export.service';
import { sendSuccess } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';

export class ExportController {
  grades = asyncHandler(async (req: Request, res: Response) => {
    const { studentId, cohortId } = req.query as { studentId?: string; cohortId?: string };
    const data = await exportService.grades({ studentId, cohortId });
    return sendSuccess(res, data, 'OK');
  });

  attendances = asyncHandler(async (req: Request, res: Response) => {
    const { studentId, cohortId, from, to } = req.query as {
      studentId?: string;
      cohortId?: string;
      from?: string;
      to?: string;
    };
    const data = await exportService.attendances({ studentId, cohortId, from, to });
    return sendSuccess(res, data, 'OK');
  });
}

export const exportController = new ExportController();

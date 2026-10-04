import { Request, Response } from 'express';
import { dashboardService } from '../services/dashboard.service';
import { sendSuccess } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';

export class DashboardController {
  stats = asyncHandler(async (req: Request, res: Response) => {
    const result = await dashboardService.getStats(req.user!.sub, req.user!.role);
    return sendSuccess(res, result, 'OK');
  });
}

export const dashboardController = new DashboardController();

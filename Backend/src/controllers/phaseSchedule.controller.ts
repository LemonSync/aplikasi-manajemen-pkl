import { Request, Response } from 'express';
import { phaseScheduleService } from '../services/phaseSchedule.service';
import { sendSuccess } from '../utils/response';
import { getRequestContext } from '../utils/request';
import { asyncHandler } from '../utils/asyncHandler';
import { ReplacePhaseScheduleDTO } from '../validators/phaseSchedule.validator';

/**
 * Controller jadwal fase per gelombang.
 */
export class PhaseScheduleController {
  /** GET /api/cohorts/:cohortId/phase-schedule */
  list = asyncHandler(async (req: Request, res: Response) => {
    const result = await phaseScheduleService.listByCohort(req.params.cohortId as string);
    return sendSuccess(res, result, 'OK');
  });

  /** GET /api/cohorts/:cohortId/phase-schedule/overview */
  overview = asyncHandler(async (req: Request, res: Response) => {
    const result = await phaseScheduleService.getOverview(req.params.cohortId as string);
    return sendSuccess(res, result, 'OK');
  });

  /** PUT /api/cohorts/:cohortId/phase-schedule */
  replace = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as ReplacePhaseScheduleDTO;
    const ctx = getRequestContext(req);
    const result = await phaseScheduleService.replace(
      req.params.cohortId as string,
      dto.items,
      req.user!.sub,
      ctx
    );
    return sendSuccess(res, result, 'Jadwal fase berhasil disimpan');
  });
}

export const phaseScheduleController = new PhaseScheduleController();
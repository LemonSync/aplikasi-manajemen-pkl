import { Request, Response } from 'express';
import { cohortService } from '../services/cohortManage.service';
import { sendSuccess, buildPaginationMeta } from '../utils/response';
import { getRequestContext } from '../utils/request';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePagination } from '../utils/pagination';
import { CreateCohortDTO, UpdateCohortDTO, ListCohortQueryDTO } from '../validators/cohort.validator';

export class CohortManageController {
  create = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as CreateCohortDTO;
    const result = await cohortService.create(dto);
    return sendSuccess(res, result, 'Gelombang berhasil dibuat', 201);
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as UpdateCohortDTO;
    const result = await cohortService.update(
      req.params.id as string,
      dto,
      req.user!.sub,
      getRequestContext(req)
    );
    return sendSuccess(res, result, 'Gelombang berhasil diupdate');
  });

  list = asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListCohortQueryDTO;
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await cohortService.list({ page, perPage, status: query.status });
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const result = await cohortService.getById(req.params.id as string);
    return sendSuccess(res, result, 'OK');
  });
}

export const cohortManageController = new CohortManageController();

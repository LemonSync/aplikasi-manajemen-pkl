import { Request, Response } from 'express';
import { jobVacancyService } from '../services/jobVacancy.service';
import { sendSuccess, buildPaginationMeta } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePagination } from '../utils/pagination';
import { CreateJobVacancyDTO, UpdateJobVacancyDTO, ListJobVacancyQueryDTO } from '../validators/jobVacancy.validator';

export class JobVacancyController {
  create = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as CreateJobVacancyDTO;
    const result = await jobVacancyService.create(req.user!.sub, dto);
    return sendSuccess(res, result, 'Loker berhasil dibuat', 201);
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as UpdateJobVacancyDTO;
    const result = await jobVacancyService.update(req.params.id as string, dto);
    return sendSuccess(res, result, 'Loker berhasil diupdate');
  });

  list = asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListJobVacancyQueryDTO;
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await jobVacancyService.list({ page, perPage, status: query.status, companyId: query.companyId });
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const result = await jobVacancyService.getById(req.params.id as string);
    return sendSuccess(res, result, 'OK');
  });
}

export const jobVacancyController = new JobVacancyController();

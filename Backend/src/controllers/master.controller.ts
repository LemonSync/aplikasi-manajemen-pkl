import { Request, Response } from 'express';
import { masterDataService } from '../services/masterData.service';
import { companyService } from '../services/company.service';
import { sendSuccess, buildPaginationMeta } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePagination } from '../utils/pagination';
import { CreateCompanyDTO, UpdateCompanyDTO, ListCompanyQueryDTO } from '../validators/master.validator';

/**
 * Controller data master (lookup) & perusahaan.
 */
export class MasterDataController {
  /** GET /api/master/lookups — semua lookup (cohort, major, industry). */
  lookups = asyncHandler(async (_req: Request, res: Response) => {
    const result = await masterDataService.getLookups();
    return sendSuccess(res, result, 'OK');
  });

  /** GET /api/master/majors */
  majors = asyncHandler(async (_req: Request, res: Response) => {
    return sendSuccess(res, await masterDataService.listMajors(), 'OK');
  });

  /** GET /api/master/industries */
  industries = asyncHandler(async (_req: Request, res: Response) => {
    return sendSuccess(res, await masterDataService.listIndustries(), 'OK');
  });

  /** GET /api/master/cohorts */
  cohorts = asyncHandler(async (_req: Request, res: Response) => {
    return sendSuccess(res, await masterDataService.listCohorts(), 'OK');
  });

  /** GET /api/master/class-options - opsi kelas resmi sekolah (mis. "DKV 1") */
  classOptions = asyncHandler(async (_req: Request, res: Response) => {
    return sendSuccess(res, await masterDataService.listClassOptions(), 'OK');
  });
}

/**
 * Controller perusahaan (DUDI) — dikelola admin.
 */
export class CompanyController {
  /** GET /api/companies */
  list = asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListCompanyQueryDTO;
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await companyService.list({
      page,
      perPage,
      search: query.search,
      industryId: query.industryId,
    });
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });

  /** GET /api/companies/:id */
  detail = asyncHandler(async (req: Request, res: Response) => {
    return sendSuccess(res, await companyService.getById(req.params.id as string), 'OK');
  });

  /** POST /api/companies (admin) */
  create = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as CreateCompanyDTO;
    return sendSuccess(res, await companyService.create(dto, req.user!.sub), 'Perusahaan ditambahkan', 201);
  });

  /** PATCH /api/companies/:id (admin) */
  update = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as UpdateCompanyDTO;
    return sendSuccess(res, await companyService.update(req.params.id as string, dto), 'Perusahaan diperbarui');
  });
}

export const masterDataController = new MasterDataController();
export const companyController = new CompanyController();

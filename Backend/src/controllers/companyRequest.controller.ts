import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess, buildPaginationMeta } from '../utils/response';
import { parsePagination } from '../utils/pagination';
import { getRequestContext } from '../utils/request';
import { companyRequestService } from '../services/companyRequest.service';
import type {
  CreateCompanyRequestDTO,
  ReviewCompanyRequestDTO,
  ListCompanyRequestQueryDTO,
} from '../validators/companyRequest.validator';

/**
 * Controller usulan tempat PKL (fase 1).
 */
class CompanyRequestController {
  /** POST /api/company-requests — siswa mengirim usulan. */
  create = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as CreateCompanyRequestDTO;
    const ctx = getRequestContext(req);
    const result = await companyRequestService.create(req.user!.sub, dto, ctx);
    return sendSuccess(res, result, 'Usulan tempat PKL terkirim. Admin akan menghubungi perusahaan tersebut.', 201);
  });

  /** GET /api/company-requests/mine — riwayat usulan milik siswa. */
  mine = asyncHandler(async (req: Request, res: Response) => {
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await companyRequestService.listMine(req.user!.sub, page, perPage);
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });

  /** GET /api/company-requests — daftar usulan (admin). */
  list = asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListCompanyRequestQueryDTO;
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await companyRequestService.list({
      ...query,
      page,
      perPage,
      actor: { id: req.user!.sub, role: req.user!.role },
    });
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });

  /** POST /api/company-requests/:id/review — ACC / Tolak (admin). */
  review = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as ReviewCompanyRequestDTO;
    const ctx = getRequestContext(req);
    const result = await companyRequestService.review(
      req.params.id as string,
      req.user!.sub,
      req.user!.role,
      dto.action,
      dto.note ?? null,
      ctx
    );
    return sendSuccess(
      res,
      result,
      dto.action === 'APPROVE'
        ? `Usulan disetujui — "${result.company?.name}" kini tersedia di daftar perusahaan.`
        : 'Usulan ditolak.',
      dto.action === 'APPROVE' ? 201 : 200
    );
  });
}

export const companyRequestController = new CompanyRequestController();

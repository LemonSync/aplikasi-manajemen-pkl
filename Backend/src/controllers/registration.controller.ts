import { Request, Response } from 'express';
import { registrationService } from '../services/registration.service';
import { sendSuccess, buildPaginationMeta } from '../utils/response';
import { getRequestContext } from '../utils/request';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePagination } from '../utils/pagination';
import {
  SaveRegistrationDTO,
  ReviewRegistrationDTO,
  ListRegistrationQueryDTO,
} from '../validators/registration.validator';

/**
 * Controller pendaftaran PKL (Fase 1).
 */
export class RegistrationController {
  /** POST /api/registrations — simpan draft pendaftaran (siswa). */
  saveDraft = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as SaveRegistrationDTO;
    const result = await registrationService.saveDraft(req.user!.sub, dto);
    return sendSuccess(res, result, 'Pendaftaran disimpan', 201);
  });

  /** GET /api/registrations/me — pendaftaran aktif milik siswa. */
  myRegistration = asyncHandler(async (req: Request, res: Response) => {
    const result = await registrationService.getMyRegistration(req.user!.sub);
    return sendSuccess(res, result, 'OK');
  });

  /** POST /api/registrations/change-company — siswa berubah pikiran, kembali Fase 1. */
  changeCompany = asyncHandler(async (req: Request, res: Response) => {
    const ctx = getRequestContext(req);
    const result = await registrationService.cancelAndChangeCompany(req.user!.sub, ctx);
    return sendSuccess(res, result, 'Pendaftaran dibatalkan. Kuota perusahaan lama dilepas — silakan pilih perusahaan baru.');
  });

  /** POST /api/registrations/:id/submit — ajukan & generate surat permohonan. */
  submit = asyncHandler(async (req: Request, res: Response) => {
    const ctx = getRequestContext(req);
    const result = await registrationService.submit(req.user!.sub, req.params.id as string, ctx);
    return sendSuccess(res, result, 'Pendaftaran diajukan & surat permohonan dibuat');
  });

  /** GET /api/registrations/:id — detail (pemilik atau admin). */
  detail = asyncHandler(async (req: Request, res: Response) => {
    const result = await registrationService.getById(req.params.id as string, {
      id: req.user!.sub,
      role: req.user!.role,
    });
    return sendSuccess(res, result, 'OK');
  });

  /** GET /api/registrations — daftar (admin). */
  list = asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListRegistrationQueryDTO;
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await registrationService.list({
      page,
      perPage,
      status: query.status,
      cohortId: query.cohortId,
    });
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });

  /** POST /api/registrations/:id/review — setujui/tolak (admin). */
  review = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as ReviewRegistrationDTO;
    const ctx = getRequestContext(req);
    const result = await registrationService.review(
      req.params.id as string,
      req.user!.sub,
      dto.action,
      dto.note,
      ctx
    );
    return sendSuccess(res, result, dto.action === 'APPROVE' ? 'Pendaftaran disetujui' : 'Pendaftaran ditolak');
  });
}

export const registrationController = new RegistrationController();

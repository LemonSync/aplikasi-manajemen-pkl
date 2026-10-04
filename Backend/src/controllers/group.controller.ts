import { Request, Response } from 'express';
import { groupService } from '../services/group.service';
import { sendSuccess, buildPaginationMeta } from '../utils/response';
import { getRequestContext } from '../utils/request';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePagination } from '../utils/pagination';
import { CreateGroupDTO, UpdateGroupDTO, ListGroupQueryDTO } from '../validators/group.validator';

/**
 * Controller kelompok PKL (Fase 2).
 */
export class GroupController {
  /** POST /api/groups — bentuk kelompok (admin). */
  create = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as CreateGroupDTO;
    const ctx = getRequestContext(req);
    const result = await groupService.create(dto, req.user!.sub, ctx);
    return sendSuccess(res, result, 'Kelompok berhasil dibentuk', 201);
  });

  /** GET /api/groups — daftar kelompok. */
  list = asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListGroupQueryDTO;
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await groupService.list({
      page,
      perPage,
      cohortId: query.cohortId,
      status: query.status,
      companyId: query.companyId,
    });
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });

  /** GET /api/groups/me — kelompok siswa yang login. */
  myGroups = asyncHandler(async (req: Request, res: Response) => {
    const result = await groupService.getMyGroups(req.user!.sub);
    return sendSuccess(res, result, 'OK');
  });

  /** GET /api/groups/supervised — kelompok yang dibimbing guru. */
  supervised = asyncHandler(async (req: Request, res: Response) => {
    const result = await groupService.getSupervisedGroups(req.user!.sub);
    return sendSuccess(res, result, 'OK');
  });

  /** GET /api/groups/:id — detail kelompok. */
  detail = asyncHandler(async (req: Request, res: Response) => {
    const result = await groupService.getById(req.params.id as string, {
      userId: req.user!.sub,
      role: req.user!.role,
    });
    return sendSuccess(res, result, 'OK');
  });

  credentials = asyncHandler(async (req: Request, res: Response) => {
    const result = await groupService.getCredentials(req.params.id as string);
    return sendSuccess(res, result, 'OK');
  });

  setDudiMentors = asyncHandler(async (req: Request, res: Response) => {
    await groupService.setDudiMentors(req.params.id as string, req.body.mentors);
    return sendSuccess(res, null, 'Penugasan DUDI diperbarui');
  });

  /** PUT /api/groups/:id/supervisors — Admin: tetapkan guru pembimbing. */
  setSupervisors = asyncHandler(async (req: Request, res: Response) => {
    const result = await groupService.setSupervisors(
      req.params.id as string,
      req.body.supervisorIds,
      req.user!.sub,
      getRequestContext(req)
    );
    return sendSuccess(res, result, 'Guru pembimbing diperbarui');
  });

  /** PATCH /api/groups/:id — ubah kelompok (admin). */
  update = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as UpdateGroupDTO;
    const result = await groupService.update(req.params.id as string, dto, req.user!.sub);
    return sendSuccess(res, result, 'Kelompok diperbarui');
  });

  /** DELETE /api/groups/:id — hapus kelompok + akun anggota (admin). */
  delete = asyncHandler(async (req: Request, res: Response) => {
    await groupService.delete(req.params.id as string, req.user!.sub);
    return sendSuccess(res, null, 'Kelompok dan akun anggota berhasil dihapus');
  });
}

export const groupController = new GroupController();

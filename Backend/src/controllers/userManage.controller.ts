import { Request, Response } from 'express';
import { userManageService } from '../services/userManage.service';
import { sendSuccess, buildPaginationMeta } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePagination } from '../utils/pagination';
import { CreateUserDTO, UpdateUserDTO, ResetPasswordDTO, ListUserQueryDTO } from '../validators/user.validator';

export class UserManageController {
  create = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as CreateUserDTO;
    const result = await userManageService.create(dto);
    return sendSuccess(res, result, 'User berhasil dibuat', 201);
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as UpdateUserDTO;
    const result = await userManageService.update(req.params.id as string, dto);
    return sendSuccess(res, result, 'User berhasil diupdate');
  });

  list = asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListUserQueryDTO;
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await userManageService.list({
      page, perPage, role: query.role, search: query.search, cohortId: query.cohortId,
    });
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const result = await userManageService.getById(req.params.id as string);
    return sendSuccess(res, result, 'OK');
  });

  getStudentData = asyncHandler(async (req: Request, res: Response) => {
    const result = await userManageService.getStudentData(req.params.id as string);
    return sendSuccess(res, result, 'OK');
  });

  delete = asyncHandler(async (req: Request, res: Response) => {
    const result = await userManageService.delete(req.params.id as string, req.user!.sub);
    return sendSuccess(res, result, 'User berhasil dihapus');
  });

  resetPassword = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as ResetPasswordDTO;
    const result = await userManageService.resetPassword(req.params.id as string, dto);
    return sendSuccess(res, result, 'Password berhasil direset');
  });
}

export const userManageController = new UserManageController();

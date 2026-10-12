import { Request, Response } from 'express';
import { userManageService } from '../services/userManage.service';
import { sendSuccess, buildPaginationMeta } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePagination } from '../utils/pagination';
import { getRequestContext } from '../utils/request';
import {
  CreateUserDTO,
  UpdateUserDTO,
  ResetPasswordDTO,
  ListUserQueryDTO,
  ProvisionStudentsDTO,
} from '../validators/user.validator';

export class UserManageController {
  create = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as CreateUserDTO;
    const result = await userManageService.create(dto);
    return sendSuccess(res, result, 'User berhasil dibuat', 201);
  });

  /** POST /api/users/provision-students — buat akun siswa massal dari Master Siswa (per NISN). */
  provisionStudents = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as ProvisionStudentsDTO;
    const ctx = getRequestContext(req);
    const result = await userManageService.createStudentsFromRegistry(
      dto.cohortId,
      req.user!.sub,
      ctx
    );
    return sendSuccess(
      res,
      result,
      `${result.created.length} akun siswa dibuat, ${result.skipped.length} dilewati`
    );
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

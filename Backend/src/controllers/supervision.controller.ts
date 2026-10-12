import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { supervisionService } from '../services/supervision.service';
import { sendSuccess, buildPaginationMeta } from '../utils/response';
import { getRequestContext } from '../utils/request';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePagination } from '../utils/pagination';
import { AssignSupervisionDTO, ListSupervisionQueryDTO } from '../validators/supervision.validator';

/**
 * Controller pembimbingan per siswa.
 */
export class SupervisionController {
  /** GET /api/supervisions — daftar siswa + pembimbing (guru: miliknya sendiri). */
  list = asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListSupervisionQueryDTO;
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const isGuru = req.user!.role === Role.GURU_PEMBIMBING;
    const { items, total } = await supervisionService.list({
      page,
      perPage,
      search: query.search,
      cohortId: query.cohortId,
      supervisorId: query.supervisorId,
      unassignedOnly: query.unassigned === 'true',
      ...(isGuru ? { supervisorSelf: req.user!.sub } : {}),
    });
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });

  /** POST /api/supervisions/assign — admin: tugaskan guru (batch). */
  assign = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as AssignSupervisionDTO;
    const ctx = getRequestContext(req);
    const result = await supervisionService.assign({
      studentIds: dto.studentIds,
      supervisorId: dto.supervisorId,
      actorId: req.user!.sub,
      ctx,
    });
    return sendSuccess(
      res,
      result,
      `${result.assigned} siswa ditugaskan ke ${result.supervisorName}${
        result.replaced ? ` (${result.replaced} pindah pembimbing)` : ''
      }`
    );
  });

  /** DELETE /api/supervisions/:studentId — admin: lepas pembimbingan. */
  unassign = asyncHandler(async (req: Request, res: Response) => {
    const ctx = getRequestContext(req);
    const result = await supervisionService.unassign(req.params.studentId as string, req.user!.sub, ctx);
    return sendSuccess(res, result, 'Pembimbingan dilepas');
  });

  /** GET /api/supervisions/student/:studentId — pembimbing seorang siswa. */
  forStudent = asyncHandler(async (req: Request, res: Response) => {
    const result = await supervisionService.getForStudent(req.params.studentId as string);
    return sendSuccess(res, result, 'OK');
  });
}

export const supervisionController = new SupervisionController();

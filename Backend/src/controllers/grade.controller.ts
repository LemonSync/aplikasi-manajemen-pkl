import { Request, Response } from 'express';
import { gradeService } from '../services/grade.service';
import { exportService } from '../services/export.service';
import { sendSuccess, buildPaginationMeta } from '../utils/response';
import { getRequestContext } from '../utils/request';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePagination } from '../utils/pagination';
import {
  ApproveGradeDTO,
  CreateGradeDTO,
  ListGradeQueryDTO,
  RecapByClassQueryDTO,
} from '../validators/phase4.validator';

/**
 * Controller penilaian PKL (Fase 4).
 */
export class GradeController {
  /** GET /api/grades/form — definisi butir LEMBARAN PENILAIAN (dipakai form siswa & admin) */
  form = asyncHandler(async (_req: Request, res: Response) => {
    return sendSuccess(res, gradeService.getForm(), 'OK');
  });

  /** POST /api/grades — Siswa (fase Pasca PKL) / Admin: input nilai akhir */
  inputGrade = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as CreateGradeDTO;
    const ctx = getRequestContext(req);
    const result = await gradeService.inputGrade(req.user!.sub, dto, ctx);
    return sendSuccess(res, result, 'Nilai berhasil diinput', 201);
  });

  /** POST /api/grades/:id/approve — Admin: setujui/tolak nilai siswa */
  approve = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as ApproveGradeDTO;
    const ctx = getRequestContext(req);
    const result = await gradeService.approveGrade(req.user!.sub, req.params.id as string, dto, ctx);
    return sendSuccess(res, result, dto.approved ? 'Nilai disetujui' : 'Nilai ditolak');
  });

  /** GET /api/grades/me — Siswa: rekap nilai sendiri */
  myGrades = asyncHandler(async (req: Request, res: Response) => {
    const result = await gradeService.getMyGrades(req.user!.sub);
    return sendSuccess(res, result, 'OK');
  });

  /** GET /api/grades — Admin: daftar nilai */
  list = asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListGradeQueryDTO;
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await gradeService.list(
      {
        page,
        perPage,
        studentId: query.studentId,
      },
      { id: req.user!.sub, role: req.user!.role }
    );
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });

  /** GET /api/grades/recap — Admin: rekap semua nilai */
  recap = asyncHandler(async (req: Request, res: Response) => {
    const result = await gradeService.getRecap({ id: req.user!.sub, role: req.user!.role });
    return sendSuccess(res, result, 'OK');
  });

  /** GET /api/grades/recap-by-class — Admin: rekap per kelas → siswa */
  recapByClass = asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as RecapByClassQueryDTO;
    const result = await gradeService.getRecapByClass(
      { cohortId: query.cohortId },
      { id: req.user!.sub, role: req.user!.role }
    );
    return sendSuccess(res, result, 'OK');
  });

  /** GET /api/grades/recap-by-class/export — unduh rekap .xlsx, satu worksheet per kelas */
  exportRecapByClass = asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as RecapByClassQueryDTO;
    const recap = await gradeService.getRecapByClass(
      { cohortId: query.cohortId },
      { id: req.user!.sub, role: req.user!.role }
    );
    const { buffer, filename } = await exportService.gradeWorkbook(recap, query.cohortId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  });
}

export const gradeController = new GradeController();

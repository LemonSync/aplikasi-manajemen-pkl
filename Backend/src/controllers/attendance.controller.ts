import { Request, Response } from 'express';
import { attendanceService } from '../services/attendance.service';
import { sendSuccess, buildPaginationMeta } from '../utils/response';
import { getRequestContext } from '../utils/request';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePagination } from '../utils/pagination';
import {
  GeoBodyDTO,
  ListAttendanceQueryDTO,
  ListByClassQueryDTO,
  SummaryQueryDTO,
  SubmitAttendanceDTO,
  VerifyAttendanceDTO,
} from '../validators/phase3.validator';

/**
 * Controller absensi harian (Fase 3).
 */
export class AttendanceController {
  /** POST /api/attendances/check-in */
  checkIn = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as GeoBodyDTO;
    const ctx = getRequestContext(req);
    const result = await attendanceService.checkIn(req.user!.sub, dto, ctx);
    return sendSuccess(res, result, 'Absen masuk berhasil', 201);
  });

  /** POST /api/attendances/check-out */
  checkOut = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as GeoBodyDTO;
    const ctx = getRequestContext(req);
    const result = await attendanceService.checkOut(req.user!.sub, dto, ctx);
    return sendSuccess(res, result, 'Absen keluar berhasil');
  });

  /** POST /api/attendances/submit - kirim absensi harian (status + kegiatan + lokasi) */
  submit = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as SubmitAttendanceDTO;
    const ctx = getRequestContext(req);
    const result = await attendanceService.submit(req.user!.sub, dto, ctx);
    return sendSuccess(res, result, 'Absensi berhasil dikirim', 201);
  });

  /** POST /api/attendances/:id/verify - guru pembimbing konfirmasi absensi */
  verify = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as VerifyAttendanceDTO;
    const ctx = getRequestContext(req);
    const result = await attendanceService.verify(
      req.params.id as string,
      { id: req.user!.sub, role: req.user!.role },
      dto.action,
      dto.note,
      ctx
    );
    return sendSuccess(res, result, dto.action === 'APPROVE' ? 'Absensi dikonfirmasi' : 'Absensi ditolak');
  });

  /** GET /api/attendances/today */
  today = asyncHandler(async (req: Request, res: Response) => {
    const result = await attendanceService.today(req.user!.sub);
    return sendSuccess(res, result, 'OK');
  });

  /** GET /api/attendances/me */
  myHistory = asyncHandler(async (req: Request, res: Response) => {
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await attendanceService.myHistory(req.user!.sub, { page, perPage });
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });

  /** GET /api/attendances */
  list = asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListAttendanceQueryDTO;
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await attendanceService.list(
      {
        page,
        perPage,
        userId: query.userId,
        status: query.status,
        from: query.from,
        to: query.to,
      },
      { id: req.user!.sub, role: req.user!.role }
    );
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });

  /** GET /api/attendances/summary */
  summary = asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as SummaryQueryDTO;
    const result = await attendanceService.summary(
      {
        userId: query.userId,
        from: query.from,
        to: query.to,
      },
      { id: req.user!.sub, role: req.user!.role }
    );
    return sendSuccess(res, result, 'OK');
  });

  /** GET /api/attendances/by-class - monitoring per kelas → siswa (admin) */
  listByClass = asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListByClassQueryDTO;
    const result = await attendanceService.listByClass(
      { from: query.from, to: query.to, status: query.status, cohortId: query.cohortId },
      { id: req.user!.sub, role: req.user!.role }
    );
    return sendSuccess(res, result, 'OK');
  });
}

export const attendanceController = new AttendanceController();

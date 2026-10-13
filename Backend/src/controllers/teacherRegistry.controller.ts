import { Request, Response } from 'express';
import { teacherRegistryImportService } from '../services/teacherRegistryImport.service';
import { teacherRegistryService } from '../services/teacherRegistry.service';
import { teacherRegistryRepository } from '../repositories/teacherRegistry.repository';
import { sendSuccess, buildPaginationMeta } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';
import { getRequestContext } from '../utils/request';
import { parsePagination } from '../utils/pagination';
import { BadRequestError } from '../errors/AppError';

/**
 * Controller Master Guru (TeacherRegistry) — akun login dibuat otomatis (username = NIP).
 */
export class TeacherRegistryController {
  /** POST /api/teacher-registry/inspect — baca header file Excel (untuk modal pemetaan kolom) */
  inspectExcel = asyncHandler(async (req: Request, res: Response) => {
    const file = req.file as Express.Multer.File;
    if (!file) throw new BadRequestError('File Excel wajib diunggah');

    const result = teacherRegistryImportService.inspect(file.buffer);
    return sendSuccess(res, result, 'Header terbaca');
  });

  /** POST /api/teacher-registry/import — import Excel + buat akun otomatis */
  importExcel = asyncHandler(async (req: Request, res: Response) => {
    const cohortId = req.body.cohortId as string;
    if (!cohortId) throw new BadRequestError('cohortId wajib diisi');

    const file = req.file as Express.Multer.File;
    if (!file) throw new BadRequestError('File Excel wajib diunggah');

    const mapping = {
      nip: (req.body.mapNip as string | undefined)?.trim() || undefined,
      fullName: (req.body.mapFullName as string | undefined)?.trim() || undefined,
      majorCode: (req.body.mapMajorCode as string | undefined)?.trim() || undefined,
    };

    const ctx = getRequestContext(req);
    const actor = { actorId: req.user!.sub, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent };
    const parsed = teacherRegistryImportService.parseExcel(file.buffer, mapping);
    const result = await teacherRegistryImportService.importData(parsed.rows, cohortId, parsed.errors, actor);

    const akunText = result.accounts.created.length
      ? `, ${result.accounts.created.length} akun dibuat otomatis`
      : '';
    return sendSuccess(
      res,
      result,
      `Import selesai: ${result.created} baru, ${result.updated} diperbarui, ${result.duplicates.length} duplikat dilewati${akunText}, ${result.errors.length} error`
    );
  });

  /** POST /api/teacher-registry — tambah guru manual (akun dibuat otomatis) */
  create = asyncHandler(async (req: Request, res: Response) => {
    const { cohortId, nip, fullName, majorCode } = req.body ?? {};
    if (!cohortId) throw new BadRequestError('cohortId wajib diisi');

    const result = await teacherRegistryService.create({ cohortId, nip, fullName, majorCode });
    const akunText = result.account ? ' — akun dibuat otomatis' : '';
    return sendSuccess(
      res,
      result,
      result.restored
        ? `Data guru ${result.record.fullName} (${result.record.nip}) dipulihkan di Master Guru${akunText}`
        : `Data guru ${result.record.fullName} (${result.record.nip}) ditambahkan ke Master Guru${akunText}`
    );
  });

  /** GET /api/teacher-registry — daftar master guru */
  list = asyncHandler(async (req: Request, res: Response) => {
    const cohortId = req.query.cohortId as string;
    if (!cohortId) throw new BadRequestError('cohortId wajib');
    const search = (req.query.search as string | undefined)?.trim() || undefined;

    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await teacherRegistryRepository.findByCohort(
      cohortId,
      (page - 1) * perPage,
      perPage,
      search
    );

    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });

  /** DELETE /api/teacher-registry/:id — hapus data guru + akun (permanen). */
  remove = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const result = await teacherRegistryService.remove(id);

    let message = `Data ${result.fullName} (${result.nip}) dihapus dari Master Guru`;
    if (result.accounts > 0) {
      message +=
        `; permanen: ${result.accounts} akun, ${result.supervisions} penugasan bimbingan,` +
        ` ${result.visits} kunjungan`;
    }
    return sendSuccess(res, result, message);
  });

  /** GET /api/teacher-registry/lookup/:nip — cari NIP */
  lookup = asyncHandler(async (req: Request, res: Response) => {
    const nip = req.params.nip as string;
    const cohortId = req.query.cohortId as string;
    if (!cohortId) throw new BadRequestError('cohortId wajib');

    const teacher = await teacherRegistryRepository.findByNip(nip, cohortId);
    if (!teacher) {
      return sendSuccess(res, null, 'NIP tidak ditemukan');
    }
    return sendSuccess(res, teacher, 'OK');
  });
}

export const teacherRegistryController = new TeacherRegistryController();

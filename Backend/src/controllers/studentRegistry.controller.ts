import { Request, Response } from 'express';
import { studentRegistryImportService } from '../services/studentRegistryImport.service';
import { studentRegistryService } from '../services/studentRegistry.service';
import { studentRegistryRepository } from '../repositories/studentRegistry.repository';
import { sendSuccess, buildPaginationMeta } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePagination } from '../utils/pagination';
import { BadRequestError } from '../errors/AppError';

/**
 * Controller Master Siswa (StudentRegistry).
 */
export class StudentRegistryController {
  /** POST /api/student-registry/inspect — baca header file Excel (untuk modal pemetaan kolom) */
  inspectExcel = asyncHandler(async (req: Request, res: Response) => {
    const file = req.file as Express.Multer.File;
    if (!file) throw new BadRequestError('File Excel wajib diunggah');

    const result = studentRegistryImportService.inspect(file.buffer);
    return sendSuccess(res, result, 'Header terbaca');
  });

  /** POST /api/student-registry/import — import Excel (dengan pemetaan header kolom + deteksi duplikat) */
  importExcel = asyncHandler(async (req: Request, res: Response) => {
    const cohortId = req.body.cohortId as string;
    if (!cohortId) throw new BadRequestError('cohortId wajib diisi');

    const file = req.file as Express.Multer.File;
    if (!file) throw new BadRequestError('File Excel wajib diunggah');

    const mapping = {
      nisn: (req.body.mapNisn as string | undefined)?.trim() || undefined,
      fullName: (req.body.mapFullName as string | undefined)?.trim() || undefined,
      className: (req.body.mapClassName as string | undefined)?.trim() || undefined,
      majorCode: (req.body.mapMajorCode as string | undefined)?.trim() || undefined,
    };

    const parsed = studentRegistryImportService.parseExcel(file.buffer, mapping);
    const result = await studentRegistryImportService.importData(parsed.rows, cohortId, parsed.errors);

    return sendSuccess(
      res,
      result,
      `Import selesai: ${result.created} baru, ${result.updated} diperbarui, ${result.duplicates.length} duplikat dilewati, ${result.errors.length} error`
    );
  });

  /** POST /api/student-registry — tambah siswa manual */
  create = asyncHandler(async (req: Request, res: Response) => {
    const { cohortId, nisn, fullName, className, majorCode } = req.body ?? {};
    if (!cohortId) throw new BadRequestError('cohortId wajib diisi');

    const result = await studentRegistryService.create({ cohortId, nisn, fullName, className, majorCode });
    return sendSuccess(
      res,
      result.record,
      result.restored
        ? `Data siswa ${result.record.fullName} (${result.record.nisn}) dipulihkan di Master Siswa`
        : `Data siswa ${result.record.fullName} (${result.record.nisn}) ditambahkan ke Master Siswa`
    );
  });

  /** GET /api/student-registry — daftar master siswa */
  list = asyncHandler(async (req: Request, res: Response) => {
    const cohortId = req.query.cohortId as string;
    if (!cohortId) throw new BadRequestError('cohortId wajib');

    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await studentRegistryRepository.findByCohort(cohortId, (page - 1) * perPage, perPage);

    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });

  /** DELETE /api/student-registry/:id — hapus data siswa + semua data terkait (permanen). */
  remove = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const result = await studentRegistryService.remove(id);

    let message = `Data ${result.fullName} (${result.nisn}) dihapus dari Master Siswa`;
    if (result.accounts > 0) {
      message +=
        `; permanen: ${result.accounts} akun, ${result.attendance} absensi,` +
        ` ${result.journals} jurnal, ${result.grades} nilai, ${result.documents} dokumen,` +
        ` ${result.groupMemberships} keanggotaan kelompok, ${result.memberRows} baris pendaftaran` +
        (result.registrations > 0 ? `, ${result.registrations} pendaftaran yang diajukan` : '');
    }
    return sendSuccess(res, result, message);
  });

  /** GET /api/student-registry/lookup/:nisn — cari NISN */
  lookup = asyncHandler(async (req: Request, res: Response) => {
    const nisn = req.params.nisn as string;
    const cohortId = req.query.cohortId as string;
    if (!cohortId) throw new BadRequestError('cohortId wajib');

    const student = await studentRegistryRepository.findByNisn(nisn, cohortId);
    if (!student) {
      return sendSuccess(res, null, 'NISN tidak ditemukan');
    }
    return sendSuccess(res, student, 'OK');
  });
}

export const studentRegistryController = new StudentRegistryController();

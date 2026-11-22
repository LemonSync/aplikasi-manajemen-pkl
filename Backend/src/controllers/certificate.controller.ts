import { Request, Response } from 'express';
import { certificateService } from '../services/certificate.service';
import { sendSuccess, buildPaginationMeta } from '../utils/response';
import { getRequestContext } from '../utils/request';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePagination } from '../utils/pagination';
import { BadRequestError } from '../errors/AppError';
import { SetCertificateNumberDTO, SetCertificateSignatoryDTO } from '../validators/phase4.validator';

/**
 * Controller sertifikat PKL (Fase 4).
 * Jalur /saya/* khusus siswa fase Pasca PKL; jalur lain untuk staf.
 */
export class CertificateController {
  /** GET /api/sertifikat/saya — checklist kesiapan (nilai, logo, nomor). */
  status = asyncHandler(async (req: Request, res: Response) => {
    const result = await certificateService.getStatus({ id: req.user!.sub, role: req.user!.role });
    return sendSuccess(res, result, 'OK');
  });

  /** POST /api/sertifikat/saya/logo — logo perusahaan (wajib sebelum generate). */
  uploadLogo = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new BadRequestError('File logo belum diunggah');
    const result = await certificateService.uploadLogo(
      { id: req.user!.sub, role: req.user!.role },
      { buffer: req.file.buffer, mimetype: req.file.mimetype, originalname: req.file.originalname },
      getRequestContext(req)
    );
    return sendSuccess(res, result, 'Logo perusahaan berhasil disimpan');
  });

  /** PUT /api/sertifikat/saya/penandatangan — nama Kepala Bagian Teknik & Pengelolaan. */
  setSignatory = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as SetCertificateSignatoryDTO;
    const result = await certificateService.setPenandatangan(
      { id: req.user!.sub, role: req.user!.role },
      dto.kepalaBagianName,
      getRequestContext(req)
    );
    return sendSuccess(res, result, 'Nama penandatangan disimpan');
  });

  /** GET /api/sertifikat/saya/pdf — terbitkan dan unduh sertifikat 2 halaman. */
  downloadMine = asyncHandler(async (req: Request, res: Response) => {
    const { buffer, filename } = await certificateService.getOrCreatePdf(
      { id: req.user!.sub, role: req.user!.role },
      undefined,
      getRequestContext(req)
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  });

  /** GET /api/sertifikat — daftar sertifikat (staf). */
  list = asyncHandler(async (req: Request, res: Response) => {
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const cohortId = req.query.cohortId as string | undefined;

    const { items, total } = await certificateService.list(
      { id: req.user!.sub, role: req.user!.role },
      { page, perPage, cohortId }
    );
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });

  /** GET /api/sertifikat/siswa/:studentId/pdf — staf: unduh sertifikat siswa. */
  downloadForStudent = asyncHandler(async (req: Request, res: Response) => {
    const { buffer, filename } = await certificateService.getOrCreatePdf(
      { id: req.user!.sub, role: req.user!.role },
      req.params.studentId as string,
      getRequestContext(req)
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  });

  /** PATCH /api/sertifikat/:id/nomor — admin: input nomor manual. */
  setNumber = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as SetCertificateNumberDTO;
    const result = await certificateService.setManualNumber(
      req.user!.sub,
      req.params.id as string,
      dto.number,
      getRequestContext(req)
    );
    return sendSuccess(res, result, 'Nomor sertifikat diperbarui');
  });
}

export const certificateController = new CertificateController();

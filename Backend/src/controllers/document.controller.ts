import { Request, Response } from 'express';
import { documentService } from '../services/document.service';
import { sendSuccess, buildPaginationMeta } from '../utils/response';
import { getRequestContext } from '../utils/request';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePagination } from '../utils/pagination';
import { readStoredFile } from '../utils/storage';
import { ForbiddenError, NotFoundError } from '../errors/AppError';
import { MESSAGES } from '../config/constants';
import {
  UploadDocumentDTO,
  VerifyDocumentDTO,
  ListDocumentQueryDTO,
} from '../validators/registration.validator';
import { DocumentType, Role } from '@prisma/client';

/**
 * Controller dokumen (upload, unduh, verifikasi).
 */
export class DocumentController {
  /** POST /api/documents — upload dokumen (multipart). */
  upload = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as UploadDocumentDTO;
    const ctx = getRequestContext(req);
    const result = await documentService.uploadDocument({
      ownerId: req.user!.sub,
      cohortId: dto.cohortId ?? req.user!.cohortId ?? null,
      type: dto.type,
      title: dto.title,
      file: req.file as Express.Multer.File,
      ctx,
    });
    return sendSuccess(res, result, 'Dokumen berhasil diunggah', 201);
  });

  /** GET /api/documents/me — dokumen milik user. */
  myDocuments = asyncHandler(async (req: Request, res: Response) => {
    const result = await documentService.listByOwner(req.user!.sub);
    return sendSuccess(res, result, 'OK');
  });

  /** GET /api/documents — daftar dokumen (admin/guru). */
  list = asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListDocumentQueryDTO;
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    // Guru pembimbing hanya boleh melihat laporan akhir
    const type =
      req.user!.role === Role.GURU_PEMBIMBING ? DocumentType.LAPORAN_AKHIR : query.type;
    const { items, total } = await documentService.list(
      {
        page,
        perPage,
        status: query.status,
        type,
        cohortId: query.cohortId,
      },
      { id: req.user!.sub, role: req.user!.role }
    );
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });

  /** GET /api/documents/:id — detail dokumen (scope dicek di service) + kelompok pemilik. */
  detail = asyncHandler(async (req: Request, res: Response) => {
    const doc = await documentService.assertCanAccess(req.params.id as string, {
      id: req.user!.sub,
      role: req.user!.role,
    });
    const group = await documentService.getOwnerGroup(doc.ownerId ?? null);
    return sendSuccess(res, { ...doc, group }, 'OK');
  });

  /** GET /api/documents/:id/download — unduh file aktif (stream terkontrol). */
  download = asyncHandler(async (req: Request, res: Response) => {
    const doc = await documentService.assertCanAccess(req.params.id as string, {
      id: req.user!.sub,
      role: req.user!.role,
    });
    const activeFile = doc.files.find((f) => f.isActive) ?? doc.files[0];
    if (!activeFile) throw new NotFoundError(MESSAGES.DOCUMENT.NOT_UPLOADED);

    const buffer = readStoredFile(activeFile.storedPath);
    if (!buffer) throw new NotFoundError(MESSAGES.DOCUMENT.NOT_UPLOADED);

    // Surat Permohonan yang diunduh ketua membuka gerbang Fase 1 → Fase 2
    if (doc.type === DocumentType.SURAT_PERMOHONAN && doc.registrationId) {
      await documentService.markPermohonanDownloaded(doc.registrationId, req.user!.sub);
    }

    res.setHeader('Content-Type', activeFile.mimeType ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${activeFile.originalName}"`);
    return res.send(buffer);
  });

  /** POST /api/documents/:id/verify — verifikasi (admin/guru). */
  verify = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as VerifyDocumentDTO;
    const ctx = getRequestContext(req);
    // Guru pembimbing hanya boleh memverifikasi laporan akhir milik kelompok bimbingannya
    if (req.user!.role === Role.GURU_PEMBIMBING) {
      const doc = await documentService.assertCanAccess(req.params.id as string, {
        id: req.user!.sub,
        role: req.user!.role,
      });
      if (doc.type !== DocumentType.LAPORAN_AKHIR) throw new ForbiddenError(MESSAGES.SCOPE);
    }
    const result = await documentService.verify(req.params.id as string, req.user!.sub, dto.action, dto.note, ctx);
    return sendSuccess(res, result, dto.action === 'APPROVE' ? 'Dokumen disetujui' : 'Dokumen ditolak');
  });

  /** GET /api/documents/type/:type/download — unduh file aktif by tipe (milik sendiri). */
  downloadByType = asyncHandler(async (req: Request, res: Response) => {
    const type = req.params.type as DocumentType;
    const file = await documentService.getActiveFileByType(req.user!.sub, type);
    const buffer = readStoredFile(file.storedPath);
    if (!buffer) throw new NotFoundError(MESSAGES.DOCUMENT.NOT_UPLOADED);
    res.setHeader('Content-Type', file.mimeType ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
    return res.send(buffer);
  });
}

export const documentController = new DocumentController();

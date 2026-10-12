import { Request, Response } from 'express';
import { letterGeneratorService } from '../services/letterGenerator.service';
import { auditService } from '../services/audit.service';
import { sendSuccess } from '../utils/response';
import { getRequestContext } from '../utils/request';
import { asyncHandler } from '../utils/asyncHandler';
import { AUDIT_ACTIONS, ENTITY_TYPES } from '../config/constants';
import { GeneratePermohonanDTO, GeneratePenugasanDTO } from '../validators/letterGenerator.validator';

/**
 * Controller generator surat manual admin — surat permohonan (per perusahaan)
 * dan surat penugasan pembimbing. Hasil tersimpan di daftar Surat Terbit.
 */
export class LetterGeneratorController {
  /** POST /api/letters/permohonan — surat permohonan semua siswa satu perusahaan. */
  generatePermohonan = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as GeneratePermohonanDTO;
    const ctx = getRequestContext(req);
    const actor = req.user!;

    const result = await letterGeneratorService.generatePermohonan({
      cohortId: dto.cohortId,
      companyId: dto.companyId,
      number: dto.number ?? null,
      actorId: actor.sub,
    });

    await auditService.record({
      actorId: actor.sub,
      action: AUDIT_ACTIONS.GENERATE_LETTER,
      entityType: ENTITY_TYPES.DOCUMENT,
      entityId: result.letterId,
      metadata: { type: 'SURAT_PERMOHONAN', companyId: dto.companyId, studentCount: result.studentCount },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return sendSuccess(res, result, `Surat permohonan terbit untuk ${result.studentCount} siswa`, 201);
  });

  /** POST /api/letters/penugasan — surat penugasan pembimbing (tujuan = PKL siswanya). */
  generatePenugasan = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as GeneratePenugasanDTO;
    const ctx = getRequestContext(req);
    const actor = req.user!;

    const result = await letterGeneratorService.generatePenugasan({
      supervisorId: dto.supervisorId,
      number: dto.number ?? null,
      dasar: dto.dasar ?? null,
      actorId: actor.sub,
    });

    await auditService.record({
      actorId: actor.sub,
      action: AUDIT_ACTIONS.GENERATE_LETTER,
      entityType: ENTITY_TYPES.DOCUMENT,
      entityId: result.letterId,
      metadata: { type: 'SURAT_PENUGASAN', supervisorId: dto.supervisorId, tujuanCount: result.tujuanCount },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return sendSuccess(res, result, `Surat penugasan terbit untuk ${result.tujuanCount} tujuan`, 201);
  });
}

export const letterGeneratorController = new LetterGeneratorController();

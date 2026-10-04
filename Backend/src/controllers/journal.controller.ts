import { Request, Response } from 'express';
import { journalService } from '../services/journal.service';
import { sendSuccess, buildPaginationMeta } from '../utils/response';
import { getRequestContext } from '../utils/request';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePagination } from '../utils/pagination';
import { SaveJournalDTO, UpdateJournalDTO, ListJournalQueryDTO } from '../validators/phase3.validator';

/**
 * Controller jurnal kegiatan (Fase 3).
 */
export class JournalController {
  /** POST /api/journals */
  create = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as SaveJournalDTO;
    const ctx = getRequestContext(req);
    const result = await journalService.create(req.user!.sub, dto, ctx);
    return sendSuccess(res, result, 'Jurnal disimpan', 201);
  });

  /** GET /api/journals/me */
  myJournals = asyncHandler(async (req: Request, res: Response) => {
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await journalService.myJournals(req.user!.sub, { page, perPage });
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });

  /** GET /api/journals */
  list = asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListJournalQueryDTO;
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await journalService.list(
      {
        page,
        perPage,
        groupId: query.groupId,
        userId: query.userId,
      },
      { id: req.user!.sub, role: req.user!.role }
    );
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });

  /** PATCH /api/journals/:id */
  update = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as UpdateJournalDTO;
    const result = await journalService.update(req.user!.sub, req.params.id as string, dto);
    return sendSuccess(res, result, 'Jurnal diperbarui');
  });

  /** POST /api/journals/:id/supervisor-note */
  supervisorNote = asyncHandler(async (req: Request, res: Response) => {
    const { note } = req.body as { note: string };
    const result = await journalService.addSupervisorNote(req.user!.sub, req.params.id as string, note);
    return sendSuccess(res, result, 'Catatan pembimbing disimpan');
  });

  dudiList = asyncHandler(async (req: Request, res: Response) => {
    const { page, perPage } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await journalService.listForDudi(req.user!.sub, {
      page, perPage, groupId: req.query.groupId as string | undefined,
    });
    return sendSuccess(res, items, 'OK', 200, buildPaginationMeta(page, perPage, total));
  });

  dudiVerify = asyncHandler(async (req: Request, res: Response) => {
    const { note } = req.body as { note?: string };
    const result = await journalService.verifyByDudi(req.user!.sub, req.params.id as string, note);
    return sendSuccess(res, result, 'Jurnal dikonfirmasi DUDI');
  });
}

export const journalController = new JournalController();

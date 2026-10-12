import { Request, Response } from 'express';
import { journalService, JournalActor } from '../services/journal.service';
import { sendSuccess, buildPaginationMeta } from '../utils/response';
import { getRequestContext } from '../utils/request';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePagination } from '../utils/pagination';
import { SaveJournalDTO, UpdateJournalDTO, ListJournalQueryDTO } from '../validators/phase3.validator';

const toActor = (req: Request): JournalActor => ({ id: req.user!.sub, role: req.user!.role });

/**
 * Controller jurnal kegiatan (Fase 3) — per siswa, tanpa kelompok PKL.
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
        userId: query.userId,
      },
      toActor(req)
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
    const result = await journalService.addSupervisorNote(toActor(req), req.params.id as string, note);
    return sendSuccess(res, result, 'Catatan pembimbing disimpan');
  });

  /** POST /api/journals/:id/verify */
  verify = asyncHandler(async (req: Request, res: Response) => {
    const { note } = req.body as { note?: string };
    const result = await journalService.verify(toActor(req), req.params.id as string, note);
    return sendSuccess(res, result, 'Jurnal dikonfirmasi');
  });
}

export const journalController = new JournalController();

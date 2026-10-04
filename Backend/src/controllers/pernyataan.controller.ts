import { Request, Response } from 'express';
import { pernyataanService } from '../services/pernyataan.service';
import { sendSuccess } from '../utils/response';
import { getRequestContext } from '../utils/request';
import { asyncHandler } from '../utils/asyncHandler';
import { GeneratePernyataanDTO } from '../validators/pernyataan.validator';

/**
 * Controller Surat Pernyataan Peserta PKL (Fase 2).
 */
export class PernyataanController {
  /** GET /api/pernyataan/prefill — data pre-fill form siswa. */
  prefill = asyncHandler(async (req: Request, res: Response) => {
    const result = await pernyataanService.getPrefill(req.user!.sub);
    return sendSuccess(res, result, 'OK');
  });

  /** POST /api/pernyataan/generate — generate DOCX Surat Pernyataan. */
  generate = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as GeneratePernyataanDTO;
    const ctx = getRequestContext(req);
    const result = await pernyataanService.generate(req.user!.sub, dto, ctx);
    return sendSuccess(res, result, 'Surat Pernyataan berhasil dibuat', 201);
  });
}

export const pernyataanController = new PernyataanController();
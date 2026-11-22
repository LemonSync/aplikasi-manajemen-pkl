import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { inboxService } from '../services/inbox.service';
import { sendSuccess } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';
import { ForbiddenError } from '../errors/AppError';
import { ListInboxQueryDTO } from '../validators/inbox.validator';

/**
 * Controller inbox verifikasi admin — hanya membaca antrean keputusan.
 * Setujui/tolak dilakukan lewat endpoint masing-masing sumber.
 */
export class InboxController {
  /** GET /api/admin/inbox — daftar gabungan menunggu keputusan. */
  list = asyncHandler(async (req: Request, res: Response) => {
    if (req.user!.role !== Role.ADMIN && req.user!.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenError('Inbox verifikasi khusus admin');
    }
    const query = req.query as unknown as ListInboxQueryDTO;
    const result = await inboxService.list(
      { id: req.user!.sub, role: req.user!.role },
      { cohortId: query.cohortId, order: query.order }
    );
    return sendSuccess(res, result, 'OK');
  });
}

export const inboxController = new InboxController();

import { Request, Response } from 'express';
import { studentWorkflowService } from '../services/studentWorkflow.service';
import { sendSuccess } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';

/**
 * Controller status workflow siswa.
 * Menentukan fase efektif berdasarkan jadwal fase (bukan User.phase).
 */
export class StudentWorkflowController {
  /** GET /api/student/workflow */
  getWorkflowStatus = asyncHandler(async (req: Request, res: Response) => {
    const result = await studentWorkflowService.getWorkflowStatus(req.user!.sub);
    return sendSuccess(res, result, 'OK');
  });
}

export const studentWorkflowController = new StudentWorkflowController();

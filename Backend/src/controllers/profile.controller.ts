import { Request, Response } from 'express';
import { profileService } from '../services/profile.service';
import { sendSuccess } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';
import { ParentDataDTO } from '../validators/profile.validator';

/**
 * Controller profil siswa (parent data).
 */
export class ProfileController {
  /** GET /api/profile/parent */
  getParentData = asyncHandler(async (req: Request, res: Response) => {
    const result = await profileService.getParentData(req.user!.sub);
    return sendSuccess(res, result, 'OK');
  });

  /** PUT /api/profile/parent */
  upsertParentData = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as ParentDataDTO;
    const result = await profileService.upsertParentData(req.user!.sub, dto);
    return sendSuccess(res, result, 'Data orang tua berhasil disimpan');
  });
}

export const profileController = new ProfileController();

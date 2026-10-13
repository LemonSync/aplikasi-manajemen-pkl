import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { configService } from '../services/config.service';

export class ConfigController {
  signatory = asyncHandler(async (_req: Request, res: Response) => sendSuccess(res, await configService.getSignatory(), 'OK'));
  saveSignature = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await configService.saveSignature(req.body.signature), 'Tanda tangan disimpan'));
  saveSignatory = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await configService.saveSignatory(req.body), 'Identitas penandatangan disimpan'));
  majors = asyncHandler(async (_req: Request, res: Response) => sendSuccess(res, await configService.listMajors(), 'OK'));
  createMajor = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await configService.createMajor(req.body), 'Jurusan ditambahkan', 201));
  updateMajor = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await configService.updateMajor(req.params.id as string, req.body), 'Jurusan diperbarui'));
  deleteMajor = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await configService.deleteMajor(req.params.id as string), 'Jurusan dihapus'));
  industries = asyncHandler(async (_req: Request, res: Response) => sendSuccess(res, await configService.listIndustries(), 'OK'));
  createIndustry = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await configService.createIndustry(req.body), 'Bidang industri ditambahkan', 201));
  updateIndustry = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await configService.updateIndustry(req.params.id as string, req.body), 'Bidang industri diperbarui'));
  deleteIndustry = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await configService.deleteIndustry(req.params.id as string), 'Bidang industri dihapus'));
}

export const configController = new ConfigController();

import { NextFunction, Request, Response } from 'express';
import { CohortStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ForbiddenError } from '../errors/AppError';
import { MESSAGES } from '../config/constants';

/**
 * Middleware Cohort Guard: memastikan gelombang (cohort) terkait
 * masih berstatus OPEN untuk aksi tulis. Mencegah perubahan data
 * pada gelombang yang sudah CLOSED/ARCHIVED.
 *
 * Sumber cohortId (berurutan): req.body.cohortId, req.params.cohortId, req.query.cohortId.
 * Bila tidak ada cohortId, guard dilewati (validasi granular ditangani service).
 */
export const requireCohortActive = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const cohortId =
      (req.body?.cohortId as string) ||
      (req.params?.cohortId as string) ||
      (req.query?.cohortId as string);

    if (!cohortId) return next();

    const cohort = await prisma.cohort.findUnique({
      where: { id: cohortId },
      select: { status: true },
    });

    if (!cohort) return next();
    if (cohort.status === CohortStatus.CLOSED || cohort.status === CohortStatus.ARCHIVED) {
      return next(new ForbiddenError(MESSAGES.COHORT_LOCKED));
    }
    return next();
  } catch (err) {
    return next(err);
  }
};

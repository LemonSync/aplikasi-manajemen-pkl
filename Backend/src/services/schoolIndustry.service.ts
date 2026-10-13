import { prisma } from '../config/prisma';
import { SCHOOL_INDUSTRIES } from '../config/school-industries';

/** Pastikan opsi bidang industri tersedia setelah reset/deploy database baru. */
export const ensureSchoolIndustries = async (): Promise<void> => {
  if (await prisma.industry.count() > 0) return;
  await prisma.$transaction(
    SCHOOL_INDUSTRIES.map((name) =>
      prisma.industry.upsert({
        where: { name },
        update: {},
        create: { name },
      })
    )
  );
};

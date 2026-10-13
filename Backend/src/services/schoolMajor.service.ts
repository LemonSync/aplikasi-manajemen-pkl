import { prisma } from '../config/prisma';
import { SCHOOL_MAJORS } from '../config/school-majors';

/** Pastikan katalog jurusan sekolah tersedia setelah database reset/deploy baru. */
export const ensureSchoolMajors = async (): Promise<void> => {
  if (await prisma.major.count() > 0) return;
  await prisma.$transaction(
    SCHOOL_MAJORS.map((major) =>
      prisma.major.upsert({
        where: { code: major.code },
        update: { name: major.name },
        create: major,
      })
    )
  );
};

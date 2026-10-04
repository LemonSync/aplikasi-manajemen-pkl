import { prisma } from '../config/prisma';
import { NotFoundError } from '../errors/AppError';
import { MESSAGES } from '../config/constants';
import { ParentDataDTO } from '../validators/profile.validator';

/**
 * Service profil siswa (termasuk data orang tua).
 */
export class ProfileService {
  /** Ambil profil siswa + parent data. */
  async getStudentProfile(userId: string) {
    const profile = await prisma.studentProfile.findUnique({
      where: { userId },
      include: { parentData: true, class: true, major: true },
    });
    if (!profile) throw new NotFoundError(MESSAGES.NOT_FOUND);
    return profile;
  }

  /** Update/simpan data orang tua. */
  async upsertParentData(userId: string, dto: ParentDataDTO) {
    const profile = await prisma.studentProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundError('Profil siswa tidak ditemukan');

    const existing = await prisma.parentData.findUnique({
      where: { studentProfileId: profile.id },
    });

    if (existing) {
      return prisma.parentData.update({
        where: { studentProfileId: profile.id },
        data: dto,
      });
    }

    return prisma.parentData.create({
      data: {
        studentProfileId: profile.id,
        ...dto,
      },
    });
  }

  /** Ambil data orang tua. */
  async getParentData(userId: string) {
    const profile = await prisma.studentProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundError('Profil siswa tidak ditemukan');

    return prisma.parentData.findUnique({
      where: { studentProfileId: profile.id },
    });
  }
}

export const profileService = new ProfileService();

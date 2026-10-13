import { prisma } from '../config/prisma';
import { ConflictError, NotFoundError } from '../errors/AppError';
import { saveBuffer } from '../utils/storage';
import { CreateIndustryConfigDTO, CreateMajorConfigDTO, SignatoryConfigDTO, UpdateIndustryConfigDTO, UpdateMajorConfigDTO } from '../validators/config.validator';

export class ConfigService {
  async getSignatory() {
    const signatory = await prisma.letterSignatory.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } });
    return signatory ? { ...signatory, hasSignature: Boolean(signatory.signaturePath) } : null;
  }

  async saveSignature(dataUrl: string) {
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) throw new ConflictError('Tanda tangan harus berupa PNG transparan yang valid');
    const buffer = Buffer.from(match[1], 'base64');
    if (buffer.length === 0 || buffer.length > 512 * 1024) throw new ConflictError('Ukuran tanda tangan tidak valid');
    let signatory = await prisma.letterSignatory.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } });
    if (!signatory) signatory = await prisma.letterSignatory.create({ data: { name: 'Kepala Sekolah', position: 'Kepala Sekolah', isActive: true } });
    const { relativePath } = saveBuffer('signatures', 'kepala-sekolah.png', buffer);
    return prisma.letterSignatory.update({ where: { id: signatory.id }, data: { signaturePath: relativePath } });
  }

  async saveSignatory(dto: SignatoryConfigDTO) {
    let signatory = await prisma.letterSignatory.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } });
    if (!signatory) {
      signatory = await prisma.letterSignatory.create({
        data: { name: dto.name, nip: dto.nip || null, position: dto.position, isActive: true },
      });
    } else {
      signatory = await prisma.letterSignatory.update({
        where: { id: signatory.id },
        data: { name: dto.name, nip: dto.nip || null, position: dto.position },
      });
    }
    return { ...signatory, hasSignature: Boolean(signatory.signaturePath) };
  }
  async listMajors() {
    return prisma.major.findMany({ orderBy: { code: 'asc' } });
  }

  async createMajor(dto: CreateMajorConfigDTO) {
    return prisma.major.create({ data: { code: dto.code.toUpperCase(), name: dto.name } });
  }

  async updateMajor(id: string, dto: UpdateMajorConfigDTO) {
    const existing = await prisma.major.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Jurusan tidak ditemukan');
    return prisma.major.update({
      where: { id },
      data: { ...(dto.code ? { code: dto.code.toUpperCase() } : {}), ...(dto.name ? { name: dto.name } : {}) },
    });
  }

  async deleteMajor(id: string) {
    const existing = await prisma.major.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Jurusan tidak ditemukan');
    const [classes, profiles, registrations, registries] = await Promise.all([
      prisma.class.count({ where: { majorId: id } }),
      prisma.studentProfile.count({ where: { majorId: id } }),
      prisma.registration.count({ where: { majorId: id } }),
      prisma.studentRegistry.count({ where: { majorId: id } }),
    ]);
    if (classes + profiles + registrations + registries > 0) {
      throw new ConflictError('Jurusan masih dipakai data siswa/kelas dan tidak dapat dihapus');
    }
    return prisma.major.delete({ where: { id } });
  }

  async listIndustries() {
    return prisma.industry.findMany({ orderBy: { name: 'asc' } });
  }

  async createIndustry(dto: CreateIndustryConfigDTO) {
    return prisma.industry.create({ data: { name: dto.name } });
  }

  async updateIndustry(id: string, dto: UpdateIndustryConfigDTO) {
    const existing = await prisma.industry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Bidang industri tidak ditemukan');
    return prisma.industry.update({ where: { id }, data: { name: dto.name } });
  }

  async deleteIndustry(id: string) {
    const existing = await prisma.industry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Bidang industri tidak ditemukan');
    const used = await prisma.company.count({ where: { industryId: id, deletedAt: null } });
    if (used > 0) throw new ConflictError('Bidang industri masih dipakai perusahaan dan tidak dapat dihapus');
    return prisma.industry.delete({ where: { id } });
  }
}

export const configService = new ConfigService();

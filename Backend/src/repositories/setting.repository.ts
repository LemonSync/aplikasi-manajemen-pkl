import { SystemSetting, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Repository pengaturan sistem (key-value).
 */
export class SystemSettingRepository {
  async findByKey(key: string): Promise<SystemSetting | null> {
    return prisma.systemSetting.findUnique({ where: { key } });
  }

  async findMany(keys?: string[]): Promise<SystemSetting[]> {
    return prisma.systemSetting.findMany({
      where: keys ? { key: { in: keys } } : {},
      orderBy: { key: 'asc' },
    });
  }

  async upsert(
    key: string,
    data: { value: string; type?: string; description?: string | null; updatedById?: string | null }
  ): Promise<SystemSetting> {
    return prisma.systemSetting.upsert({
      where: { key },
      update: {
        value: data.value,
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
      },
      create: {
        key,
        value: data.value,
        type: data.type ?? 'string',
        description: data.description ?? null,
        ...(data.updatedById ? { updatedBy: { connect: { id: data.updatedById } } } : {}),
      },
    });
  }

  async update(key: string, data: Prisma.SystemSettingUpdateInput): Promise<SystemSetting> {
    return prisma.systemSetting.update({ where: { key }, data });
  }
}

export const systemSettingRepository = new SystemSettingRepository();

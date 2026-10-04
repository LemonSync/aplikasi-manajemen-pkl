import { Document, DocumentFile, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

export type DocumentWithFiles = Prisma.DocumentGetPayload<{
  include: { files: { orderBy: { version: 'desc' } } };
}>;

/**
 * Repository dokumen (dengan versioning file).
 */
export class DocumentRepository {
  async findById(id: string): Promise<DocumentWithFiles | null> {
    return prisma.document.findUnique({
      where: { id },
      include: { files: { orderBy: { version: 'desc' } } },
    });
  }

  async findMany(where: Prisma.DocumentWhereInput): Promise<DocumentWithFiles[]> {
    return prisma.document.findMany({
      where,
      include: { files: { orderBy: { version: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findActiveFileByType(ownerId: string, type: Prisma.DocumentWhereInput['type']): Promise<DocumentFile | null> {
    return prisma.documentFile.findFirst({
      where: {
        isActive: true,
        document: { ownerId, type },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: Prisma.DocumentCreateInput): Promise<Document> {
    return prisma.document.create({ data });
  }

  async update(id: string, data: Prisma.DocumentUpdateInput): Promise<Document> {
    return prisma.document.update({ where: { id }, data });
  }

  async createFile(data: Prisma.DocumentFileCreateInput): Promise<DocumentFile> {
    return prisma.documentFile.create({ data });
  }

  /** Nonaktifkan semua file dokumen (saat upload versi baru). */
  async deactivateFiles(documentId: string): Promise<void> {
    await prisma.documentFile.updateMany({
      where: { documentId, isActive: true },
      data: { isActive: false },
    });
  }

  async nextVersion(documentId: string): Promise<number> {
    const last = await prisma.documentFile.findFirst({
      where: { documentId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return (last?.version ?? 0) + 1;
  }

  async paginate(
    where: Prisma.DocumentWhereInput,
    skip: number,
    take: number
  ): Promise<{ items: DocumentWithFiles[]; total: number }> {
    const [items, total] = await Promise.all([
      prisma.document.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { files: { orderBy: { version: 'desc' } } },
      }),
      prisma.document.count({ where }),
    ]);
    return { items, total };
  }
}

export const documentRepository = new DocumentRepository();

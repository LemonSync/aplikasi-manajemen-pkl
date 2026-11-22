import type { Prisma, WaGuide } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError, ConflictError, NotFoundError } from '../../errors/AppError';
import { deleteStoredFile, saveBuffer } from '../../utils/storage';

/** Tingkat maksimum pohon panduan (root = 0). */
export const MAX_GUIDE_DEPTH = 3;

export interface GuideInput {
  parentId?: string | null;
  rowId: string;
  label: string;
  body?: string | null;
  role?: string;
  order?: number;
  isActive?: boolean;
}

/**
 * Pohon panduan customer service yang ditampilkan bot.
 * Depth dan role dijaga di sini agar UI Config tidak bisa membuat cabang
 * tak berujung atau cabang yang muncul di peran yang salah.
 */
export class WaGuideService {
  async list(): Promise<(WaGuide & { childCount: number })[]> {
    const [nodes, grouped] = await Promise.all([
      prisma.waGuide.findMany({ orderBy: [{ depth: 'asc' }, { order: 'asc' }, { label: 'asc' }] }),
      prisma.waGuide.groupBy({ by: ['parentId'], _count: { _all: true } }),
    ]);
    const counts = new Map(grouped.map((g) => [g.parentId ?? '', g._count._all]));
    return nodes.map((n) => ({ ...n, childCount: counts.get(n.id) ?? 0 }));
  }

  async create(input: GuideInput): Promise<WaGuide> {
    const parent = await this.resolveParent(input.parentId ?? null);
    const depth = parent ? parent.depth + 1 : 0;
    this.assertDepth(depth);

    return this.guardRowId(() =>
      prisma.waGuide.create({
        data: {
          parentId: parent?.id ?? null,
          rowId: input.rowId.trim(),
          label: input.label.trim(),
          body: input.body?.trim() || null,
          role: parent?.role ?? input.role ?? 'SISWA',
          order: input.order ?? 0,
          depth,
          isActive: input.isActive ?? true,
        },
      })
    );
  }

  async update(id: string, input: Partial<GuideInput>): Promise<WaGuide> {
    const node = await prisma.waGuide.findUnique({ where: { id } });
    if (!node) throw new NotFoundError('Panduan tidak ditemukan');

    const nextParentId = input.parentId === undefined ? node.parentId : input.parentId || null;
    const parent = await this.resolveParent(nextParentId, id);
    const depth = parent ? parent.depth + 1 : 0;
    this.assertDepth(depth);

    // Pindah cabang: seluruh descendant ikut bergeser, jadi tingginya harus muat.
    if (nextParentId !== node.parentId) {
      const height = await this.subtreeHeight(id);
      if (depth + height > MAX_GUIDE_DEPTH) {
        throw new BadRequestError(`Perpindahan ini membuat panduan lebih dalam dari ${MAX_GUIDE_DEPTH} tingkat`);
      }
    }

    const data: Prisma.WaGuideUpdateInput = {
      ...(parent ? { parent: { connect: { id: parent.id } } } : { parent: { disconnect: true } }),
      depth,
      ...(input.rowId !== undefined ? { rowId: input.rowId.trim() } : {}),
      ...(input.label !== undefined ? { label: input.label.trim() } : {}),
      ...(input.body !== undefined ? { body: input.body?.trim() || null } : {}),
      ...(input.order !== undefined ? { order: input.order } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    };
    if (parent) data.role = parent.role;

    const updated = await this.guardRowId(() => prisma.waGuide.update({ where: { id }, data }));
    if (updated.depth !== node.depth) await this.rebalanceSubtree(updated.id, updated.depth + 1);
    return updated;
  }

  async remove(id: string): Promise<{ id: string; removed: number }> {
    const node = await prisma.waGuide.findUnique({ where: { id } });
    if (!node) throw new NotFoundError('Panduan tidak ditemukan');

    const descendants = await this.collectDescendants(id);
    if (node.imagePath) deleteStoredFile(node.imagePath);
    await prisma.waGuide.delete({ where: { id } });
    return { id, removed: descendants.length };
  }

  /** Unggah gambar panduan (base64 data URL) ke storage/wa-guides. */
  async saveImage(id: string, dataUrl: string): Promise<WaGuide> {
    const node = await prisma.waGuide.findUnique({ where: { id } });
    if (!node) throw new NotFoundError('Panduan tidak ditemukan');

    const match = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) throw new BadRequestError('Gambar harus berupa PNG atau JPEG (base64 data URL)');
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length === 0 || buffer.length > 512 * 1024) {
      throw new BadRequestError('Ukuran gambar panduan harus antara 1 byte dan 512 KB');
    }

    const ext = match[1] === 'png' ? 'png' : 'jpg';
    const { relativePath } = saveBuffer('wa-guides', `${node.rowId}.${ext}`, buffer);
    if (node.imagePath && node.imagePath !== relativePath) deleteStoredFile(node.imagePath);
    return prisma.waGuide.update({ where: { id }, data: { imagePath: relativePath } });
  }

  async removeImage(id: string): Promise<WaGuide> {
    const node = await prisma.waGuide.findUnique({ where: { id } });
    if (!node) throw new NotFoundError('Panduan tidak ditemukan');
    if (node.imagePath) deleteStoredFile(node.imagePath);
    return prisma.waGuide.update({ where: { id }, data: { imagePath: null } });
  }

  /** Cari parent; tolak diri sendiri dan leluhur (siklus). */
  private async resolveParent(parentId: string | null, selfId?: string): Promise<WaGuide | null> {
    if (!parentId) return null;
    if (selfId && parentId === selfId) throw new BadRequestError('Panduan tidak bisa menjadi induknya sendiri');
    const parent = await prisma.waGuide.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundError('Induk panduan tidak ditemukan');
    if (selfId) {
      const descendants = await this.collectDescendants(selfId);
      if (descendants.includes(parentId)) {
        throw new BadRequestError('Tidak bisa memindahkan panduan ke dalam cabangnya sendiri');
      }
    }
    return parent;
  }

  private assertDepth(depth: number): void {
    if (depth > MAX_GUIDE_DEPTH) {
      throw new BadRequestError(`Kedalaman panduan maksimal ${MAX_GUIDE_DEPTH} tingkat`);
    }
  }

  /** Tingkat terbawah di bawah node (daun = 0). */
  private async subtreeHeight(id: string): Promise<number> {
    const children = await prisma.waGuide.findMany({ where: { parentId: id }, select: { id: true } });
    if (children.length === 0) return 0;
    const heights = await Promise.all(children.map((c) => this.subtreeHeight(c.id)));
    return 1 + Math.max(...heights);
  }

  /** Depth anak & cucu mengikuti depth induk yang baru. */
  private async rebalanceSubtree(parentId: string, depth: number): Promise<void> {
    const children = await prisma.waGuide.findMany({ where: { parentId }, select: { id: true } });
    for (const child of children) {
      await prisma.waGuide.update({ where: { id: child.id }, data: { depth } });
      await this.rebalanceSubtree(child.id, depth + 1);
    }
  }

  private async collectDescendants(id: string): Promise<string[]> {
    const out: string[] = [];
    const walk = async (parentId: string): Promise<void> => {
      const children = await prisma.waGuide.findMany({ where: { parentId }, select: { id: true } });
      for (const child of children) {
        out.push(child.id);
        await walk(child.id);
      }
    };
    await walk(id);
    return out;
  }

  /** Bungkus error unik rowId (P2002) menjadi pesan yang dimengerti admin. */
  private async guardRowId<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictError('Kode tombol (rowId) sudah dipakai panduan lain');
      }
      throw err;
    }
  }
}

export const waGuideService = new WaGuideService();

import { Prisma } from '@prisma/client';

/**
 * Base interface kontrak repository.
 * Setiap repository konkret boleh mengimplementasikan findById/deleteById.
 */
export interface IBaseRepository<TModel, TCreateInput, TUpdateInput> {
  findById(id: string): Promise<TModel | null>;
  findMany(args?: Record<string, unknown>): Promise<TModel[]>;
  create(data: TCreateInput): Promise<TModel>;
  update(id: string, data: TUpdateInput): Promise<TModel>;
  deleteById(id: string): Promise<TModel>;
}

/**
 * Tipe Delegate Prisma generik yang dibutuhkan base repository.
 */
export interface PrismaDelegate {
  findUnique(args: { where: { id: string } }): Promise<unknown>;
  findMany(args?: unknown): Promise<unknown[]>;
  create(args: { data: unknown }): Promise<unknown>;
  update(args: { where: { id: string }; data: unknown }): Promise<unknown>;
  delete(args: { where: { id: string } }): Promise<unknown>;
  count(args?: unknown): Promise<number>;
}

/**
 * BaseRepository generik untuk operasi CRUD standar via Prisma.
 * Repository konkret dapat memperluas kelas ini dan menambah method khusus.
 */
export abstract class BaseRepository<TCreateInput, TUpdateInput> {
  protected constructor(
    protected readonly delegate: PrismaDelegate,
    protected readonly modelName: string
  ) {}

  async findById(id: string): Promise<unknown> {
    return this.delegate.findUnique({ where: { id } });
  }

  async findMany(args?: Record<string, unknown>): Promise<unknown[]> {
    return this.delegate.findMany(args as Prisma.Args<never, 'findMany'>);
  }

  async paginate(
    where: Record<string, unknown>,
    skip: number,
    take: number,
    orderBy: Record<string, 'asc' | 'desc'>,
    include?: Record<string, unknown>
  ): Promise<{ items: unknown[]; total: number }> {
    const [items, total] = await Promise.all([
      this.delegate.findMany({ where, skip, take, orderBy, ...(include ? { include } : {}) }),
      this.delegate.count({ where }),
    ]);
    return { items, total };
  }

  async create(data: TCreateInput): Promise<unknown> {
    return this.delegate.create({ data });
  }

  async update(id: string, data: TUpdateInput): Promise<unknown> {
    return this.delegate.update({ where: { id }, data });
  }

  async deleteById(id: string): Promise<unknown> {
    return this.delegate.delete({ where: { id } });
  }
}

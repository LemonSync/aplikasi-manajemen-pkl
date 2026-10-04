import { Prisma } from '@prisma/client';
import { companyRepository } from '../repositories/company.repository';
import { auditService } from './audit.service';
import { NotFoundError } from '../errors/AppError';
import { MESSAGES, AUDIT_ACTIONS, ENTITY_TYPES } from '../config/constants';

export interface CompanyInput {
  name: string;
  address?: string | null;
  industryId?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
}

/**
 * Service perusahaan mitra (DUDI).
 */
export class CompanyService {
  async list(params: { page: number; perPage: number; search?: string; industryId?: string }) {
    const where: Prisma.CompanyWhereInput = {
      ...(params.industryId ? { industryId: params.industryId } : {}),
      ...(params.search
        ? { OR: [{ name: { contains: params.search } }, { city: { contains: params.search } }] }
        : {}),
    };
    return companyRepository.paginate(where, (params.page - 1) * params.perPage, params.perPage);
  }

  async getById(id: string) {
    const company = await companyRepository.findByIdWithRelations(id);
    if (!company) throw new NotFoundError(MESSAGES.NOT_FOUND);
    return company;
  }

  async create(input: CompanyInput, actorId: string) {
    const company = await companyRepository.create({
      name: input.name,
      address: input.address ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      city: input.city ?? null,
      ...(input.industryId ? { industry: { connect: { id: input.industryId } } } : {}),
    });
    await auditService.record({
      actorId,
      action: AUDIT_ACTIONS.CREATE_COMPANY,
      entityType: ENTITY_TYPES.COMPANY,
      entityId: company.id,
      metadata: { name: company.name },
    });
    return company;
  }

  async update(id: string, input: Partial<CompanyInput>) {
    await this.getById(id);
    return companyRepository.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.industryId ? { industry: { connect: { id: input.industryId } } } : {}),
    });
  }
}

export const companyService = new CompanyService();

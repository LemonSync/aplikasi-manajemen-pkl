import { prisma } from '../config/prisma';
import { NotFoundError } from '../errors/AppError';
import { MESSAGES } from '../config/constants';
import { CreateJobVacancyDTO, UpdateJobVacancyDTO } from '../validators/jobVacancy.validator';

export class JobVacancyService {
  async create(authorId: string, dto: CreateJobVacancyDTO) {
    return prisma.jobVacancy.create({
      data: {
        author: { connect: { id: authorId } },
        title: dto.title,
        description: dto.description,
        ...(dto.requirements ? { requirements: dto.requirements } : {}),
        ...(dto.location ? { location: dto.location } : {}),
        ...(dto.companyId ? { company: { connect: { id: dto.companyId } } } : {}),
      },
    });
  }

  async update(id: string, dto: UpdateJobVacancyDTO) {
    const vacancy = await prisma.jobVacancy.findUnique({ where: { id } });
    if (!vacancy) throw new NotFoundError(MESSAGES.NOT_FOUND);
    return prisma.jobVacancy.update({ where: { id }, data: dto });
  }

  async list(params: { page: number; perPage: number; status?: string; companyId?: string }) {
    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;
    if (params.companyId) where.companyId = params.companyId;

    const [items, total] = await Promise.all([
      prisma.jobVacancy.findMany({
        where,
        skip: (params.page - 1) * params.perPage,
        take: params.perPage,
        orderBy: { createdAt: 'desc' },
        include: { company: true, author: { select: { id: true, username: true } } },
      }),
      prisma.jobVacancy.count({ where }),
    ]);
    return { items, total };
  }

  async getById(id: string) {
    const vacancy = await prisma.jobVacancy.findUnique({
      where: { id },
      include: { company: true, author: { select: { id: true, username: true } } },
    });
    if (!vacancy) throw new NotFoundError(MESSAGES.NOT_FOUND);
    return vacancy;
  }
}

export const jobVacancyService = new JobVacancyService();

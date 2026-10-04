import { Attendance, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Repository absensi harian (Fase 3).
 */
export class AttendanceRepository {
  async findByUserAndDate(userId: string, date: Date): Promise<Attendance | null> {
    return prisma.attendance.findUnique({ where: { userId_date: { userId, date } } });
  }

  async findById(id: string): Promise<Attendance | null> {
    return prisma.attendance.findUnique({ where: { id } });
  }

  async create(data: Prisma.AttendanceCreateInput): Promise<Attendance> {
    return prisma.attendance.create({ data });
  }

  async update(id: string, data: Prisma.AttendanceUpdateInput): Promise<Attendance> {
    return prisma.attendance.update({ where: { id }, data });
  }

  async paginate(
    where: Prisma.AttendanceWhereInput,
    skip: number,
    take: number
  ): Promise<{ items: Attendance[]; total: number }> {
    const [items, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        skip,
        take,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        include: { user: { select: { id: true, username: true, studentProfile: { select: { fullName: true, nisn: true } } } }, group: { select: { id: true, name: true } } },
      }),
      prisma.attendance.count({ where }),
    ]);
    return { items, total };
  }

  /** Rekap jumlah per status dalam rentang tanggal. */
  async summary(where: Prisma.AttendanceWhereInput): Promise<Array<{ status: string; _count: number }>> {
    const grouped = await prisma.attendance.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    return grouped.map((g) => ({ status: g.status, _count: g._count._all }));
  }
}

export const attendanceRepository = new AttendanceRepository();

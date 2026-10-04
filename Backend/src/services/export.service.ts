import { prisma } from '../config/prisma';

/**
 * Service export data (Excel/CSV).
 */
export class ExportService {
  async grades(groupId?: string) {
    const where = groupId ? { groupId } : {};
    const grades = await prisma.grade.findMany({
      where,
      include: {
        student: { include: { studentProfile: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return grades.map((g) => ({
      nama: g.student?.studentProfile?.fullName ?? g.student?.username,
      nisn: g.student?.studentProfile?.nisn ?? '',
      nilaiDudi: g.scoreDudi ?? '',
      nilaiBimbingan: g.scoreGuidance ?? '',
      nilaiAkhir: g.finalScore ?? '',
      predikat: g.predicate ?? '',
      catatan: g.note ?? '',
    }));
  }

  async attendances(params: { groupId?: string; from?: string; to?: string }) {
    const where: Record<string, unknown> = {};
    if (params.groupId) where.groupId = params.groupId;
    if (params.from || params.to) {
      where.date = {};
      if (params.from) (where.date as Record<string, string>).gte = params.from;
      if (params.to) (where.date as Record<string, string>).lte = params.to;
    }

    const attendances = await prisma.attendance.findMany({
      where,
      include: {
        user: { include: { studentProfile: true } },
      },
      orderBy: [{ date: 'desc' }, { checkInAt: 'desc' }],
    });

    return attendances.map((a) => ({
      nama: a.user?.studentProfile?.fullName ?? a.user?.username,
      tanggal: a.date,
      status: a.status,
      checkIn: a.checkInAt?.toLocaleTimeString('id-ID') ?? '',
      checkOut: a.checkOutAt?.toLocaleTimeString('id-ID') ?? '',
      anomali: a.isAnomaly ? 'Ya' : 'Tidak',
    }));
  }
}

export const exportService = new ExportService();

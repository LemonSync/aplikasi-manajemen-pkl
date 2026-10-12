import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Service export data (Excel/CSV).
 * Filter memakai studentId / cohortId (lewat relasi siswa), bukan kelompok.
 */
export class ExportService {
  async grades(params: { studentId?: string; cohortId?: string }) {
    const where: Prisma.GradeWhereInput = {
      ...(params.studentId ? { studentId: params.studentId } : {}),
      ...(params.cohortId ? { student: { cohortId: params.cohortId } } : {}),
    };
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

  async attendances(params: { studentId?: string; cohortId?: string; from?: string; to?: string }) {
    const where: Prisma.AttendanceWhereInput = {};
    if (params.studentId) where.userId = params.studentId;
    if (params.cohortId) where.user = { cohortId: params.cohortId };
    if (params.from || params.to) {
      const date: Prisma.DateTimeFilter = {};
      if (params.from) date.gte = params.from;
      if (params.to) date.lte = params.to;
      where.date = date;
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

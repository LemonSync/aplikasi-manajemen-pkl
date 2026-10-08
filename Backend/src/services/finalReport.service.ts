import { Role, StudentPhase } from '@prisma/client';
import { prisma } from '../config/prisma';
import { renderFinalReportPdf, FinalReportData } from '../templates/finalReport.template';
import { readStoredFile, saveBuffer } from '../utils/storage';
import { settingService } from './setting.service';
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors/AppError';
import { MESSAGES } from '../config/constants';

const ATTENDANCE_LABEL: Record<string, string> = {
  HADIR: 'Hadir',
  IZIN: 'Izin',
  SAKIT: 'Sakit',
  ALPHA: 'Alpha',
};

const VISIT_LABEL: Record<string, string> = {
  TERJADWAL: 'Terjadwal',
  TERTUNDA: 'Tertunda',
  BATAL: 'Batal',
  SELESAI: 'Selesai',
};

const fmtDate = (d: Date | string): string =>
  new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

const fmtDateTime = (d: Date | string): string =>
  new Date(d).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Laporan hasil akhir PKL per kelompok (PDF).
 * - Diterbitkan satu kali (generate-once) setelah masa PKL selesai.
 * - Bisa diunduh hanya oleh siswa anggota kelompok.
 * - Isi nilai DUDI di-snapshot saat terbit: bila DUDI belum menginput nilai,
 *   bagian nilai terbit dalam keadaan KOSONG (sel tanpa angka).
 */
export class FinalReportService {
  async getOrCreateForStudent(studentId: string): Promise<{ buffer: Buffer; filename: string }> {
    const student = await prisma.user.findUnique({ where: { id: studentId } });
    if (!student || student.role !== Role.SISWA) throw new ForbiddenError(MESSAGES.SCOPE);

    const group = await prisma.group.findFirst({
      where: { deletedAt: null, members: { some: { userId: studentId } } },
      select: { id: true, code: true, cohortId: true },
    });
    if (!group) throw new NotFoundError('Anda tidak tergabung dalam kelompok PKL');

    // Hanya setelah masa PKL selesai (gelombang memasuki fase Pasca-PKL).
    const pasca = await prisma.phaseSchedule.findFirst({
      where: { cohortId: group.cohortId, phase: StudentPhase.PKL_SELESAI },
    });
    const today = new Date().toLocaleDateString('en-CA');
    const pklFinished =
      pasca !== null &&
      pasca.startDate !== null &&
      today >= new Date(pasca.startDate).toLocaleDateString('en-CA');
    if (!pklFinished) {
      throw new BadRequestError('Laporan hasil PKL baru dapat diunduh setelah masa PKL selesai');
    }

    const filename = `Laporan-Hasil-PKL-${group.code}.pdf`.replace(/[^\w.\-]+/g, '_');

    // Sudah terbit? Pakai file snapshot-nya (isi tidak berubah walau data
    // bergerak setelah terbit — sesuai aturan "sudah terbit ya tetap").
    const existing = await prisma.finalReport.findUnique({ where: { groupId: group.id } });
    if (existing) {
      const buf = readStoredFile(existing.pdfPath);
      if (buf) return { buffer: buf, filename };
      // File hilang dari storage → terbitkan ulang dan perbarui path.
    }

    const pdfBuffer = await this.generate(group.id);
    const { relativePath } = saveBuffer(
      'letters',
      `hasil-pkl-${group.code}-${Date.now()}.pdf`,
      pdfBuffer
    );

    if (existing) {
      await prisma.finalReport.update({ where: { groupId: group.id }, data: { pdfPath: relativePath } });
      return { buffer: pdfBuffer, filename };
    }

    try {
      await prisma.finalReport.create({
        data: { groupId: group.id, cohortId: group.cohortId, pdfPath: relativePath },
      });
    } catch {
      // Balapan dua permintaan bersamaan: pakai milik yang pertama terbit.
      const raced = await prisma.finalReport.findUnique({ where: { groupId: group.id } });
      if (!raced) throw new NotFoundError('Laporan hasil PKL gagal diterbitkan');
      const buf = readStoredFile(raced.pdfPath);
      if (!buf) throw new NotFoundError('File laporan hasil PKL tidak ditemukan di storage');
      return { buffer: buf, filename };
    }

    return { buffer: pdfBuffer, filename };
  }

  /** Kumpulkan seluruh data kelompok lalu render PDF. */
  private async generate(groupId: string): Promise<Buffer> {
    const [group, school] = await Promise.all([
      prisma.group.findUnique({
        where: { id: groupId },
        include: {
          cohort: { select: { name: true } },
          major: { select: { name: true } },
          registration: { select: { companyName: true, companyAddress: true, companyCity: true } },
          members: {
            orderBy: { isLeader: 'desc' },
            include: {
              user: {
                select: {
                  username: true,
                  studentProfile: { select: { fullName: true, nisn: true } },
                },
              },
            },
          },
          supervisors: {
            include: {
              user: { select: { username: true, teacherProfile: { select: { fullName: true } } } },
            },
          },
        },
      }),
      settingService.getSchoolIdentity(),
    ]);
    if (!group) throw new NotFoundError('Kelompok tidak ditemukan');

    const pklSchedule = await prisma.phaseSchedule.findFirst({
      where: { cohortId: group.cohortId, phase: StudentPhase.PKL_AKTIF },
    });

    const members = group.members.map((m) => ({
      userId: m.userId,
      fullName: m.user.studentProfile?.fullName ?? m.user.username,
      nisn: m.user.studentProfile?.nisn ?? m.user.username,
    }));

    const [attendances, visits, journals, grades] = await Promise.all([
      prisma.attendance.findMany({
        where: { groupId },
        orderBy: [{ date: 'asc' }, { checkInAt: 'asc' }],
        include: {
          user: { select: { username: true, studentProfile: { select: { fullName: true } } } },
        },
      }),
      prisma.visit.findMany({
        where: { groupId },
        orderBy: { scheduledAt: 'asc' },
        include: {
          supervisor: { select: { username: true, teacherProfile: { select: { fullName: true } } } },
        },
      }),
      prisma.journal.findMany({
        where: { groupId },
        orderBy: [{ date: 'asc' }],
        include: {
          user: { select: { username: true, studentProfile: { select: { fullName: true } } } },
        },
      }),
      prisma.grade.findMany({ where: { groupId, giverRole: Role.DUDI } }),
    ]);

    const nameOf = (u: {
      username: string;
      studentProfile?: { fullName?: string | null } | null;
    }): string => u.studentProfile?.fullName ?? u.username;

    // Rekap absensi per siswa
    const summary = new Map(
      members.map((m) => [
        m.userId,
        { fullName: m.fullName, hadir: 0, izin: 0, sakit: 0, alpha: 0 },
      ])
    );
    for (const a of attendances) {
      const s = summary.get(a.userId);
      if (!s) continue;
      if (a.status === 'HADIR') s.hadir += 1;
      else if (a.status === 'IZIN') s.izin += 1;
      else if (a.status === 'SAKIT') s.sakit += 1;
      else s.alpha += 1;
    }

    // Nilai DUDI per siswa — bila belum diinput → null (sel kosong di PDF)
    const gradeByStudent = new Map(grades.map((g) => [g.studentId, g]));

    const dates = attendances.map((a) => +new Date(a.date));
    const periodFrom =
      dates.length > 0 ? fmtDate(new Date(Math.min(...dates))) : pklSchedule?.startDate ? fmtDate(pklSchedule.startDate) : null;
    const periodTo =
      dates.length > 0 ? fmtDate(new Date(Math.max(...dates))) : pklSchedule?.endDate ? fmtDate(pklSchedule.endDate) : null;

    const data: FinalReportData = {
      school: {
        name: school.schoolName,
        address: school.schoolAddress,
        phone: school.schoolPhone,
        email: school.schoolEmail,
        city: school.city,
      },
      issuedAt: new Date(),
      group: {
        code: group.code,
        name: group.name,
        cohortName: group.cohort?.name ?? null,
        majorName: group.major?.name ?? null,
      },
      company: {
        name: group.registration?.companyName ?? '-',
        address: group.registration?.companyAddress ?? '-',
        city: group.registration?.companyCity ?? null,
      },
      period: { from: periodFrom, to: periodTo },
      supervisors: group.supervisors.map(
        (s) => s.user.teacherProfile?.fullName ?? s.user.username
      ),
      members: members.map((m) => ({ nisn: m.nisn, fullName: m.fullName })),
      attendanceSummary: [...summary.values()],
      attendanceRows: attendances.map((a) => ({
        date: fmtDate(a.date),
        fullName: nameOf(a.user),
        status: ATTENDANCE_LABEL[a.status] ?? a.status,
        activity: a.activity ?? '-',
      })),
      visits: visits.map((v) => ({
        scheduledAt: fmtDateTime(v.scheduledAt),
        visitedAt: v.visitedAt ? fmtDateTime(v.visitedAt) : null,
        status: VISIT_LABEL[v.status] ?? v.status,
        supervisor: v.supervisor.teacherProfile?.fullName ?? v.supervisor.username,
        note: v.note,
      })),
      journals: journals.map((j) => ({
        date: fmtDate(j.date),
        fullName: nameOf(j.user),
        activity: j.activity,
        result: j.result,
      })),
      grades: members.map((m) => {
        const g = gradeByStudent.get(m.userId);
        const score = g?.scoreDudi ?? g?.finalScore ?? null;
        return {
          fullName: m.fullName,
          nisn: m.nisn,
          scoreDudi: score !== null ? String(Number(score)) : null,
          predicate: g?.predicate ?? null,
          note: g?.note ?? null,
        };
      }),
    };

    return renderFinalReportPdf(data);
  }
}

export const finalReportService = new FinalReportService();

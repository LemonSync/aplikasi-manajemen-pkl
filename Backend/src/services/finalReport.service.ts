import { Role, StudentPhase } from '@prisma/client';
import { prisma } from '../config/prisma';
import { renderFinalReportPdf, FinalReportData } from '../templates/finalReport.template';
import { readStoredFile, saveBuffer } from '../utils/storage';
import { settingService } from './setting.service';
import { classNameWithFallback } from './classResolver.service';
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
 * Laporan hasil akhir PKL per siswa (PDF).
 * - Diterbitkan satu kali (generate-once) setelah masa PKL selesai.
 * - Siswa mengunduh laporannya sendiri; guru pembimbing hanya untuk siswa
 *   bimbingannya; admin/kepsek bebas memilih siswa (query ?studentId=).
 * - Rekap absensi/jurnal/kunjungan/nilai di-query per studentId.
 * - Isi nilai di-snapshot saat terbit: bila belum ada nilai,
 *   bagian nilai terbit dalam keadaan KOSONG (sel tanpa angka).
 */
export class FinalReportService {
  async getOrCreateForStudent(
    actor: { id: string; role: string },
    studentId?: string
  ): Promise<{ buffer: Buffer; filename: string }> {
    const targetId = await this.resolveTargetStudent(actor, studentId);

    const student = await prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        role: true,
        username: true,
        cohortId: true,
        studentProfile: { select: { nisn: true } },
      },
    });
    if (!student || student.role !== Role.SISWA) throw new ForbiddenError(MESSAGES.SCOPE);
    if (!student.cohortId) throw new NotFoundError('Siswa belum terdaftar pada gelombang PKL mana pun');
    const cohortId = student.cohortId;

    // Hanya setelah masa PKL selesai (gelombang memasuki fase Pasca-PKL).
    const pasca = await prisma.phaseSchedule.findFirst({
      where: { cohortId, phase: StudentPhase.PKL_SELESAI },
    });
    const today = new Date().toLocaleDateString('en-CA');
    const pklFinished =
      pasca !== null &&
      pasca.startDate !== null &&
      today >= new Date(pasca.startDate).toLocaleDateString('en-CA');
    if (!pklFinished) {
      throw new BadRequestError('Laporan hasil PKL baru dapat diunduh setelah masa PKL selesai');
    }

    const code = student.studentProfile?.nisn ?? student.username;
    const filename = `Laporan-Hasil-PKL-${code}.pdf`.replace(/[^\w.-]+/g, '_');

    // Sudah terbit? Pakai file snapshot-nya (isi tidak berubah walau data
    // bergerak setelah terbit — sesuai aturan "sudah terbit ya tetap").
    const existing = await prisma.finalReport.findUnique({ where: { studentId: targetId } });
    if (existing) {
      const buf = readStoredFile(existing.pdfPath);
      if (buf) return { buffer: buf, filename };
      // File hilang dari storage → terbitkan ulang dan perbarui path.
    }

    const pdfBuffer = await this.generate(targetId);
    const { relativePath } = saveBuffer(
      'letters',
      `hasil-pkl-${code}-${Date.now()}.pdf`,
      pdfBuffer
    );

    if (existing) {
      await prisma.finalReport.update({ where: { studentId: targetId }, data: { pdfPath: relativePath } });
      return { buffer: pdfBuffer, filename };
    }

    try {
      await prisma.finalReport.create({
        data: { studentId: targetId, cohortId, pdfPath: relativePath },
      });
    } catch {
      // Balapan dua permintaan bersamaan: pakai milik yang pertama terbit.
      const raced = await prisma.finalReport.findUnique({ where: { studentId: targetId } });
      if (!raced) throw new NotFoundError('Laporan hasil PKL gagal diterbitkan');
      const buf = readStoredFile(raced.pdfPath);
      if (!buf) throw new NotFoundError('File laporan hasil PKL tidak ditemukan di storage');
      return { buffer: buf, filename };
    }

    return { buffer: pdfBuffer, filename };
  }

  /** Tentukan siswa yang laporan-nya diminta (scope per role). */
  private async resolveTargetStudent(
    actor: { id: string; role: string },
    studentId?: string
  ): Promise<string> {
    // Siswa hanya boleh mengunduh laporannya sendiri.
    if (actor.role === Role.SISWA) {
      if (studentId && studentId !== actor.id) throw new ForbiddenError(MESSAGES.SCOPE);
      return actor.id;
    }

    if (!studentId) throw new BadRequestError('ID siswa wajib diisi');

    // Guru pembimbing hanya untuk siswa bimbingannya.
    if (actor.role === Role.GURU_PEMBIMBING) {
      const link = await prisma.studentSupervisor.findUnique({
        where: { studentId },
        select: { supervisorId: true },
      });
      if (link?.supervisorId !== actor.id) throw new BadRequestError(MESSAGES.SCOPE);
    }

    return studentId;
  }

  /** Kumpulkan seluruh data siswa lalu render PDF. */
  private async generate(studentId: string): Promise<Buffer> {
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        username: true,
        cohortId: true,
        cohort: { select: { name: true } },
        studentProfile: {
          select: {
            fullName: true,
            nisn: true,
            class: { select: { name: true } },
            major: { select: { name: true } },
          },
        },
        supervision: {
          select: {
            supervisor: { select: { username: true, teacherProfile: { select: { fullName: true } } } },
          },
        },
      },
    });
    if (!student) throw new NotFoundError('Siswa tidak ditemukan');

    const cohortId = student.cohortId;

    const [registration, school, pklSchedule, attendances, visits, journals, grade] =
      await Promise.all([
        prisma.registration.findFirst({
          where: {
            studentId,
            ...(cohortId ? { cohortId } : {}),
            deletedAt: null,
            status: { in: ['DIAJUKAN', 'DISETUJUI'] },
          },
          orderBy: { createdAt: 'desc' },
          select: { company: { select: { name: true, address: true, city: true } } },
        }),
        settingService.getSchoolIdentity(),
        prisma.phaseSchedule.findFirst({
          where: { phase: StudentPhase.PKL_AKTIF, ...(cohortId ? { cohortId } : {}) },
        }),
        prisma.attendance.findMany({
          where: { userId: studentId },
          orderBy: [{ date: 'asc' }, { checkInAt: 'asc' }],
        }),
        prisma.visit.findMany({
          where: { studentId },
          orderBy: { scheduledAt: 'asc' },
          include: {
            supervisor: { select: { username: true, teacherProfile: { select: { fullName: true } } } },
          },
        }),
        prisma.journal.findMany({ where: { userId: studentId }, orderBy: [{ date: 'asc' }] }),
        prisma.grade.findFirst({ where: { studentId }, orderBy: { createdAt: 'desc' } }),
      ]);

    const fullName = student.studentProfile?.fullName ?? student.username;
    const nisn = student.studentProfile?.nisn ?? student.username;
    // Kelas: preferensi Class.name, fallback ke Master Siswa (NISN).
    const registryClassName = await classNameWithFallback(student.studentProfile);

    // Rekap absensi siswa
    const summary = { fullName, hadir: 0, izin: 0, sakit: 0, alpha: 0 };
    for (const a of attendances) {
      if (a.status === 'HADIR') summary.hadir += 1;
      else if (a.status === 'IZIN') summary.izin += 1;
      else if (a.status === 'SAKIT') summary.sakit += 1;
      else summary.alpha += 1;
    }

    // Nilai — bila belum diinput → sel kosong di PDF
    const score = grade ? grade.scoreDudi ?? grade.finalScore ?? null : null;

    const dates = attendances.map((a) => +new Date(a.date));
    const periodFrom =
      dates.length > 0 ? fmtDate(new Date(Math.min(...dates))) : pklSchedule?.startDate ? fmtDate(pklSchedule.startDate) : null;
    const periodTo =
      dates.length > 0 ? fmtDate(new Date(Math.max(...dates))) : pklSchedule?.endDate ? fmtDate(pklSchedule.endDate) : null;

    const supervisor = student.supervision?.supervisor;

    const data: FinalReportData = {
      school: {
        name: school.schoolName,
        address: school.schoolAddress,
        phone: school.schoolPhone,
        email: school.schoolEmail,
        city: school.city,
      },
      issuedAt: new Date(),
      student: {
        fullName,
        nisn,
        className: registryClassName,
        majorName: student.studentProfile?.major?.name ?? null,
        cohortName: student.cohort?.name ?? null,
      },
      company: {
        name: registration?.company?.name ?? '-',
        address: registration?.company?.address ?? '-',
        city: registration?.company?.city ?? null,
      },
      period: { from: periodFrom, to: periodTo },
      supervisors: supervisor
        ? [supervisor.teacherProfile?.fullName ?? supervisor.username]
        : [],
      attendanceSummary: [summary],
      attendanceRows: attendances.map((a) => ({
        date: fmtDate(a.date),
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
        activity: j.activity,
        result: j.result,
      })),
      grades: grade
        ? [
            {
              fullName,
              nisn,
              scoreDudi: score !== null ? String(Number(score)) : null,
              predicate: grade.predicate,
              note: grade.note,
            },
          ]
        : [],
    };

    return renderFinalReportPdf(data);
  }
}

export const finalReportService = new FinalReportService();

import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { prisma } from '../config/prisma';
import { PENILAIAN_GROUPS } from '../config/penilaian.config';
import type { GradeRecapByClass, GradeRecapClass } from './grade.service';

/** Kolom butir penilaian — urutan & label sama dengan LEMBARAN PENILAIAN. */
const ASPECT_COLUMNS = PENILAIAN_GROUPS.flatMap((g) =>
  g.items.map((it) => ({ key: `${g.no}${it.code}`, header: `${g.no}${it.code}. ${it.label}` }))
);

/** Decimal Prisma → angka untuk sel Excel; kosong bila nilai belum ada. */
const toCell = (v: Prisma.Decimal | number | string | null | undefined): number | '' => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
};

/** Nama worksheet: maksimum 31 karakter, tanpa : \ / ? * [ ], dan tidak boleh duplikat. */
const sheetName = (raw: string, used: Set<string>): string => {
  const base = (raw.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Kelas').trim();
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${n++})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
};

const emptyClass = (): GradeRecapClass => ({
  className: 'Belum Ada Kelas',
  studentCount: 0,
  gradedCount: 0,
  students: [],
});

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
      rataRataButir: g.scoreDudi ?? '',
      nilaiLaporan: g.scoreReport ?? '',
      nilaiAkhir: g.finalScore ?? '',
      predikat: g.predicate ?? '',
      catatan: g.note ?? '',
    }));
  }

  /**
   * Rekap nilai per kelas menjadi satu workbook .xlsx — tiap kelas mendapat
   * worksheet sendiri. Siswa tanpa nilai tetap jadi baris, sel nilainya kosong.
   */
  async gradeWorkbook(
    recap: GradeRecapByClass,
    cohortId?: string
  ): Promise<{ buffer: Buffer; filename: string }> {
    const cohort = cohortId
      ? await prisma.cohort.findUnique({ where: { id: cohortId }, select: { name: true } })
      : null;
    const scopeLabel = cohort?.name ?? 'Semua Gelombang';

    const wb = XLSX.utils.book_new();
    const used = new Set<string>();
    for (const cls of recap.classes) {
      XLSX.utils.book_append_sheet(wb, this.classSheet(cls, scopeLabel), sheetName(cls.className, used));
    }
    if (wb.SheetNames.length === 0) {
      XLSX.utils.book_append_sheet(wb, this.classSheet(emptyClass(), scopeLabel), 'Rekap');
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return { buffer, filename: `Rekap-Nilai-PKL-${scopeLabel.replace(/[^\w.-]+/g, '_')}.xlsx` };
  }

  private classSheet(cls: GradeRecapClass, scopeLabel: string): XLSX.WorkSheet {
    const header = [
      'No',
      'Nama Siswa',
      'NISN',
      'Akun',
      'Perusahaan',
      'Guru Pembimbing',
      'Pembimbing (Mentor)',
      ...ASPECT_COLUMNS.map((c) => c.header),
      'Nilai DUDI',
      'Nilai Laporan',
      'Nilai Akhir',
      'Predikat',
      'Status Approval',
      'Catatan',
    ];

    const rows = cls.students.map((s, i) => {
      const aspects = new Map(
        (s.grade?.aspects ?? []).map((a) => [`${a.groupCode ?? ''}${a.code ?? ''}`, a.score])
      );
      return [
        i + 1,
        s.fullName,
        s.nisn ?? '',
        s.username,
        s.companyName ?? '',
        s.supervisorName ?? '',
        s.grade?.mentorName ?? '',
        ...ASPECT_COLUMNS.map((c) => toCell(aspects.get(c.key))),
        toCell(s.grade?.scoreDudi ?? null),
        toCell(s.grade?.scoreReport ?? null),
        toCell(s.grade?.finalScore ?? null),
        s.grade?.predicate ?? '',
        s.approvalStatus ?? '',
        s.grade?.note ?? '',
      ];
    });

    const scored = cls.students
      .map((s) => toCell(s.grade?.finalScore ?? null))
      .filter((v): v is number => v !== '');
    const averageRow: (string | number)[] = Array(header.length).fill('');
    averageRow[0] = 'Rata-rata Nilai Akhir';
    averageRow[header.indexOf('Nilai Akhir')] = scored.length
      ? Number((scored.reduce((a, b) => a + b, 0) / scored.length).toFixed(2))
      : '';

    const ws = XLSX.utils.aoa_to_sheet([
      [`REKAP NILAI PKL — ${cls.className}`],
      [`${scopeLabel} · dinilai ${scored.length} dari ${cls.students.length} siswa`],
      [],
      header,
      ...rows,
      [],
      averageRow,
    ]);

    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: header.length - 1 } },
    ];
    ws['!cols'] = header.map((h, i) => ({
      wch: i === 1 ? 26 : i >= 7 && i < 7 + ASPECT_COLUMNS.length ? 16 : h === 'Catatan' ? 32 : 13,
    }));
    return ws;
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

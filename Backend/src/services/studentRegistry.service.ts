import * as XLSX from 'xlsx';
import { prisma } from '../config/prisma';
import { studentRegistryRepository } from '../repositories/studentRegistry.repository';
import { BadRequestError, NotFoundError } from '../errors/AppError';

export interface StudentRegistryRemoveResult {
  fullName: string;
  nisn: string;
  accounts: number;
  memberRows: number;
  attendance: number;
  journals: number;
  grades: number;
  documents: number;
  groupMemberships: number;
  registrations: number;
}

const classPattern = /^XII-([A-Z]+)-([1-9][0-9]*)$/;
export class StudentRegistryService {
  async lookup(nisn: string, cohortId: string) {
    const row = await prisma.studentRegistry.findFirst({ where: { nisn, cohortId, isActive: true }, include: { major: true } });
    if (!row) throw new NotFoundError('NISN tidak ditemukan pada master siswa gelombang ini');
    return row;
  }

  /**
   * Tambah siswa manual ke Master Siswa (admin), dengan pengecekan duplikat NISN.
   * - NISN sudah aktif di gelombang ini -> ditolak
   * - NISN aktif di gelombang lain -> ditolak (NISN unique global, tidak boleh dipindah)
   * - NISN baris hasil-hapus (inactive) -> dipulihkan (data diperbarui, isActive = true)
   */
  async create(input: {
    cohortId: string;
    nisn?: unknown;
    fullName?: unknown;
    className?: unknown;
    majorCode?: unknown;
  }): Promise<{ record: Awaited<ReturnType<typeof studentRegistryRepository.upsert>>; restored: boolean }> {
    const cohortId = String(input.cohortId ?? '').trim();
    if (!cohortId) throw new BadRequestError('Gelombang wajib dipilih');
    const cohort = await prisma.cohort.findUnique({ where: { id: cohortId } });
    if (!cohort) throw new NotFoundError('Gelombang tidak ditemukan');

    const nisn = String(input.nisn ?? '').trim();
    if (!/^\d{10}$/.test(nisn)) throw new BadRequestError('NISN harus terdiri dari 10 digit angka');

    const fullName = String(input.fullName ?? '').trim();
    if (!fullName) throw new BadRequestError('Nama lengkap wajib diisi');

    const className = String(input.className ?? '').trim().toUpperCase();
    if (!/^[A-Z]{2,5}-[A-Z]{2,5}-\d{1,2}$/.test(className)) {
      throw new BadRequestError('Format kelas tidak valid. Gunakan format XII-RPL-2');
    }

    // Resolve jurusan: kode eksplisit, atau auto-detect dari kelas (XII-RPL-2 -> RPL)
    const majors = await prisma.major.findMany();
    const majorMap = new Map(majors.map((m) => [m.code.toUpperCase(), m.id]));
    const majorCode = String(input.majorCode ?? '').trim();
    let majorId: string | null = null;
    if (majorCode) {
      majorId = majorMap.get(majorCode.toUpperCase()) ?? null;
      if (!majorId) throw new BadRequestError(`Jurusan "${majorCode}" tidak ditemukan`);
    } else {
      majorId = majorMap.get(className.split('-')[1]) ?? null;
    }

    // Cek duplikat (NISN unique global — termasuk baris nonaktif & gelombang lain)
    const existing = await prisma.studentRegistry.findUnique({
      where: { nisn },
      include: { cohort: { select: { name: true } } },
    });
    if (existing && existing.isActive) {
      throw new BadRequestError(
        existing.cohortId === cohortId
          ? `NISN ${nisn} sudah terdaftar di Master Siswa gelombang ini`
          : `NISN ${nisn} sudah terdaftar di gelombang "${existing.cohort.name}"`
      );
    }

    const record = await studentRegistryRepository.upsert({ nisn, fullName, className, cohortId, majorId });
    return { record, restored: existing !== null };
  }

  /**
   * Hapus data siswa dari master + hapus PERMANEN seluruh data siswa tersebut.
   * Relasi FK di schema sudah Cascade (absensi, jurnal, nilai, surat, kelompok,
   * profil, kredensial -> ikut terhapus saat akun dihapus); method ini menghapus
   * eksplisit agar jumlahnya bisa dilaporkan, termasuk baris pendaftaran yang
   * hanya terhubung via NISN (belum punya akun).
   */
  async remove(id: string): Promise<StudentRegistryRemoveResult> {
    const row = await prisma.studentRegistry.findFirst({ where: { id, isActive: true } });
    if (!row) throw new NotFoundError('Data siswa tidak ditemukan');
    const nisn = row.nisn;

    // Akun siswa dengan NISN ini (username = NISN atau identifier = NISN).
    const users = await prisma.user.findMany({
      where: { role: 'SISWA', OR: [{ username: nisn }, { identifier: nisn }] },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);

    const counts: StudentRegistryRemoveResult = {
      fullName: row.fullName,
      nisn,
      accounts: userIds.length,
      memberRows: 0,
      attendance: 0,
      journals: 0,
      grades: 0,
      documents: 0,
      groupMemberships: 0,
      registrations: 0,
    };

    // Baris anggota pendaftaran: milik akun ini ATAU tercatat via NISN tanpa akun.
    counts.memberRows = (
      await prisma.registrationMember.deleteMany({
        where: { OR: [...(userIds.length ? [{ userId: { in: userIds } }] : []), { nisn }] },
      })
    ).count;

    for (const uid of userIds) {
      counts.attendance += (await prisma.attendance.deleteMany({ where: { userId: uid } })).count;
      counts.journals += (await prisma.journal.deleteMany({ where: { userId: uid } })).count;
      counts.grades += (await prisma.grade.deleteMany({ where: { studentId: uid } })).count;
      counts.documents += (await prisma.document.deleteMany({ where: { ownerId: uid } })).count;
      counts.groupMemberships += (await prisma.groupMember.deleteMany({ where: { userId: uid } })).count;
      // Pendaftaran yang diajukan siswa ini (dia = pengaju) ikut terhapus;
      // pendaftaran kelompok lain tempat dia hanya anggota TETAP ADA.
      counts.registrations += (await prisma.registration.deleteMany({ where: { leaderId: uid } })).count;
    }

    // Akun dihapus permanen -> relasi tersisa (StudentProfile + ParentData,
    // InitialCredential, RefreshToken, Notification, Complaint, Feedback, dsb.)
    // ikut terhapus otomatis via FK onDelete: Cascade.
    for (const uid of userIds) {
      await prisma.user.delete({ where: { id: uid } });
    }

    // Baris master disembunyikan (dipulihkan bila di-import ulang Excel).
    await prisma.studentRegistry.update({ where: { id }, data: { isActive: false } });

    return counts;
  }
  async importExcel(file: Express.Multer.File, cohortId: string) {
    const cohort = await prisma.cohort.findUnique({ where: { id: cohortId } });
    if (!cohort) throw new NotFoundError('Gelombang tidak ditemukan');
    const sheet = XLSX.read(file.buffer, { type: 'buffer' }).Sheets[XLSX.read(file.buffer, { type: 'buffer' }).SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    if (!rows.length) throw new BadRequestError('File Excel tidak memiliki baris data');
    const majors = await prisma.major.findMany(); const majorMap = new Map(majors.map((m) => [m.code, m.id]));
    const errors: string[] = []; let imported = 0;
    for (const [index, row] of rows.entries()) {
      const nisn = String(row.NISN ?? '').trim(); const fullName = String(row['Nama Lengkap'] ?? row.Nama ?? '').trim(); const className = String(row.Kelas ?? '').trim().toUpperCase();
      const match = classPattern.exec(className);
      if (!/^\d{10}$/.test(nisn) || !fullName || !match || !majorMap.has(match[1])) { errors.push(`Baris ${index + 2}: NISN/nama/kelas tidak valid`); continue; }
      await prisma.studentRegistry.upsert({ where: { nisn }, create: { nisn, fullName, className, cohortId, majorId: majorMap.get(match[1]) }, update: { fullName, className, cohortId, majorId: majorMap.get(match[1]), isActive: true } }); imported++;
    }
    return { imported, rejected: errors.length, errors };
  }
}
export const studentRegistryService = new StudentRegistryService();

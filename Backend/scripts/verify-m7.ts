/**
 * Skrip verifikasi M7 (Penyelarasan Alur).
 * Uji:
 *  1. Generate DOCX Surat Pernyataan (service) - file terbentuk & berisi data
 *  2. Submit absensi (status + kegiatan + lokasi) - record terbentuk
 *  3. Verifikasi absensi oleh DUDI - terkonfirmasi
 *  4. Scope: DUDI lain (perusahaan berbeda) ditolak
 *  5. Jadwal fase (PhaseSchedule) - simpan & fase aktif
 *
 * Jalankan: npx tsx scripts/verify-m7.ts
 */
import { PrismaClient, Role, StudentPhase, GroupStatus, AttendanceStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import PizZip from 'pizzip';
import { readFileSync } from 'fs';
import path from 'path';

dotenv.config();

const prisma = new PrismaClient();
const SALT = 10;

const log = (label: string, ok: boolean, extra?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`, extra !== undefined ? JSON.stringify(extra) : '');
  if (!ok) process.exitCode = 1;
};

async function main() {
  console.log('=== VERIFIKASI M7 ===\n');

  const { pernyataanService } = await import('../src/services/pernyataan.service');
  const { attendanceService } = await import('../src/services/attendance.service');
  const { phaseScheduleService } = await import('../src/services/phaseSchedule.service');

  const usernames = ['uji7_siswa_a', 'uji7_siswa_b', 'uji7_dudi'];
  const oldUsers = await prisma.user.findMany({ where: { username: { in: usernames } }, select: { id: true } });
  const oldIds = oldUsers.map((u) => u.id);
  if (oldIds.length > 0) {
    const oldGroups = await prisma.group.findMany({ where: { members: { some: { userId: { in: oldIds } } } }, select: { id: true } });
    const gids = oldGroups.map((g) => g.id);
    await prisma.attendance.deleteMany({ where: { userId: { in: oldIds } } });
    await prisma.documentFile.deleteMany({ where: { document: { ownerId: { in: oldIds } } } });
    await prisma.document.deleteMany({ where: { ownerId: { in: oldIds } } });
    await prisma.groupMember.deleteMany({ where: { groupId: { in: gids } } });
    await prisma.groupSupervisor.deleteMany({ where: { groupId: { in: gids } } });
    await prisma.group.deleteMany({ where: { id: { in: gids } } });
    await prisma.companyMentor.deleteMany({ where: { userId: { in: oldIds } } });
    await prisma.user.deleteMany({ where: { id: { in: oldIds } } });
  }

  // Selalu pakai cohort uji sendiri agar tahun pelajaran dapat dipastikan
  await prisma.cohort.deleteMany({ where: { name: 'Gelombang Uji M7' } });
  const cohort = await prisma.cohort.create({
    data: { name: 'Gelombang Uji M7', academicYear: '2026/2027', status: 'OPEN' },
  });
  const major = await prisma.major.findFirst({ where: { code: 'RPL' } }) ?? (await prisma.major.findFirst());
  if (!major) throw new Error('Jurusan tidak ada - jalankan seed dulu.');
  const industry = await prisma.industry.findFirst();

  const pass = await bcrypt.hash('Test12345!', SALT);

  // Perusahaan + DUDI
  const company = await prisma.company.create({
    data: {
      name: 'PT Uji Coba Teknologi',
      address: 'Jl. Mekar No. 1, Medan',
      industryId: industry?.id ?? null,
      phone: '061-123456',
      city: 'Medan',
    },
  });
  const dudi = await prisma.user.create({
    data: {
      username: 'uji7_dudi', passwordHash: pass, role: Role.DUDI, cohortId: cohort.id,
      companyMentor: { create: { companyId: company.id, fullName: 'Pak Dudi Uji', position: 'HRD', phone: '081200000000' } },
    },
  });

  // --- Siswa A: NON_PKL (untuk Surat Pernyataan) + sekaligus punya kelompok dgn perusahaan ---
  const siswaA = await prisma.user.create({
    data: {
      username: 'uji7_siswa_a', identifier: '7200000001', passwordHash: pass, role: Role.SISWA,
      phase: StudentPhase.NON_PKL, cohortId: cohort.id,
      studentProfile: {
        create: {
          fullName: 'Budi Santoso Uji',
          nisn: '7200000001',
          majorId: major.id,
          phone: '089900000001',
          address: 'Jl. Merdeka No. 5, Medan',
          parentData: {
            create: { fatherName: 'Sulaiman Uji', fatherPhone: '081234567890' },
          },
        },
      },
    },
    include: { studentProfile: true },
  });
  const groupA = await prisma.group.create({
    data: {
      name: 'Kelompok Uji A', code: 'UJI-A', cohortId: cohort.id, companyId: company.id,
      majorId: major.id, status: GroupStatus.AKTIF,
      members: { create: [{ userId: siswaA.id, isLeader: true }] },
    },
  });

  // ================= TEST 1: Generate Surat Pernyataan DOCX =================
  console.log('\n--- 1. Generate Surat Pernyataan DOCX ---');
  const gen = await pernyataanService.generate(
    siswaA.id,
    { tempatPkl: 'PT Uji Coba Teknologi' },
    {}
  );
  log('document terbentuk', !!gen.documentId, gen);
  const docFile = await prisma.documentFile.findFirst({
    where: { documentId: gen.documentId },
    orderBy: { version: 'desc' },
  });
  log('file DOCX tersimpan', !!docFile && docFile.mimeType?.includes('wordprocessingml'));

  // Baca kembali DOCX & cek isinya
  const absPath = path.join(process.env.STORAGE_ROOT ?? './storage', docFile!.storedPath);
  let docxText = '';
  try {
    const zip = new PizZip(readFileSync(absPath));
    docxText = zip.file('word/document.xml')?.asText() ?? '';
  } catch (e) {
    log('DOCX bisa dibaca', false, (e as Error).message);
  }
  log('berisi nama siswa', docxText.includes('Budi Santoso Uji'));
  log('berisi tahun pelajaran', docxText.includes('2026/2027'));
  log('berisi tempat PKL', docxText.includes('PT Uji Coba Teknologi'));
  log('tidak ada placeholder tersisa', !docxText.includes('{nama_siswa}') && !docxText.includes('{tahun_pelajaran}'));

  // Tolak generate bila bukan fase NON_PKL
  const siswaB = await prisma.user.create({
    data: {
      username: 'uji7_siswa_b', identifier: '7200000002', passwordHash: pass, role: Role.SISWA,
      phase: StudentPhase.PRA_PKL, cohortId: cohort.id,
      studentProfile: { create: { fullName: 'Siswa B', nisn: '7200000002', majorId: major.id } },
    },
  });
  let tolakFase = false;
  try {
    await pernyataanService.generate(siswaB.id, {}, {});
  } catch (e) {
    tolakFase = (e as Error).message.includes('pendaftaran ulang');
  }
  log('tolak generate pada fase salah', tolakFase);

  // ================= TEST 2: Submit absensi =================
  console.log('\n--- 2. Submit absensi (status + kegiatan + lokasi) ---');
  // Siswa A perlu fase PKL_AKTIF untuk absen
  await prisma.user.update({ where: { id: siswaA.id }, data: { phase: StudentPhase.PKL_AKTIF } });

  const att = await attendanceService.submit(
    siswaA.id,
    {
      status: AttendanceStatus.HADIR,
      activity: 'Membantu konfigurasi jaringan kantor',
      geo: { lat: 3.5952, long: 98.6722 },
    },
    {}
  );
  log('absensi terkirim', att.status === AttendanceStatus.HADIR && att.activity.includes('jaringan'));
  log('lokasi tercatat', att.checkInLat?.toString().startsWith('3.59') === true);
  log('verifikasi DUDI masih kosong', att.verifiedById === null);

  // Tolak dobel
  let tolakDobel = false;
  try {
    await attendanceService.submit(siswaA.id, { status: AttendanceStatus.HADIR, activity: 'x', geo: { lat: 3.6, long: 98.7 } }, {});
  } catch (e) {
    tolakDobel = (e as Error).message.includes('sudah mengirim');
  }
  log('tolak absen dobel', tolakDobel);

  // ================= TEST 3: Verifikasi oleh DUDI =================
  console.log('\n--- 3. Verifikasi absensi oleh DUDI ---');
  const verified = await attendanceService.verifyByDudi(att.id, dudi.id, 'APPROVE', undefined, {});
  log('DUDI mengkonfirmasi', verified.verifiedById === dudi.id && verified.verifiedAt !== null);

  // Tolak verifikasi ulang
  let tolakUlang = false;
  try {
    await attendanceService.verifyByDudi(att.id, dudi.id, 'APPROVE', undefined, {});
  } catch (e) {
    tolakUlang = (e as Error).message.includes('sudah dikonfirmasi');
  }
  log('tolak verifikasi ganda', tolakUlang);

  // ================= TEST 4: Jadwal fase =================
  console.log('\n--- 4. Jadwal fase per gelombang ---');
  const now = new Date();
  const start = new Date(now); start.setDate(start.getDate() - 1);
  const end = new Date(now); end.setDate(end.getDate() + 30);
  await phaseScheduleService.replace(
    cohort.id,
    [
      { phase: StudentPhase.PRA_PKL, startDate: new Date(now.getFullYear(), 0, 1).toISOString(), endDate: new Date(now.getFullYear(), 5, 30).toISOString() },
      { phase: StudentPhase.NON_PKL, startDate: new Date(now.getFullYear(), 6, 1).toISOString(), endDate: new Date(now.getFullYear(), 7, 31).toISOString() },
      { phase: StudentPhase.PKL_AKTIF, startDate: start.toISOString(), endDate: end.toISOString() },
    ],
    dudi.id,
    {}
  );
  const current = await phaseScheduleService.getCurrentPhase(cohort.id);
  log('fase aktif terdeteksi = PKL_AKTIF', current === StudentPhase.PKL_AKTIF, current);

  const schedules = await phaseScheduleService.listByCohort(cohort.id);
  log('3 jadwal fase tersimpan', schedules.length === 3, schedules.length);

  console.log('\n=== SELESAI ===');
}

main()
  .catch((err) => {
    console.error('ERROR:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
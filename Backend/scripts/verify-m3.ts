/**
 * Skrip verifikasi manual M3 (Fase 3: masa PKL aktif).
 * Langkah:
 *  - siapkan siswa PKL_AKTIF + kelompok + guru pembimbing
 *  - absensi: check-in, check-out, status hari ini, tolak dobel, tolak rapel/koordinat invalid
 *  - jurnal: buat, tolak duplikat, tolak tanggal lampau, catatan pembimbing
 *  - pengaduan: buat, balas (guru), tutup, kontrol akses
 *  - kunjungan: jadwalkan oleh pembimbing, tolak non-pembimbing, tandai selesai
 *
 * Jalankan: npx tsx scripts/verify-m3.ts
 */
import { PrismaClient, Role, StudentPhase, GroupStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const BASE = process.env.APP_URL ?? 'http://localhost:4000';
const SALT = 10;

const request = async (
  method: string,
  url: string,
  body?: unknown,
  token?: string
): Promise<{ status: number; json: any }> => {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${url}`, { method, headers, body: payload });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
};

const log = (label: string, ok: boolean, extra?: unknown) => {
  console.log(`${ok ? '✅' : '❌'} ${label}`, extra !== undefined ? JSON.stringify(extra) : '');
  if (!ok) process.exitCode = 1;
};

async function main() {
  console.log('=== VERIFIKASI M3 ===\n');

  const usernames = ['uji3_siswa', 'uji3_guru', 'uji3_guru2', 'uji3_admin'];
  // Bersihkan relasi dulu (Restrict FK pada visits.supervisor)
  const oldUsers = await prisma.user.findMany({ where: { username: { in: usernames } }, select: { id: true } });
  const oldIds = oldUsers.map((u) => u.id);
  if (oldIds.length > 0) {
    const oldGroups = await prisma.group.findMany({ where: { members: { some: { userId: { in: oldIds } } } }, select: { id: true } });
    const oldGroupIds = oldGroups.map((g) => g.id);
    await prisma.visit.deleteMany({ where: { OR: [{ supervisorId: { in: oldIds } }, { groupId: { in: oldGroupIds } }] } });
    await prisma.complaintReply.deleteMany({ where: { complaint: { authorId: { in: oldIds } } } });
    await prisma.complaint.deleteMany({ where: { authorId: { in: oldIds } } });
    await prisma.attendance.deleteMany({ where: { userId: { in: oldIds } } });
    await prisma.journal.deleteMany({ where: { userId: { in: oldIds } } });
    await prisma.group.deleteMany({ where: { id: { in: oldGroupIds } } });
    await prisma.user.deleteMany({ where: { id: { in: oldIds } } });
  }

  const cohort = await prisma.cohort.findFirst({ where: { deletedAt: null } });
  const major = await prisma.major.findFirst();
  if (!cohort || !major) throw new Error('Cohort/major tidak ada, jalankan seed.');

  const pass = await bcrypt.hash('Test12345!', SALT);

  // 1. Siapkan siswa fase PKL_AKTIF
  const siswa = await prisma.user.create({
    data: {
      username: 'uji3_siswa', identifier: '9100000001', passwordHash: pass, role: Role.SISWA,
      phase: StudentPhase.PKL_AKTIF, cohortId: cohort.id,
      studentProfile: { create: { fullName: 'Siswa M3', nisn: '9100000001', major: { connect: { id: major.id } } } },
    },
  });
  const guru = await prisma.user.create({
    data: {
      username: 'uji3_guru', identifier: '9100000002', passwordHash: pass, role: Role.GURU_PEMBIMBING,
      phase: StudentPhase.NON_PKL,
      teacherProfile: { create: { fullName: 'Guru M3', nip: '9100000002' } },
    },
  });
  const guru2 = await prisma.user.create({
    data: {
      username: 'uji3_guru2', identifier: '9100000003', passwordHash: pass, role: Role.GURU_PEMBIMBING,
      phase: StudentPhase.NON_PKL,
      teacherProfile: { create: { fullName: 'Guru Lain M3', nip: '9100000003' } },
    },
  });
  const admin = await prisma.user.create({
    data: { username: 'uji3_admin', passwordHash: pass, role: Role.ADMIN, phase: StudentPhase.NON_PKL },
  });

  // Kelompok aktif + siswa sebagai anggota + guru sebagai pembimbing
  const company = await prisma.company.create({ data: { name: 'PT M3 Testing', address: 'Jl. M3 No. 1' } });
  const group = await prisma.group.create({
    data: {
      name: 'Kelompok Uji M3', code: `GRP-M3-${Date.now()}`,
      cohort: { connect: { id: cohort.id } }, major: { connect: { id: major.id } },
      company: { connect: { id: company.id } }, status: GroupStatus.AKTIF,
      members: { create: [{ userId: siswa.id, isLeader: true }] },
      supervisors: { create: [{ userId: guru.id, isPrimary: true }] },
    },
  });
  log('Setup siswa PKL_AKTIF + kelompok + pembimbing', Boolean(group.id));

  // Login semua
  const loginS = await request('POST', '/api/auth/login', { identifier: 'uji3_siswa', password: 'Test12345!' });
  const tSiswa = loginS.json?.data?.tokens?.accessToken;
  const loginG = await request('POST', '/api/auth/login', { identifier: 'uji3_guru', password: 'Test12345!' });
  const tGuru = loginG.json?.data?.tokens?.accessToken;
  const loginG2 = await request('POST', '/api/auth/login', { identifier: 'uji3_guru2', password: 'Test12345!' });
  const tGuru2 = loginG2.json?.data?.tokens?.accessToken;
  const loginA = await request('POST', '/api/auth/login', { identifier: 'uji3_admin', password: 'Test12345!' });
  const tAdmin = loginA.json?.data?.tokens?.accessToken;
  log('Login siswa/guru/admin', Boolean(tSiswa && tGuru && tGuru2 && tAdmin), { s: loginS.status, g: loginG.status, a: loginA.status });

  // === ABSENSI ===
  const coords = { lat: -6.2, long: 106.8 };
  const today0 = await request('GET', '/api/attendances/today', undefined, tSiswa);
  log('GET /attendances/today (belum absen => null)', today0.status === 200 && today0.json?.data === null, { data: today0.json?.data });

  const badGeo = await request('POST', '/api/attendances/check-in', { lat: 200, long: 999 }, tSiswa);
  log('Tolak koordinat invalid (422)', badGeo.status === 422, { status: badGeo.status, msg: badGeo.json?.message });

  const checkIn = await request('POST', '/api/attendances/check-in', { ...coords, note: 'Tepat waktu' }, tSiswa);
  log('POST /attendances/check-in', checkIn.status === 201 && Boolean(checkIn.json?.data?.checkInAt), { status: checkIn.status });

  const dupIn = await request('POST', '/api/attendances/check-in', coords, tSiswa);
  log('Tolak check-in dobel', dupIn.status === 409, { status: dupIn.status, msg: dupIn.json?.message });

  const checkOut = await request('POST', '/api/attendances/check-out', { ...coords, note: 'Selesai' }, tSiswa);
  log('POST /attendances/check-out', checkOut.status === 200 && Boolean(checkOut.json?.data?.checkOutAt), { status: checkOut.status });

  const dupOut = await request('POST', '/api/attendances/check-out', coords, tSiswa);
  log('Tolak check-out dobel', dupOut.status === 409, { status: dupOut.status, msg: dupOut.json?.message });

  const today1 = await request('GET', '/api/attendances/today', undefined, tSiswa);
  log('GET /attendances/today (sudah absen)', today1.status === 200 && today1.json?.data?.status === 'HADIR');

  const hist = await request('GET', '/api/attendances/me', undefined, tSiswa);
  log('GET /attendances/me (riwayat)', hist.status === 200 && (hist.json?.data?.length ?? 0) >= 1);

  const summary = await request('GET', `/api/attendances/summary?groupId=${group.id}`, undefined, tAdmin);
  log('GET /attendances/summary (admin)', summary.status === 200 && Array.isArray(summary.json?.data), { data: summary.json?.data });

  // === JURNAL ===
  const jurnal = await request('POST', '/api/journals', { activity: 'Membuat modul absensi', result: 'Selesai', obstacles: 'Tidak ada' }, tSiswa);
  log('POST /journals', jurnal.status === 201 && Boolean(jurnal.json?.data?.id), { status: jurnal.status });
  const journalId = jurnal.json?.data?.id;

  const dupJurnal = await request('POST', '/api/journals', { activity: 'Duplikat' }, tSiswa);
  log('Tolak jurnal duplikat (1/hari)', dupJurnal.status === 409, { status: dupJurnal.status, msg: dupJurnal.json?.message });

  const backfill = await request('POST', '/api/journals', { activity: 'Rapel', date: '2020-01-01' }, tSiswa);
  log('Tolak jurnal tanggal lampau', backfill.status === 400, { status: backfill.status, msg: backfill.json?.message });

  const note = await request('POST', `/api/journals/${journalId}/supervisor-note`, { note: 'Bagus, tingkatkan.' }, tGuru);
  log('POST /journals/:id/supervisor-note (guru)', note.status === 200 && Boolean(note.json?.data?.supervisorNote), { status: note.status });

  const jurnalList = await request('GET', `/api/journals?groupId=${group.id}`, undefined, tGuru);
  log('GET /journals (guru filter grup)', jurnalList.status === 200 && (jurnalList.json?.data?.length ?? 0) >= 1);

  // === PENGADUAN ===
  const comp = await request('POST', '/api/complaints', { subject: 'Kendala transportasi', body: 'Saya kesulitan transportasi ke lokasi PKL.' }, tSiswa);
  log('POST /complaints', comp.status === 201 && Boolean(comp.json?.data?.id), { status: comp.status });
  const complaintId = comp.json?.data?.id;

  const reply = await request('POST', `/api/complaints/${complaintId}/replies`, { body: 'Kami akan bantu koordinasikan.' }, tGuru);
  log('POST /complaints/:id/replies (guru)', reply.status === 201 && (reply.json?.data?.replies?.length ?? 0) >= 1, { status: reply.status });

  const replyForbidden = await request('POST', `/api/complaints/${complaintId}/replies`, { body: 'Coba intrude' }, tGuru2);
  log('Tolak balasan guru non-pembimbing', replyForbidden.status === 403, { status: replyForbidden.status, msg: replyForbidden.json?.message });

  const detailForbidden = await request('GET', `/api/complaints/${complaintId}`, undefined, tGuru2);
  log('Tolak akses detail guru non-pembimbing', detailForbidden.status === 403, { status: detailForbidden.status });

  const close = await request('POST', `/api/complaints/${complaintId}/close`, undefined, tAdmin);
  log('POST /complaints/:id/close (admin)', close.status === 200 && close.json?.data?.status === 'SELESAI', { status: close.status });

  const replyClosed = await request('POST', `/api/complaints/${complaintId}/replies`, { body: 'Terlambat' }, tGuru);
  log('Tolak balasan pada pengaduan selesai', replyClosed.status === 400, { status: replyClosed.status, msg: replyClosed.json?.message });

  // === KUNJUNGAN ===
  const visit = await request('POST', '/api/visits', { groupId: group.id, scheduledAt: new Date(Date.now() + 86400000).toISOString(), note: 'Monitoring pertama' }, tGuru);
  log('POST /visits (guru pembimbing)', visit.status === 201 && Boolean(visit.json?.data?.id), { status: visit.status });
  const visitId = visit.json?.data?.id;

  const visitForbidden = await request('POST', '/api/visits', { groupId: group.id, scheduledAt: new Date().toISOString() }, tGuru2);
  log('Tolak jadwal kunjungan guru non-pembimbing', visitForbidden.status === 403, { status: visitForbidden.status, msg: visitForbidden.json?.message });

  const complete = await request('POST', `/api/visits/${visitId}/complete`, { note: 'Kunjungan selesai, lancar.' }, tGuru);
  log('POST /visits/:id/complete', complete.status === 200 && Boolean(complete.json?.data?.visitedAt), { status: complete.status });

  const myVisits = await request('GET', '/api/visits/me', undefined, tGuru);
  log('GET /visits/me (guru)', myVisits.status === 200 && (myVisits.json?.data?.length ?? 0) >= 1);

  console.log(`\n=== SELESAI (groupId=${group.id}) ===`);
}

main()
  .catch((e) => {
    console.error('Verifikasi gagal:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

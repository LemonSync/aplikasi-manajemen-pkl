/**
 * Skrip verifikasi manual M2 (bukan bagian test otomatis).
 * Membuat akun uji (siswa & admin), lalu menjalankan langkah-langkah:
 *  - login superadmin
 *  - buat akun siswa + admin (via prisma langsung)
 *  - siswa: simpan draft pendaftaran, submit (generate surat), cek dokumen
 *  - admin: list & approve pendaftaran, bentuk kelompok
 *
 * Jalankan: npx tsx scripts/verify-m2.ts
 */
import { PrismaClient, Role, StudentPhase } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const prisma = new PrismaClient();
const BASE = process.env.APP_URL ?? 'http://localhost:4000';
const SALT = 10;

let accessToken = '';
let adminToken = '';

const request = async (
  method: string,
  url: string,
  body?: unknown,
  token?: string,
  isForm = false
): Promise<{ status: number; json: any }> => {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body) {
    if (isForm) {
      payload = body as FormData;
    } else {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
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
  console.log('=== VERIFIKASI M2 ===\n');

  // 0. Bersihkan user uji lama
  const testUsernames = ['uji_siswa_1', 'uji_siswa_2', 'uji_siswa_3', 'uji_admin'];
  await prisma.user.deleteMany({ where: { username: { in: testUsernames } } });

  // Ambil cohort & major
  const cohort = await prisma.cohort.findFirst({ where: { deletedAt: null } });
  const major = await prisma.major.findFirst();
  if (!cohort || !major) throw new Error('Cohort/major tidak ada, jalankan seed.');

  // 1. Buat user uji
  const pass = await bcrypt.hash('Test12345!', SALT);
  const siswa1 = await prisma.user.create({
    data: {
      username: 'uji_siswa_1', identifier: '9000000001', passwordHash: pass, role: Role.SISWA,
      phase: StudentPhase.PRA_PKL, cohortId: cohort.id,
      studentProfile: { create: { fullName: 'Uji Siswa Satu', nisn: '9000000001', major: { connect: { id: major.id } } } },
    },
  });
  const siswa2 = await prisma.user.create({
    data: {
      username: 'uji_siswa_2', identifier: '9000000002', passwordHash: pass, role: Role.SISWA,
      phase: StudentPhase.PRA_PKL, cohortId: cohort.id,
      studentProfile: { create: { fullName: 'Uji Siswa Dua', nisn: '9000000002', major: { connect: { id: major.id } } } },
    },
  });
  const admin = await prisma.user.create({
    data: { username: 'uji_admin', passwordHash: pass, role: Role.ADMIN, phase: StudentPhase.NON_PKL },
  });
  log('Buat user uji', Boolean(siswa1.id && siswa2.id && admin.id));

  // 2. Login siswa
  const login1 = await request('POST', '/api/auth/login', { identifier: 'uji_siswa_1', password: 'Test12345!' });
  accessToken = login1.json?.data?.tokens?.accessToken;
  log('Login siswa', login1.status === 200 && Boolean(accessToken), { status: login1.status });

  const loginA = await request('POST', '/api/auth/login', { identifier: 'uji_admin', password: 'Test12345!' });
  adminToken = loginA.json?.data?.tokens?.accessToken;
  log('Login admin', loginA.status === 200 && Boolean(adminToken), { status: loginA.status });

  // 3. Lookups
  const lookups = await request('GET', '/api/master/lookups', undefined, accessToken);
  log('GET /master/lookups', lookups.status === 200 && Array.isArray(lookups.json?.data?.majors));

  // 4. Simpan draft pendaftaran
  const save = await request('POST', '/api/registrations', {
    groupName: 'Kelompok Uji M2',
    cohortId: cohort.id,
    majorId: major.id,
    companyName: 'PT Uji Teknologi',
    companyAddress: 'Jl. Testing No. 42, Jakarta',
    companyIndustry: 'Teknologi Informasi',
    companyPhone: '021999999',
    companyCity: 'Jakarta',
    members: [
      { fullName: 'Uji Siswa Satu', nisn: '9000000001', className: 'XII RPL 1', isLeader: true, userId: siswa1.id },
      { fullName: 'Uji Siswa Dua', nisn: '9000000002', className: 'XII RPL 1', isLeader: false, userId: siswa2.id },
    ],
  }, accessToken);
  log('POST /registrations (draft)', save.status === 201, { status: save.status, code: save.json?.data?.code, msg: save.json?.message, err: save.json?.errors });
  const regId = save.json?.data?.id;

  // 5. Submit -> generate surat
  const submit = await request('POST', `/api/registrations/${regId}/submit`, undefined, accessToken);
  log('POST /registrations/:id/submit (generate surat)', submit.status === 200, { status: submit.status, doc: submit.json?.data?.documentId });
  const docId = submit.json?.data?.documentId;

  // Cek fase siswa berubah ke NON_PKL
  const me = await request('GET', '/api/auth/me', undefined, accessToken);
  log('Fase siswa -> NON_PKL', me.json?.data?.phase === 'NON_PKL', { phase: me.json?.data?.phase });

  // Cek file PDF surat benar-benar ada & valid
  const file = await prisma.documentFile.findFirst({ where: { documentId: docId, isActive: true } });
  const pdfExists = file ? fs.existsSync(path.resolve(process.env.STORAGE_ROOT ?? './storage', file.storedPath)) : false;
  log('File PDF surat tersimpan di storage', pdfExists, { storedPath: file?.storedPath });

  // Download via API
  const dl = await fetch(`${BASE}/api/documents/${docId}/download`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const pdfBuf = Buffer.from(await dl.arrayBuffer());
  const isPdf = pdfBuf.slice(0, 5).toString() === '%PDF-';
  log('Download surat => PDF valid', dl.status === 200 && isPdf, { status: dl.status, bytes: pdfBuf.length, magic: pdfBuf.slice(0, 5).toString() });

  // 6. Admin: list & approve
  const listReg = await request('GET', '/api/registrations?status=DIAJUKAN', undefined, adminToken);
  log('GET /registrations (admin filter DIAJUKAN)', listReg.status === 200 && (listReg.json?.data?.length ?? 0) >= 1, { total: listReg.json?.meta?.total });

  const approve = await request('POST', `/api/registrations/${regId}/review`, { action: 'APPROVE' }, adminToken);
  log('POST /registrations/:id/review (approve)', approve.status === 200 && approve.json?.data?.status === 'DISETUJUI', { status: approve.status });

  // 7. Admin: bentuk kelompok dari pendaftaran
  const createGroup = await request('POST', '/api/groups', {
    name: 'Kelompok Uji M2',
    cohortId: cohort.id,
    majorId: major.id,
    registrationId: regId,
    memberUserIds: [siswa1.id, siswa2.id],
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 90 * 86400000).toISOString(),
  }, adminToken);
  log('POST /groups (bentuk kelompok)', createGroup.status === 201, { status: createGroup.status, code: createGroup.json?.data?.code });
  const groupId = createGroup.json?.data?.id;

  // 8. Cek validasi jurusan seragam: coba bentuk kelompok dengan jurusan berbeda
  const major2 = await prisma.major.findFirst({ where: { id: { not: major.id } } });
  const siswa3 = await prisma.user.create({
    data: {


      username: 'uji_siswa_3', identifier: '9000000003', passwordHash: pass, role: Role.SISWA, phase: StudentPhase.PRA_PKL, cohortId: cohort.id,
      studentProfile: { create: { fullName: 'Uji Siswa Tiga', nisn: '9000000003', major: { connect: { id: major2!.id } } } },
    },
  });
  const badGroup = await request('POST', '/api/groups', {
    name: 'Kelompok Beda Jurusan',
    cohortId: cohort.id,
    memberUserIds: [siswa1.id, siswa3.id],
  }, adminToken);
  log('Tolak kelompok beda jurusan', badGroup.status === 400, { status: badGroup.status, msg: badGroup.json?.message });

  // 9. Cek siswa sudah tergabung -> tidak bisa masuk kelompok lain lagi
  const dupGroup = await request('POST', '/api/groups', {
    name: 'Kelompok Duplikat',
    cohortId: cohort.id,
    memberUserIds: [siswa2.id],
  }, adminToken);
  log('Tolak anggota yang sudah tergabung', dupGroup.status === 409, { status: dupGroup.status, msg: dupGroup.json?.message });

  // 10. Siswa lihat kelompoknya
  const myGroups = await request('GET', '/api/groups/me', undefined, accessToken);
  log('GET /groups/me (siswa)', myGroups.status === 200 && (myGroups.json?.data?.length ?? 0) >= 1);

  // 11. Upload dokumen (surat penerimaan) oleh siswa - multipart
  const form = new FormData();
  form.append('type', 'SURAT_PENERIMAAN');
  form.append('title', 'Surat Penerimaan dari PT Uji Teknologi');
  form.append('file', new Blob([pdfBuf], { type: 'application/pdf' }), 'surat-penerimaan.pdf');
  const upload = await request('POST', '/api/documents', form, accessToken, true);
  log('POST /documents (upload surat penerimaan)', upload.status === 201, { status: upload.status });
  const uploadDocId = upload.json?.data?.documentId;

  // 12. Admin verifikasi dokumen
  const verify = await request('POST', `/api/documents/${uploadDocId}/verify`, { action: 'APPROVE' }, adminToken);
  log('POST /documents/:id/verify (approve)', verify.status === 200 && verify.json?.data?.status === 'DISETUJUI', { status: verify.status });

  // 13. Upload file berbahaya harus ditolak
  const badForm = new FormData();
  badForm.append('type', 'SURAT_PENERIMAAN');
  badForm.append('file', new Blob([Buffer.from('<?php echo 1; ?>')], { type: 'application/x-php' }), 'evil.php');
  const badUpload = await request('POST', '/api/documents', badForm, accessToken, true);
  log('Tolak upload file php', badUpload.status === 400, { status: badUpload.status, msg: badUpload.json?.message });

  console.log(`\n=== SELESAI (groupId=${groupId}) ===`);
}

main()
  .catch((e) => {
    console.error('Verifikasi gagal:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * Verifikasi alur Fase 1 → Fase 2 saat siswa GANTI PERUSAHAAN.
 *
 * Skenario (bug yang diperbaiki): siswa mendaftar ke perusahaan A, disetujui,
 * mengunduh surat permohonan, mengunggah Surat Penerimaan A, lalu menekan
 * "Berubah Pikiran — Ganti Perusahaan" dan memilih B. Surat A tidak boleh lagi
 * dihitung: keluar dari inbox, tidak bisa di-ACC, dan siswa tetap berada di
 * Fase 2 untuk mengunggah surat perusahaan B (bukan melompat ke fase berikutnya).
 *
 * Menulis data uji ke database (ditandai "UJI-RONDE") lalu dibersihkan lagi.
 * Jalankan: npx tsx scripts/verify-acceptance-rounds.ts
 */
import {
  CohortStatus,
  DocumentStatus,
  DocumentType,
  Role,
  StudentPhase,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { prisma } from '../src/config/prisma';

dotenv.config();

const SALT = 10;
const NISN = '9999999901';
const STUDENT_USERNAME = 'UJI-RONDE-SISWA';
const ADMIN_USERNAME = 'UJI-RONDE-ADMIN';

const log = (label: string, ok: boolean, extra?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`, extra !== undefined ? JSON.stringify(extra) : '');
  if (!ok) process.exitCode = 1;
};

const pdfBuffer = (tag: string) =>
  Buffer.concat([Buffer.from('%PDF-1.4\n', 'ascii'), Buffer.from(`uji ronde ${tag} `, 'utf8'), Buffer.alloc(512, 0x20)]);

const today = new Date();
const dayOffset = (days: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0);
  return d;
};

const created = {
  cohortId: '',
  companyIds: [] as string[],
  userIds: [] as string[],
  registrationIds: [] as string[],
  documentIds: [] as string[],
};

async function cleanup() {
  if (created.documentIds.length > 0) {
    await prisma.documentFile.deleteMany({ where: { documentId: { in: created.documentIds } } });
  }
  if (created.userIds.length > 0) {
    await prisma.document.deleteMany({ where: { ownerId: { in: created.userIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: created.userIds } } });
  }
  if (created.cohortId) {
    await prisma.generatedLetter.deleteMany({ where: { cohortId: created.cohortId } });
    await prisma.phaseSchedule.deleteMany({ where: { cohortId: created.cohortId } });
    await prisma.studentRegistry.deleteMany({ where: { cohortId: created.cohortId } });
  }
  if (created.registrationIds.length > 0) {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: created.registrationIds } } });
    await prisma.registration.deleteMany({ where: { id: { in: created.registrationIds } } });
  }
  await prisma.studentProfile.deleteMany({ where: { nisn: NISN } });
  if (created.userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  }
  if (created.companyIds.length > 0) {
    await prisma.company.deleteMany({ where: { id: { in: created.companyIds } } });
  }
  if (created.cohortId) {
    await prisma.cohort.deleteMany({ where: { id: created.cohortId } });
  }
}

async function main() {
  const { registrationService } = await import('../src/services/registration.service');
  const { documentService } = await import('../src/services/document.service');
  const { studentWorkflowService } = await import('../src/services/studentWorkflow.service');

  console.log('=== VERIFIKASI GANTI PERUSAHAAN (FASE 1-2) ===\n');

  await cleanup(); // bersihkan sisa run sebelumnya

  const cohort = await prisma.cohort.create({
    data: { name: `UJI-RONDE ${Date.now()}`, academicYear: '2026/2027', status: CohortStatus.OPEN },
  });
  created.cohortId = cohort.id;

  // Jadwal: hari ini berada di NON_PKL (Fase 2) sehingga siswa boleh mengunggah
  // surat penerimaan, dan fase efektif tidak boleh melampaui NON_PKL.
  await prisma.phaseSchedule.createMany({
    data: [
      { cohortId: cohort.id, phase: StudentPhase.PRA_PKL, startDate: dayOffset(-10), endDate: dayOffset(-3) },
      { cohortId: cohort.id, phase: StudentPhase.NON_PKL, startDate: dayOffset(-2), endDate: dayOffset(10) },
    ],
  });

  const companies = await Promise.all(
    ['PT UJI RONDE A', 'PT UJI RONDE B'].map((name) =>
      prisma.company.create({ data: { name, address: 'Jl. Uji No. 1', city: 'Kota Uji', quota: 5 } })
    )
  );
  created.companyIds = companies.map((c) => c.id);

  const passwordHash = await bcrypt.hash('Uji12345!', SALT);
  const student = await prisma.user.create({
    data: {
      username: STUDENT_USERNAME,
      identifier: NISN,
      passwordHash,
      role: Role.SISWA,
      phase: StudentPhase.PRA_PKL,
      cohortId: cohort.id,
      studentProfile: { create: { fullName: 'Siswa Uji Ronde', nisn: NISN } },
    },
    include: { studentProfile: true },
  });
  created.userIds.push(student.id);
  await prisma.studentRegistry.create({
    data: { nisn: NISN, fullName: 'Siswa Uji Ronde', className: 'XI UJI', cohortId: cohort.id },
  });

  const admin = await prisma.user.create({
    data: { username: ADMIN_USERNAME, passwordHash, role: Role.SUPER_ADMIN },
  });
  created.userIds.push(admin.id);

  const ctx = { ipAddress: '127.0.0.1', userAgent: 'verify-script' };
  const actor = { id: admin.id, role: Role.SUPER_ADMIN };

  // ---- Ronde 1: perusahaan A ----
  let draft = await registrationService.saveDraft(student.id, { companyId: companies[0].id });
  const regA = draft!.id;
  created.registrationIds.push(regA);
  await registrationService.submit(student.id, regA, ctx);
  await registrationService.review(regA, admin.id, Role.SUPER_ADMIN, 'APPROVE', undefined, 'UJI/A/1', ctx);

  const letterA = await prisma.document.findFirst({
    where: { registrationId: regA, type: DocumentType.SURAT_PERMOHONAN },
  });
  log('Surat permohonan A terbit', !!letterA);
  if (letterA) created.documentIds.push(letterA.id);

  await documentService.markPermohonanDownloaded(regA, student.id);

  const uploadA = await documentService.uploadDocument({
    ownerId: student.id,
    cohortId: cohort.id,
    type: DocumentType.SURAT_PENERIMAAN,
    file: {
      fieldname: 'file',
      originalname: 'surat-a.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      size: 0,
      buffer: pdfBuffer('A'),
      filename: 'surat-a.pdf',
      path: '',
      destination: '',
    } as Express.Multer.File,
    ctx,
  });
  created.documentIds.push(uploadA.documentId);
  const docA = await prisma.document.findUnique({ where: { id: uploadA.documentId } });
  log('Surat penerimaan A terikat pendaftaran A', docA?.registrationId === regA, { status: docA?.status });

  const statusBefore = await studentWorkflowService.getWorkflowStatus(student.id);
  log('Sebelum ganti: tercatat menunggu verifikasi', statusBefore.hasSuratPenerimaanPending === true, {
    status: statusBefore.suratPenerimaanStatus,
  });

  // ---- Siswa berubah pikiran → perusahaan B ----
  await registrationService.cancelAndChangeCompany(student.id, ctx);

  const docAAfter = await prisma.document.findUnique({ where: { id: uploadA.documentId } });
  log(
    'Surat penerimaan A dibatalkan otomatis',
    docAAfter?.status === DocumentStatus.TIDAK_BERLAKU,
    { status: docAAfter?.status }
  );
  const letterAAfter = letterA
    ? await prisma.document.findUnique({ where: { id: letterA.id } })
    : null;
  log(
    'Surat permohonan A ikut tidak berlaku',
    letterAAfter?.status === DocumentStatus.TIDAK_BERLAKU,
    { status: letterAAfter?.status }
  );

  const inbox = await documentService.list({ page: 1, perPage: 50, status: DocumentStatus.MENUNGGU_VERIFIKASI }, actor);
  log(
    'Surat A keluar dari antrian verifikasi admin',
    !inbox.items.some((d) => d.id === uploadA.documentId)
  );

  await expectRejected(`Admin me-ACC surat A yang sudah tidak berlaku`, () =>
    documentService.verify(uploadA.documentId, admin.id, Role.SUPER_ADMIN, 'APPROVE', 'acc', ctx)
  );

  const phaseAfterCancel = await prisma.user.findUnique({ where: { id: student.id }, select: { phase: true } });
  log('Fase siswa kembali ke PRA_PKL', phaseAfterCancel?.phase === StudentPhase.PRA_PKL);

  const statusBetween = await studentWorkflowService.getWorkflowStatus(student.id);
  log(
    'Status UI tidak lagi menganggap surat ada',
    statusBetween.hasSuratPenerimaan === false && statusBetween.hasSuratPenerimaanPending === false,
    { suratPenerimaanStatus: statusBetween.suratPenerimaanStatus }
  );

  // ---- Ronde 2: perusahaan B ----
  draft = await registrationService.saveDraft(student.id, { companyId: companies[1].id });
  await registrationService.submit(student.id, regA, ctx);
  await registrationService.review(regA, admin.id, Role.SUPER_ADMIN, 'APPROVE', undefined, 'UJI/B/1', ctx);

  const letterB = await prisma.document.findFirst({
    where: { registrationId: regA, type: DocumentType.SURAT_PERMOHONAN, status: { not: DocumentStatus.TIDAK_BERLAKU } },
  });
  log('Surat permohonan B diterbitkan (bukan surat A)', !!letterB && letterB!.id !== letterA?.id);
  if (letterB) created.documentIds.push(letterB.id);

  await documentService.markPermohonanDownloaded(regA, student.id);

  const uploadB = await documentService.uploadDocument({
    ownerId: student.id,
    cohortId: cohort.id,
    type: DocumentType.SURAT_PENERIMAAN,
    file: {
      fieldname: 'file',
      originalname: 'surat-b.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      size: 0,
      buffer: pdfBuffer('B'),
      filename: 'surat-b.pdf',
      path: '',
      destination: '',
    } as Express.Multer.File,
    ctx,
  });
  created.documentIds.push(uploadB.documentId);

  const statusPendingB = await studentWorkflowService.getWorkflowStatus(student.id);
  log(
    'Surat B dinilai terpisah dari surat A',
    statusPendingB.hasSuratPenerimaan === false && statusPendingB.hasSuratPenerimaanPending === true,
    { phase: statusPendingB.effectivePhase }
  );
  log('Fase siswa masih NON_PKL (belum melompat)', statusPendingB.effectivePhase === StudentPhase.NON_PKL);

  await documentService.verify(uploadB.documentId, admin.id, Role.SUPER_ADMIN, 'APPROVE', undefined, ctx);
  const statusApprovedB = await studentWorkflowService.getWorkflowStatus(student.id);
  log('Setelah ACC surat B: tercatat disetujui', statusApprovedB.hasSuratPenerimaan === true);

  // Siswa ganti perusahaan lagi saat surat B sudah DISETUJUI → harus diblokir.
  await expectRejected('Ganti perusahaan setelah surat disetujui ditolak', () =>
    registrationService.cancelAndChangeCompany(student.id, ctx)
  );
}

/** Jalankan `fn`; lulus bila ia menolak dengan error. */
async function expectRejected(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    log(label, false, 'tidak menolak');
  } catch (error) {
    log(label, true, (error as Error).message);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    console.log('\nData uji dibersihkan.');
  });

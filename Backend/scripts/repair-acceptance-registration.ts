/**
 * Perbaikan data: Surat Penerimaan / Surat Permohonan yang terikat pada ronde
 * pendaftaran yang sudah ditinggalkan (siswa menekan "Berubah Pikiran — Ganti
 * Perusahaan" lalu memilih perusahaan lain).
 *
 * Sebelum perbaikan ini, dokumen tidak terikat ke pendaftaran dan baris
 * Registration dipakai ulang, sehingga surat dari perusahaan lama ikut dinilai
 * untuk perusahaan baru: admin melihat dua antrian, dan setelah keduanya
 * di-ACC siswa langsung melompat ke fase berikutnya tanpa mengunggah surat
 * perusahaan baru.
 *
 * Yang dilakukan (idempoten):
 *  1. Ikatkan Surat Penerimaan lama (registrationId null) ke pendaftaran yang
 *     benar — dibedakan lewat cohortId dokumen.
 *  2. Tandai TIDAK_BERLAKU surat (penerimaan & permohonan) yang diunggah/dibuat
 *     SEBELUM pembatalan terakhir pendaftarannya (audit CANCEL_REGISTRATION).
 *  3. Turunkan fase siswa yang terlanjur maju karena surat ronde lama, agar
 *     mereka mengunggah ulang surat perusahaan yang sekarang.
 *
 * Jalankan:
 *   npx tsx scripts/repair-acceptance-registration.ts            # dry-run (default)
 *   npx tsx scripts/repair-acceptance-registration.ts --apply    # terapkan
 */
import { DocumentStatus, DocumentType, RegistrationStatus, StudentPhase } from '@prisma/client';
import dotenv from 'dotenv';
import { prisma } from '../src/config/prisma';

dotenv.config();

const APPLY = process.argv.includes('--apply');
const CANCEL_ACTION = 'CANCEL_REGISTRATION';

/** Urutan fase — sama dengan PHASE_ORDER di src/config/constants. */
const PHASE_ORDER: Record<StudentPhase, number> = {
  [StudentPhase.PRA_PKL]: 0,
  [StudentPhase.NON_PKL]: 1,
  [StudentPhase.PKL_AKTIF]: 2,
  [StudentPhase.PKL_SELESAI]: 3,
};

interface Plan {
  documentId: string;
  student: string;
  action: 'BIND' | 'INVALIDATE';
  detail: string;
}

const plans: Plan[] = [];
const phaseChanges: { student: string; from: StudentPhase; to: StudentPhase }[] = [];

const log = (msg: string) => console.log(msg);

/** Waktu unggah dokumen = file aktif terbaru, fallback ke createdAt dokumen. */
const uploadTime = (doc: { createdAt: Date; files: { createdAt: Date }[] }): Date =>
  doc.files[0]?.createdAt ?? doc.createdAt;

async function main() {
  log(APPLY ? '=== MODE TERAPAN (menulis ke database) ===' : '=== MODE DRY-RUN (tidak ada perubahan) ===');

  const registrations = await prisma.registration.findMany({
    where: { deletedAt: null, student: { role: 'SISWA' } },
    select: {
      id: true,
      studentId: true,
      cohortId: true,
      status: true,
      permohonanDownloadedAt: true,
      student: {
        select: { username: true, phase: true, studentProfile: { select: { fullName: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  for (const reg of registrations) {
    const label = `${reg.student.username}${reg.student.studentProfile?.fullName ? ` (${reg.student.studentProfile.fullName})` : ''}`;

    const cancels = await prisma.auditLog.findMany({
      where: { entityId: reg.id, action: CANCEL_ACTION },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const lastCancel = cancels.length > 0 ? cancels[cancels.length - 1].createdAt : null;

    // --- 1+2. Surat Penerimaan milik siswa pada gelombang pendaftaran ini ---
    const acceptance = await prisma.document.findMany({
      where: {
        ownerId: reg.studentId,
        cohortId: reg.cohortId,
        type: DocumentType.SURAT_PENERIMAAN,
        status: { not: DocumentStatus.TIDAK_BERLAKU },
        OR: [{ registrationId: reg.id }, { registrationId: null }],
      },
      include: { files: { where: { isActive: true }, orderBy: { version: 'desc' }, take: 1 } },
    });

    let currentApproved = false;
    for (const doc of acceptance) {
      const stale = lastCancel !== null && uploadTime(doc) < lastCancel;
      if (stale) {
        plans.push({
          documentId: doc.id,
          student: label,
          action: 'INVALIDATE',
          detail: `Surat Penerimaan ${doc.status} (diunggah ${uploadTime(doc).toISOString()}) lebih lama daripada ganti perusahaan terakhir (${lastCancel.toISOString()})`,
        });
        if (APPLY) {
          await prisma.document.update({
            where: { id: doc.id },
            data: {
              status: DocumentStatus.TIDAK_BERLAKU,
              note: 'Tidak berlaku — dibatalkan sistem: siswa sudah mengganti perusahaan (perbaikan data)',
            },
          });
        }
      } else if (!doc.registrationId) {
        plans.push({
          documentId: doc.id,
          student: label,
          action: 'BIND',
          detail: `Surat Penerimaan ${doc.status} diikat ke pendaftaran ${reg.id}`,
        });
        if (APPLY) {
          await prisma.document.update({ where: { id: doc.id }, data: { registrationId: reg.id } });
        }
        if (doc.status === DocumentStatus.DISETUJUI) currentApproved = true;
      } else if (doc.status === DocumentStatus.DISETUJUI) {
        currentApproved = true;
      }
    }

    // --- Surat Permohonan ronde lama (dibuat sebelum ganti perusahaan) ---
    const letters = await prisma.document.findMany({
      where: {
        registrationId: reg.id,
        type: DocumentType.SURAT_PERMOHONAN,
        status: { not: DocumentStatus.TIDAK_BERLAKU },
      },
      orderBy: { createdAt: 'asc' },
    });
    let currentLetter = false;
    for (const letter of letters) {
      if (lastCancel !== null && letter.createdAt < lastCancel) {
        plans.push({
          documentId: letter.id,
          student: label,
          action: 'INVALIDATE',
          detail: `Surat Permohonan lama (terbit ${letter.createdAt.toISOString()}) tidak berlaku untuk perusahaan yang sekarang`,
        });
        if (APPLY) {
          await prisma.document.update({
            where: { id: letter.id },
            data: {
              status: DocumentStatus.TIDAK_BERLAKU,
              note: 'Tidak berlaku — dibatalkan sistem: siswa sudah mengganti perusahaan (perbaikan data)',
            },
          });
        }
      } else {
        currentLetter = true;
      }
    }

    if (APPLY && !currentLetter && reg.permohonanDownloadedAt) {
      await prisma.registration.update({ where: { id: reg.id }, data: { permohonanDownloadedAt: null } });
    }

    // --- 3. Fase siswa yang terlanjur maju ---
    if (lastCancel && PHASE_ORDER[reg.student.phase] > PHASE_ORDER[StudentPhase.PRA_PKL]) {
      const target =
        reg.status === RegistrationStatus.DISETUJUI && currentLetter && !currentApproved
          ? StudentPhase.NON_PKL
          : StudentPhase.PRA_PKL;
      if (PHASE_ORDER[reg.student.phase] > PHASE_ORDER[target]) {
        phaseChanges.push({ student: label, from: reg.student.phase, to: target });
        if (APPLY) {
          await prisma.user.update({ where: { id: reg.studentId }, data: { phase: target } });
        }
      }
    }
  }

  log('');
  log(`Dokumen yang akan diperbaiki: ${plans.length}`);
  for (const p of plans) {
    log(`  [${p.action}] ${p.student} ${p.documentId} — ${p.detail}`);
  }
  log('');
  log(`Fase siswa yang akan diturunkan: ${phaseChanges.length}`);
  for (const c of phaseChanges) {
    log(`  ${c.student}: ${c.from} -> ${c.to}`);
  }
  log('');
  if (!APPLY) {
    log('Dry-run selesai. Tambahkan --apply untuk menerapkan.');
    return;
  }
  log('Perbaikan data selesai diterapkan.');
  log('Catatan: siswa yang kehilangan Surat Permohonan perlu surat baru — Admin membuka');
  log('menu Pendaftaran, klik Setujui sekali lagi pada pendaftaran tersebut untuk');
  log('menerbitkan surat ke perusahaan yang sekarang.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

import { AttendanceStatus, Role, StudentPhase } from '@prisma/client';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';
import { notificationService } from '../services/notification.service';

/**
 * Cron job: auto-close absensi yang belum check-out.
 * Dijalankan setiap hari setelah jam PKL selesai (misal 17:00 WIB).
 */
export const autoCloseAttendance = async (): Promise<void> => {
  try {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const cutoff = new Date(`${today}T17:00:00+07:00`);

    if (new Date() < cutoff) return; // belum waktunya

    const openAttendances = await prisma.attendance.findMany({
      where: {
        date: new Date(`${today}T00:00:00+07:00`),
        checkOutAt: null,
        checkInAt: { not: null },
      },
    });

    for (const att of openAttendances) {
      await prisma.attendance.update({
        where: { id: att.id },
        data: { checkOutAt: cutoff },
      });
    }

    if (openAttendances.length > 0) {
      logger.info(`Auto-close: ${openAttendances.length} absensi ditutup otomatis`);
    }
  } catch (err) {
    logger.error('Gagal auto-close absensi', { error: (err as Error).message });
  }
};

/**
 * Cron job: hapus refresh token yang sudah expired.
 */
export const cleanupExpiredTokens = async (): Promise<void> => {
  try {
    const result = await prisma.refreshToken.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
        revokedAt: null,
      },
    });
    if (result.count > 0) {
      logger.info(`Cleanup: ${result.count} expired refresh tokens dihapus`);
    }
  } catch (err) {
    logger.error('Gagal cleanup expired tokens', { error: (err as Error).message });
  }
};

/**
 * Cron job: archive gelombang yang sudah lewat endDate.
 */
export const autoArchiveCohorts = async (): Promise<void> => {
  try {
    const now = new Date();
    const result = await prisma.cohort.updateMany({
      where: {
        status: 'CLOSED',
        endDate: { lt: now },
      },
      data: { status: 'ARCHIVED' },
    });
    if (result.count > 0) {
      logger.info(`Archive: ${result.count} gelombang diarsipkan otomatis`);
    }
  } catch (err) {
    logger.error('Gagal auto-archive cohorts', { error: (err as Error).message });
  }
};

/**
 * Cron job: catat Alpha otomatis untuk siswa yang tidak presensi.
 *
 * Aturan:
 *  - Siswa fase PKL_AKTIF (deletedAt null) dengan rentang tanggal dalam
 *    jadwal fase PKL (PhaseSchedule) gelombangnya.
 *  - Hari Minggu dilewati (libur).
 *  - Lookback 7 hari agar server sempat mati pun tetap terisi.
 *  - Baris ALPHA dibuat dengan verifiedAt terisi (tercatat otomatis,
 *    tanpa verifikasi pembimbing — konsisten dengan Alpha manual).
 *  - Notifikasi in-app dikirim ke siswa + guru pembimbing.
 */
export const autoRecordMissedAttendance = async (): Promise<void> => {
  try {
    const todayKey = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

    // Kunci tanggal YYYY-MM-DD (Sen–Sab; Minggu libur), dari kemarin mundur 7 hari.
    const dayKeys: string[] = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(`${todayKey}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - i);
      if (d.getUTCDay() === 0) continue; // Minggu libur
      dayKeys.push(d.toISOString().slice(0, 10));
    }
    if (dayKeys.length === 0) return;
    const oldestKey = dayKeys[dayKeys.length - 1];

    const students = await prisma.user.findMany({
      where: { role: Role.SISWA, phase: StudentPhase.PKL_AKTIF, deletedAt: null, cohortId: { not: null } },
      select: {
        id: true,
        cohortId: true,
        studentProfile: { select: { fullName: true } },
      },
    });
    if (students.length === 0) return;

    // Rentang fase PKL per gelombang — hanya tanggal di dalam rentang yang diisi.
    const schedules = await prisma.phaseSchedule.findMany({
      where: { phase: StudentPhase.PKL_AKTIF },
      select: { cohortId: true, startDate: true, endDate: true },
    });
    const schedByCohort = new Map(schedules.map((s) => [s.cohortId, s]));

    // Absensi yang sudah ada dalam rentang lookback.
    const existing = await prisma.attendance.findMany({
      where: { userId: { in: students.map((s) => s.id) }, date: { gte: new Date(`${oldestKey}T00:00:00Z`) } },
      select: { userId: true, date: true },
    });
    const existingSet = new Set(existing.map((e) => `${e.userId}|${e.date.toISOString().slice(0, 10)}`));

    const missing: Array<{ userId: string; cohortId: string; fullName: string; dayKey: string }> = [];
    for (const s of students) {
      const sched = s.cohortId ? schedByCohort.get(s.cohortId) : undefined;
      for (const key of dayKeys) {
        if (sched?.startDate && key < sched.startDate.toISOString().slice(0, 10)) continue;
        if (sched?.endDate && key > sched.endDate.toISOString().slice(0, 10)) continue;
        if (existingSet.has(`${s.id}|${key}`)) continue;
        missing.push({ userId: s.id, cohortId: s.cohortId!, fullName: s.studentProfile?.fullName ?? 'Siswa', dayKey: key });
      }
    }
    if (missing.length === 0) return;

    await prisma.attendance.createMany({
      data: missing.map((m) => ({
        userId: m.userId,
        date: new Date(`${m.dayKey}T00:00:00Z`),
        status: AttendanceStatus.ALPHA,
        activity: 'Otomatis: tidak ada presensi',
        verifiedAt: new Date(), // tercatat otomatis — tanpa verifikasi pembimbing
      })),
      skipDuplicates: true, // aman dari double-run (unique userId+date)
    });

    // Notifikasi ke siswa + kumpulkan per guru pembimbing.
    const fmt = (key: string): string =>
      new Date(`${key}T00:00:00Z`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

    for (const m of missing) {
      await notificationService.create(
        m.userId,
        'Presensi Tercatat Otomatis (Alpha)',
        `Anda tidak mengirim presensi pada ${fmt(m.dayKey)} sehingga otomatis dicatat Alpha. Hubungi Guru Pembimbing bila ada kekeliruan.`,
        'ATTENDANCE',
        '/absensi'
      );
    }

    const studentIds = [...new Set(missing.map((m) => m.userId))];
    const links = await prisma.studentSupervisor.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, supervisorId: true },
    });
    const supervisorByStudent = new Map(links.map((l) => [l.studentId, l.supervisorId]));

    const bySupervisor = new Map<string, Array<{ fullName: string; dayKey: string }>>();
    for (const m of missing) {
      const sup = supervisorByStudent.get(m.userId);
      if (!sup) continue;
      const list = bySupervisor.get(sup) ?? [];
      list.push({ fullName: m.fullName, dayKey: m.dayKey });
      bySupervisor.set(sup, list);
    }
    for (const [supId, list] of bySupervisor) {
      const uniqueDays = [...new Set(list.map((x) => x.dayKey))].sort();
      const names = [...new Set(list.map((x) => x.fullName))];
      const dayLabel = uniqueDays.map(fmt).join(', ');
      await notificationService.create(
        supId,
        'Siswa Tidak Presensi',
        `${names.length} siswa bimbingan tidak presensi pada ${dayLabel} dan otomatis dicatat Alpha: ${names.join(', ')}.`,
        'ATTENDANCE',
        '/guru/absensi'
      );
    }

    logger.info(`Auto-Alpha: ${missing.length} absensi tercatat otomatis untuk ${studentIds.length} siswa`);
  } catch (err) {
    logger.error('Gagal auto-catat absensi Alpha', { error: (err as Error).message });
  }
};

/**
 * Semua cron jobs — dipanggil dari scheduler.
 */
export const runAllJobs = async (): Promise<void> => {
  await autoCloseAttendance();
  await cleanupExpiredTokens();
  await autoArchiveCohorts();
  await autoRecordMissedAttendance();
};

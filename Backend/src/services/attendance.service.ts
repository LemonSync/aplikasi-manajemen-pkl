import { Attendance, AttendanceStatus, Prisma, Role } from '@prisma/client';
import { attendanceRepository } from '../repositories/attendance.repository';
import { auditService } from './audit.service';
import { BadRequestError, ConflictError, NotFoundError } from '../errors/AppError';
import { AUDIT_ACTIONS, ENTITY_TYPES, MESSAGES } from '../config/constants';
import { startOfToday } from '../utils/date';
import { prisma } from '../config/prisma';

export interface GeoInput {
  lat: number;
  long: number;
  note?: string | null;
}

export interface SubmitAttendanceInput {
  status: AttendanceStatus;
  activity: string;
  geo: GeoInput;
}

/**
 * Service absensi harian (Fase 3).
 *
 * Model alur resmi sekolah:
 *  - Siswa mengirim 1 absensi per hari berisi: status kehadiran
 *    (Hadir/Alpha/Sakit/Izin) + pelaksanaan kegiatan + lokasi GPS saat kirim.
 *  - Tidak bisa dirapel: tanggal harus hari ini (server-side), immutable.
 *  - Absensi dikonfirmasi (diverifikasi) oleh guru pembimbing siswa.
 *
 * Catatan: endpoint check-in/check-out lama tetap dipertahankan sebagai
 * fitur tambahan (timer harian).
 */
export class AttendanceService {
  private validateGeo(geo: GeoInput): void {
    if (
      typeof geo.lat !== 'number' ||
      typeof geo.long !== 'number' ||
      Number.isNaN(geo.lat) ||
      Number.isNaN(geo.long) ||
      geo.lat < -90 ||
      geo.lat > 90 ||
      geo.long < -180 ||
      geo.long > 180
    ) {
      throw new BadRequestError(MESSAGES.ATTENDANCE.INVALID_LOCATION);
    }
  }

  /**
   * Deteksi anomali sederhana (heuristik). Dapat dikembangkan dengan data historis.
   * Saat ini: koordinat (0,0) atau nilai ekstrem dianggap anomali.
   */
  private detectAnomaly(geo: GeoInput): { isAnomaly: boolean; note: string | null } {
    if (Math.abs(geo.lat) < 0.0001 && Math.abs(geo.long) < 0.0001) {
      return { isAnomaly: true, note: 'Koordinat mendekati (0,0) - kemungkinan GPS palsu/tidak valid' };
    }
    return { isAnomaly: false, note: null };
  }

  /**
   * Kirim absensi harian (model baru: status + pelaksanaan kegiatan + lokasi).
   * Satu siswa satu record per hari; tidak bisa diperbarui hari ini.
   */
  async submit(
    userId: string,
    input: SubmitAttendanceInput,
    ctx: { ipAddress?: string; userAgent?: string }
  ): Promise<Attendance> {
    this.validateGeo(input.geo);
    const date = startOfToday();

    const existing = await attendanceRepository.findByUserAndDate(userId, date);
    if (existing) {
      throw new ConflictError('Anda sudah mengirim absensi hari ini. Absensi tidak dapat diubah.');
    }

    const anomaly = this.detectAnomaly(input.geo);
    const now = new Date();

    const record = await attendanceRepository.create({
      user: { connect: { id: userId } },
      date,
      status: input.status,
      activity: input.activity,
      checkInAt: now,
      checkInLat: new Prisma.Decimal(input.geo.lat),
      checkInLong: new Prisma.Decimal(input.geo.long),
      checkInNote: input.geo.note ?? null,
      isAnomaly: anomaly.isAnomaly,
      anomalyNote: anomaly.note,
    });

    // NOTE: Transisi fase ke PKL_AKTIF TIDAK dilakukan di sini lagi.
    // Fase siswa sekarang ditentukan oleh jadwal fase (PhaseSchedule).
    // Ketika masa PKL_AKTIF dimulai, StudentWorkflowService akan menyinkronkan
    // User.phase siswa secara otomatis.

    await auditService.record({
      actorId: userId,
      action: AUDIT_ACTIONS.CHECK_IN,
      entityType: ENTITY_TYPES.ATTENDANCE,
      entityId: record.id,
      metadata: {
        status: input.status,
        activity: input.activity.slice(0, 200),
        lat: input.geo.lat,
        long: input.geo.long,
        isAnomaly: anomaly.isAnomaly,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return record;
  }

  /**
   * Konfirmasi absensi oleh guru pembimbing.
   * Hanya guru yang membimbing siswa terkait yang boleh konfirmasi
   * (admin/kapala sekolah bebas).
   */
  async verify(
    attendanceId: string,
    actor: { id: string; role: string },
    action: 'APPROVE' | 'REJECT',
    note: string | undefined,
    ctx: { ipAddress?: string; userAgent?: string }
  ): Promise<Attendance> {
    const record = await attendanceRepository.findById(attendanceId);
    if (!record) throw new NotFoundError(MESSAGES.NOT_FOUND);
    if (record.verifiedById) throw new ConflictError('Absensi sudah dikonfirmasi sebelumnya');

    if (actor.role === Role.GURU_PEMBIMBING) {
      const link = await prisma.studentSupervisor.findUnique({
        where: { studentId: record.userId },
        select: { supervisorId: true },
      });
      if (link?.supervisorId !== actor.id) throw new BadRequestError(MESSAGES.SCOPE);
    }

    if (action === 'REJECT' && !note) {
      throw new BadRequestError('Alasan penolakan wajib diisi');
    }

    const updated = await attendanceRepository.update(attendanceId, {
      verifiedBy: { connect: { id: actor.id } },
      verifiedAt: new Date(),
      // Penolakan dicatat di anomalyNote; baris tetap ada untuk transparansi
      anomalyNote: action === 'REJECT' ? `Ditolak pembimbing: ${note}` : record.anomalyNote,
    });

    await auditService.record({
      actorId: actor.id,
      action: action === 'APPROVE' ? AUDIT_ACTIONS.VERIFY_DOCUMENT : AUDIT_ACTIONS.REJECT,
      entityType: ENTITY_TYPES.ATTENDANCE,
      entityId: attendanceId,
      metadata: { action, note, studentId: record.userId },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return updated;
  }

  /** ID siswa yang dibimbing guru (untuk scope daftar/ringkasan). */
  private async supervisedStudentIds(userId: string): Promise<string[]> {
    const links = await prisma.studentSupervisor.findMany({
      where: { supervisorId: userId },
      select: { studentId: true },
    });
    return links.map((l) => l.studentId);
  }

  /** Check-in hari ini. */
  async checkIn(userId: string, geo: GeoInput, ctx: { ipAddress?: string; userAgent?: string }): Promise<Attendance> {
    this.validateGeo(geo);
    const date = startOfToday();

    const existing = await attendanceRepository.findByUserAndDate(userId, date);
    if (existing?.checkInAt) {
      throw new ConflictError(MESSAGES.ATTENDANCE.ALREADY_CHECKED_IN);
    }

    const anomaly = this.detectAnomaly(geo);
    const now = new Date();

    const record = existing
      ? await attendanceRepository.update(existing.id, {
          status: AttendanceStatus.HADIR,
          checkInAt: now,
          checkInLat: new Prisma.Decimal(geo.lat),
          checkInLong: new Prisma.Decimal(geo.long),
          checkInNote: geo.note ?? null,
          isAnomaly: anomaly.isAnomaly,
          anomalyNote: anomaly.note,
        })
      : await attendanceRepository.create({
          user: { connect: { id: userId } },
          date,
          status: AttendanceStatus.HADIR,
          checkInAt: now,
          checkInLat: new Prisma.Decimal(geo.lat),
          checkInLong: new Prisma.Decimal(geo.long),
          checkInNote: geo.note ?? null,
          isAnomaly: anomaly.isAnomaly,
          anomalyNote: anomaly.note,
        });

    // NOTE: Transisi fase ke PKL_AKTIF TIDAK dilakukan di sini lagi.
    // Fase siswa sekarang ditentukan oleh jadwal fase (PhaseSchedule).

    await auditService.record({
      actorId: userId,
      action: AUDIT_ACTIONS.CHECK_IN,
      entityType: ENTITY_TYPES.ATTENDANCE,
      entityId: record.id,
      metadata: { lat: geo.lat, long: geo.long, isAnomaly: anomaly.isAnomaly },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return record;
  }

  /** Check-out hari ini. */
  async checkOut(userId: string, geo: GeoInput, ctx: { ipAddress?: string; userAgent?: string }): Promise<Attendance> {
    this.validateGeo(geo);
    const date = startOfToday();
    const existing = await attendanceRepository.findByUserAndDate(userId, date);
    if (!existing?.checkInAt) {
      throw new BadRequestError(MESSAGES.ATTENDANCE.NOT_CHECKED_IN);
    }
    if (existing.checkOutAt) {
      throw new ConflictError(MESSAGES.ATTENDANCE.ALREADY_CHECKED_OUT);
    }

    const anomaly = this.detectAnomaly(geo);
    const record = await attendanceRepository.update(existing.id, {
      checkOutAt: new Date(),
      checkOutLat: new Prisma.Decimal(geo.lat),
      checkOutLong: new Prisma.Decimal(geo.long),
      checkOutNote: geo.note ?? null,
      isAnomaly: existing.isAnomaly || anomaly.isAnomaly,
      anomalyNote: existing.anomalyNote ?? anomaly.note,
    });

    await auditService.record({
      actorId: userId,
      action: AUDIT_ACTIONS.CHECK_OUT,
      entityType: ENTITY_TYPES.ATTENDANCE,
      entityId: record.id,
      metadata: { lat: geo.lat, long: geo.long },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return record;
  }

  /** Status absensi hari ini untuk siswa (dipakai UI tombol check-in/out). */
  async today(userId: string): Promise<Attendance | null> {
    return attendanceRepository.findByUserAndDate(userId, startOfToday());
  }

  /** Riwayat absensi milik siswa. */
  async myHistory(userId: string, params: { page: number; perPage: number }) {
    return attendanceRepository.paginate(
      { userId },
      (params.page - 1) * params.perPage,
      params.perPage
    );
  }

  /** Daftar absensi (admin/guru) dengan filter. Guru: scope siswa bimbingan. */
  async list(
    params: {
      page: number;
      perPage: number;
      userId?: string;
      status?: AttendanceStatus;
      from?: string;
      to?: string;
    },
    actor?: { id: string; role: string }
  ) {
    const where: Prisma.AttendanceWhereInput = {
      ...(params.userId ? { userId: params.userId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.from || params.to
        ? {
            date: {
              ...(params.from ? { gte: new Date(params.from) } : {}),
              ...(params.to ? { lte: new Date(params.to) } : {}),
            },
          }
        : {}),
    };

    if (actor && actor.role === Role.GURU_PEMBIMBING) {
      const ids = await this.supervisedStudentIds(actor.id);
      if (params.userId) {
        if (!ids.includes(params.userId)) throw new BadRequestError(MESSAGES.SCOPE);
      } else if (ids.length === 0) {
        return { items: [], total: 0 };
      } else {
        where.userId = { in: ids };
      }
    }

    return attendanceRepository.paginate(where, (params.page - 1) * params.perPage, params.perPage);
  }

  /**
   * Monitoring admin: absensi dikelompokkan kelas → siswa.
   * Nama kelas diambil dari relasi profil (Class) dan difallback ke data
   * master siswa (StudentRegistry.className). Setiap record memuat koordinat
   * GPS (checkInLat/Long, checkOutLat/Long) sehingga admin/guru bisa melihat
   * lokasi presensi siswa.
   */
  async listByClass(
    params: { from?: string; to?: string; status?: AttendanceStatus; cohortId?: string },
    actor?: { id: string; role: string }
  ): Promise<{
    classes: Array<{
      className: string;
      studentCount: number;
      students: Array<{
        userId: string;
        username: string;
        fullName: string;
        nisn: string | null;
        total: number;
        counts: Record<string, number>;
        records: Attendance[];
      }>;
    }>;
    total: number;
  }> {
    const where: Prisma.AttendanceWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.cohortId ? { user: { cohortId: params.cohortId } } : {}),
      ...(params.from || params.to
        ? {
            date: {
              ...(params.from ? { gte: new Date(params.from) } : {}),
              ...(params.to ? { lte: new Date(params.to) } : {}),
            },
          }
        : {}),
    };

    if (actor && actor.role === Role.GURU_PEMBIMBING) {
      const ids = await this.supervisedStudentIds(actor.id);
      if (ids.length === 0) return { classes: [], total: 0 };
      where.userId = { in: ids };
    }

    const rows = await prisma.attendance.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: {
        user: {
          select: {
            id: true,
            username: true,
            studentProfile: {
              select: {
                fullName: true,
                nisn: true,
                class: { select: { name: true } },
                major: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    // Fallback nama kelas dari master siswa (NISN unik global)
    const nisns = [...new Set(rows.map((r) => r.user.studentProfile?.nisn).filter((n): n is string => !!n))];
    const registryRows = nisns.length
      ? await prisma.studentRegistry.findMany({ where: { nisn: { in: nisns } }, select: { nisn: true, className: true } })
      : [];
    const registryClass = new Map(registryRows.map((r) => [r.nisn, r.className]));

    const classMap = new Map<
      string,
      Map<
        string,
        { userId: string; username: string; fullName: string; nisn: string | null; total: number; counts: Record<string, number>; records: Attendance[] }
      >
    >();

    for (const row of rows) {
      const profile = row.user.studentProfile;
      const className =
        profile?.class?.name ??
        (profile?.nisn ? registryClass.get(profile.nisn) : undefined) ??
        'Belum Ada Kelas';

      let students = classMap.get(className);
      if (!students) {
        students = new Map();
        classMap.set(className, students);
      }
      let student = students.get(row.user.id);
      if (!student) {
        student = {
          userId: row.user.id,
          username: row.user.username,
          fullName: profile?.fullName ?? row.user.username,
          nisn: profile?.nisn ?? null,
          total: 0,
          counts: {},
          records: [],
        };
        students.set(row.user.id, student);
      }

      student.total += 1;
      student.counts[row.status] = (student.counts[row.status] ?? 0) + 1;
      student.records.push(row);
    }

    const classes = [...classMap.entries()]
      .map(([className, students]) => {
        const list = [...students.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
        return { className, studentCount: list.length, students: list };
      })
      .sort((a, b) => a.className.localeCompare(b.className));

    return { classes, total: rows.length };
  }

  /** Rekap absensi per siswa/rentang. Guru: scope siswa bimbingan. */
  async summary(
    params: { userId?: string; from?: string; to?: string },
    actor?: { id: string; role: string }
  ) {
    const where: Prisma.AttendanceWhereInput = {
      ...(params.userId ? { userId: params.userId } : {}),
      ...(params.from || params.to
        ? {
            date: {
              ...(params.from ? { gte: new Date(params.from) } : {}),
              ...(params.to ? { lte: new Date(params.to) } : {}),
            },
          }
        : {}),
    };

    if (actor && actor.role === Role.GURU_PEMBIMBING) {
      const ids = await this.supervisedStudentIds(actor.id);
      if (params.userId) {
        if (!ids.includes(params.userId)) throw new BadRequestError(MESSAGES.SCOPE);
      } else if (ids.length === 0) {
        return attendanceRepository.summary({ userId: '__none__' });
      } else {
        where.userId = { in: ids };
      }
    }

    return attendanceRepository.summary(where);
  }
}

export const attendanceService = new AttendanceService();

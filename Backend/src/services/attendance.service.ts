import { Attendance, AttendanceStatus, Prisma, Role } from '@prisma/client';
import { attendanceRepository } from '../repositories/attendance.repository';
import { groupRepository } from '../repositories/group.repository';
import { studentWorkflowService } from './studentWorkflow.service';
import { auditService } from './audit.service';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors/AppError';
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
 *  - Absensi dikonfirmasi (diverifikasi) oleh DUDI pembimbing di perusahaan.
 *
 * Catatan: endpoint check-in/check-out lama tetap dipertahankan sebagai
 * fitur tambahan (timer harian).
 */
export class AttendanceService {
  /** Mengambil kelompok aktif siswa; wajib ada untuk absen. */
  private async requireActiveGroup(userId: string) {
    let group = await groupRepository.findActiveByMember(userId);
    // Backfill data dari versi sebelumnya yang sudah membuat akun, tetapi
    // belum membentuk Group/GroupMember setelah surat penerimaan disetujui.
    if (!group) {
      await studentWorkflowService.ensureGroupForStudent(userId);
      group = await groupRepository.findActiveByMember(userId);
    }
    if (!group) throw new BadRequestError(MESSAGES.ATTENDANCE.NO_GROUP);
    return group;
  }

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
    const group = await this.requireActiveGroup(userId);
    const date = startOfToday();

    const existing = await attendanceRepository.findByUserAndDate(userId, date);
    if (existing) {
      throw new ConflictError('Anda sudah mengirim absensi hari ini. Absensi tidak dapat diubah.');
    }

    const anomaly = this.detectAnomaly(input.geo);
    const now = new Date();

    const record = await attendanceRepository.create({
      user: { connect: { id: userId } },
      group: { connect: { id: group.id } },
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
   * Konfirmasi absensi oleh DUDI (guru pembimbing perusahaan).
   * Hanya DUDI yang membimbing kelompok terkait yang boleh konfirmasi.
   */
  async verifyByDudi(
    attendanceId: string,
    dudiUserId: string,
    action: 'APPROVE' | 'REJECT',
    note: string | undefined,
    ctx: { ipAddress?: string; userAgent?: string }
  ): Promise<Attendance> {
    const record = await attendanceRepository.findById(attendanceId);
    if (!record) throw new NotFoundError(MESSAGES.NOT_FOUND);
    if (record.verifiedById) throw new ConflictError('Absensi sudah dikonfirmasi sebelumnya');

    const assignment = record.groupId ? await prisma.groupDudiMentor.findUnique({
      where: { groupId_dudiUserId: { groupId: record.groupId, dudiUserId } },
    }) : null;
    if (!assignment) {
      throw new ForbiddenError(MESSAGES.SCOPE);
    }

    if (action === 'REJECT' && !note) {
      throw new BadRequestError('Alasan penolakan wajib diisi');
    }

    const updated = await attendanceRepository.update(attendanceId, {
      verifiedBy: { connect: { id: dudiUserId } },
      verifiedAt: new Date(),
      // Penolakan dicatat di anomalyNote; baris tetap ada untuk transparansi
      anomalyNote: action === 'REJECT' ? `Ditolak DUDI: ${note}` : record.anomalyNote,
    });

    await auditService.record({
      actorId: dudiUserId,
      action: action === 'APPROVE' ? AUDIT_ACTIONS.VERIFY_DOCUMENT : AUDIT_ACTIONS.REJECT,
      entityType: ENTITY_TYPES.ATTENDANCE,
      entityId: attendanceId,
      metadata: { action, note, studentId: record.userId },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return updated;
  }

  /** Daftar absensi yang butuh dikonfirmasi DUDI (per perusahaan). */
  async listForDudi(
    dudiUserId: string,
    params: { page: number; perPage: number; status?: AttendanceStatus; groupId?: string }
  ) {
    const groups = await prisma.groupDudiMentor.findMany({
      where: { dudiUserId },
      select: { groupId: true },
    });
    const groupIds = groups.map((g) => g.groupId);

    // Filter groupId harus termasuk kelompok yang diawasi (anti-bypass)
    if (params.groupId && !groupIds.includes(params.groupId)) {
      throw new ForbiddenError(MESSAGES.SCOPE);
    }

    const where: Prisma.AttendanceWhereInput = {
      groupId: params.groupId ? params.groupId : { in: groupIds.length ? groupIds : ['__none__'] },
      ...(params.status ? { status: params.status } : {}),
    };
    return attendanceRepository.paginate(where, (params.page - 1) * params.perPage, params.perPage);
  }

  /** ID kelompok yang dibimbing guru (untuk scope daftar/ringkasan). */
  private async supervisedGroupIds(userId: string): Promise<string[]> {
    const rows = await prisma.groupSupervisor.findMany({ where: { userId }, select: { groupId: true } });
    return rows.map((r) => r.groupId);
  }

  /** Check-in hari ini. */
  async checkIn(userId: string, geo: GeoInput, ctx: { ipAddress?: string; userAgent?: string }): Promise<Attendance> {
    this.validateGeo(geo);
    const group = await this.requireActiveGroup(userId);
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
          group: { connect: { id: group.id } },
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

  /** Daftar absensi (admin/guru) dengan filter. Guru: scope kelompok bimbingan. */
  async list(
    params: {
      page: number;
      perPage: number;
      groupId?: string;
      userId?: string;
      status?: AttendanceStatus;
      from?: string;
      to?: string;
    },
    actor?: { id: string; role: string }
  ) {
    const where: Prisma.AttendanceWhereInput = {
      ...(params.groupId ? { groupId: params.groupId } : {}),
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
      const ids = await this.supervisedGroupIds(actor.id);
      if (params.groupId) {
        if (!ids.includes(params.groupId)) throw new ForbiddenError(MESSAGES.SCOPE);
      } else if (ids.length === 0) {
        return { items: [], total: 0 };
      } else {
        where.groupId = { in: ids };
      }
    }

    return attendanceRepository.paginate(where, (params.page - 1) * params.perPage, params.perPage);
  }

  /**
   * Monitoring admin: absensi dikelompokkan kelas → kelompok → siswa.
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
      groups: Array<{
        groupId: string | null;
        groupName: string;
        companyName: string | null;
        memberCount: number;
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
      const ids = await this.supervisedGroupIds(actor.id);
      if (ids.length === 0) return { classes: [], total: 0 };
      where.groupId = { in: ids };
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
        group: { select: { id: true, name: true, company: { select: { name: true } } } },
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
      {
        groups: Map<
          string,
          {
            groupId: string | null;
            groupName: string;
            companyName: string | null;
            students: Map<
              string,
              { userId: string; username: string; fullName: string; nisn: string | null; total: number; counts: Record<string, number>; records: Attendance[] }
            >;
          }
        >;
      }
    >();

    for (const row of rows) {
      const profile = row.user.studentProfile;
      const className =
        profile?.class?.name ??
        (profile?.nisn ? registryClass.get(profile.nisn) : undefined) ??
        'Belum Ada Kelas';

      const group = row.group;
      const gkey = group?.id ?? '__none__';

      let cls = classMap.get(className);
      if (!cls) {
        cls = { groups: new Map() };
        classMap.set(className, cls);
      }
      let grp = cls.groups.get(gkey);
      if (!grp) {
        grp = {
          groupId: group?.id ?? null,
          groupName: group?.name ?? 'Tanpa Kelompok',
          companyName: group?.company?.name ?? null,
          students: new Map(),
        };
        cls.groups.set(gkey, grp);
      }
      let student = grp.students.get(row.user.id);
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
        grp.students.set(row.user.id, student);
      }

      student.total += 1;
      student.counts[row.status] = (student.counts[row.status] ?? 0) + 1;
      student.records.push(row);
    }

    // Jumlah anggota resmi tiap kelompok (agar UI bisa menandai kelompok
    // yang anggotanya lintas kelas: "3 dari 5 anggota [di kelas ini]")
    const allGroupIds = [...classMap.values()].flatMap((c) => [...c.groups.keys()]).filter((k) => k !== '__none__');
    const memberCountRows = allGroupIds.length
      ? await prisma.groupMember.groupBy({
          by: ['groupId'],
          where: { groupId: { in: allGroupIds }, group: { deletedAt: null } },
          _count: { _all: true },
        })
      : [];
    const memberCountMap = new Map(memberCountRows.map((m) => [m.groupId, m._count._all]));

    const classes = [...classMap.entries()]
      .map(([className, cls]) => {
        const groups = [...cls.groups.values()]
          .map((g) => {
            const students = [...g.students.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
            return {
              groupId: g.groupId,
              groupName: g.groupName,
              companyName: g.companyName,
              memberCount: (g.groupId ? memberCountMap.get(g.groupId) : undefined) ?? students.length,
              students,
            };
          })
          .sort((a, b) => a.groupName.localeCompare(b.groupName));
        const studentCount = groups.reduce((sum, g) => sum + g.students.length, 0);
        return { className, studentCount, groups };
      })
      .sort((a, b) => a.className.localeCompare(b.className));

    return { classes, total: rows.length };
  }

  /** Rekap absensi per grup/rentang. Guru: scope kelompok bimbingan. */
  async summary(
    params: { groupId?: string; from?: string; to?: string },
    actor?: { id: string; role: string }
  ) {
    const where: Prisma.AttendanceWhereInput = {
      ...(params.groupId ? { groupId: params.groupId } : {}),
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
      const ids = await this.supervisedGroupIds(actor.id);
      if (params.groupId) {
        if (!ids.includes(params.groupId)) throw new ForbiddenError(MESSAGES.SCOPE);
      } else if (ids.length === 0) {
        return attendanceRepository.summary({ groupId: '__none__' });
      } else {
        where.groupId = { in: ids };
      }
    }

    return attendanceRepository.summary(where);
  }
}

export const attendanceService = new AttendanceService();

import { Attendance, AttendanceStatus, Prisma, Role } from '@prisma/client';
import { attendanceRepository } from '../repositories/attendance.repository';
import { auditService } from './audit.service';
import { BadRequestError, ConflictError, NotFoundError } from '../errors/AppError';
import { AUDIT_ACTIONS, ENTITY_TYPES, MESSAGES } from '../config/constants';
import { startOfToday } from '../utils/date';
import { saveBuffer } from '../utils/storage';
import { prisma } from '../config/prisma';

export interface GeoInput {
  lat: number;
  long: number;
  note?: string | null;
}

/** File bukti sakit dari multer (memoryStorage). */
export interface SickProofFile {
  buffer: Buffer;
  originalname?: string;
  mimetype: string;
}

export interface SubmitAttendanceInput {
  status: AttendanceStatus;
  activity?: string;
  geo?: GeoInput;
  sickProof?: SickProofFile;
}

/** MIME bukti sakit yang diizinkan. */
const SICK_PROOF_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']);

/**
 * Service absensi harian (Fase 3).
 *
 * Model alur resmi sekolah (input menyesuaikan status):
 *  - HADIR : pelaksanaan kegiatan wajib + lokasi GPS wajib.
 *  - IZIN  : keterangan izin wajib; GPS opsional.
 *  - SAKIT : keterangan & bukti (foto/PDF) opsional.
 *  - ALPHA : langsung tercatat otomatis — tanpa kegiatan/GPS & tanpa verifikasi guru.
 *  - Tidak bisa dirapel: tanggal harus hari ini (server-side), immutable.
 *  - Absensi non-ALPHA dikonfirmasi (diverifikasi) oleh guru pembimbing siswa.
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

  /** Validasi + simpan bukti sakit (opsional). Magic-bytes: JPG/PNG/PDF. */
  private saveSickProof(attendanceId: string, file: SickProofFile): { path: string; name: string; mime: string } {
    if (!SICK_PROOF_MIME.has(file.mimetype)) {
      throw new BadRequestError('Bukti sakit harus berupa foto JPG/PNG atau PDF');
    }
    const isPng = file.mimetype === 'image/png';
    const isPdf = file.mimetype === 'application/pdf';
    const validSignature = isPng
      ? file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : isPdf
        ? file.buffer.subarray(0, 5).toString('latin1') === '%PDF-'
        : file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
    if (!validSignature) {
      throw new BadRequestError('Isi file bukti sakit tidak sesuai dengan tipe file');
    }
    const ext = isPng ? '.png' : isPdf ? '.pdf' : '.jpg';
    const filename = `${attendanceId}-${Date.now()}${ext}`;
    const { relativePath } = saveBuffer('attendance', filename, file.buffer);
    return { path: relativePath, name: file.originalname || filename, mime: file.mimetype };
  }

  /**
   * Kirim absensi harian. Aturan wajib mengikuti status:
   *  - HADIR : activity wajib + geo wajib
   *  - IZIN  : activity (keterangan) wajib; geo opsional
   *  - SAKIT : semua opsional (activity + bukti foto/PDF opsional); geo opsional
   *  - ALPHA : tanpa activity/geo; langsung tercatat (verifiedAt terisi otomatis)
   * Satu siswa satu record per hari; tidak bisa diperbarui hari ini.
   */
  async submit(
    userId: string,
    input: SubmitAttendanceInput,
    ctx: { ipAddress?: string; userAgent?: string }
  ): Promise<Attendance> {
    const activity = input.activity?.trim() || undefined;
    const geo = input.geo;

    if (input.status === AttendanceStatus.HADIR) {
      if (!activity || activity.length < 3) {
        throw new BadRequestError('Pelaksanaan kegiatan wajib diisi saat status Hadir');
      }
      if (!geo) throw new BadRequestError(MESSAGES.ATTENDANCE.INVALID_LOCATION);
      this.validateGeo(geo);
    } else if (input.status === AttendanceStatus.IZIN) {
      if (!activity || activity.length < 3) {
        throw new BadRequestError('Keterangan izin wajib diisi saat status Izin');
      }
      if (geo) this.validateGeo(geo);
    } else if (input.status === AttendanceStatus.SAKIT) {
      if (geo) this.validateGeo(geo);
    }
    // ALPHA: tanpa kegiatan/GPS — langsung tercatat otomatis.

    const date = startOfToday();

    const existing = await attendanceRepository.findByUserAndDate(userId, date);
    if (existing) {
      throw new ConflictError('Anda sudah mengirim absensi hari ini. Absensi tidak dapat diubah.');
    }

    const now = new Date();
    const anomaly = geo ? this.detectAnomaly(geo) : { isAnomaly: false, note: null };

    // ID record dibuat dulu agar nama file bukti sakit bisa menempel padanya.
    const created = await attendanceRepository.create({
      user: { connect: { id: userId } },
      date,
      status: input.status,
      activity: activity ?? null,
      checkInAt: now,
      ...(geo
        ? {
            checkInLat: new Prisma.Decimal(geo.lat),
            checkInLong: new Prisma.Decimal(geo.long),
            checkInNote: geo.note ?? null,
          }
        : {}),
      isAnomaly: anomaly.isAnomaly,
      anomalyNote: anomaly.note,
      // ALPHA dicatat otomatis: verifiedAt terisi tanpa pemberi verifikasi.
      ...(input.status === AttendanceStatus.ALPHA ? { verifiedAt: now } : {}),
    });

    let record = created;
    if (input.status === AttendanceStatus.SAKIT && input.sickProof && input.sickProof.buffer.length > 0) {
      const proof = this.saveSickProof(created.id, input.sickProof);
      record = await attendanceRepository.update(created.id, {
        sickProofPath: proof.path,
        sickProofName: proof.name,
        sickProofMime: proof.mime,
      });
    }

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
        activity: activity ? activity.slice(0, 200) : null,
        ...(geo ? { lat: geo.lat, long: geo.long, isAnomaly: anomaly.isAnomaly } : {}),
        ...(record.sickProofPath ? { sickProof: true } : {}),
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return record;
  }

  /**
   * Konfirmasi absensi oleh guru pembimbing.
   * Hanya guru yang membimbing siswa terkait yang boleh konfirmasi
   * (admin/kapala sekolah bebas). ALPHA tidak diverifikasi (tercatat otomatis).
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
    if (record.status === AttendanceStatus.ALPHA) {
      throw new ConflictError('Absensi Alpha tercatat otomatis dan tidak perlu diverifikasi');
    }
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

  /** Riwayat absensi milik siswa (opsional filter rentang tanggal untuk kalender). */
  async myHistory(
    userId: string,
    params: { page: number; perPage: number; from?: string; to?: string }
  ) {
    return attendanceRepository.paginate(
      {
        userId,
        ...(params.from || params.to
          ? {
              date: {
                ...(params.from ? { gte: new Date(params.from) } : {}),
                ...(params.to ? { lte: new Date(params.to) } : {}),
              },
            }
          : {}),
      },
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

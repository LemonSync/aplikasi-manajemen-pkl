import { Prisma, Visit, VisitStatus, Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { visitRepository } from '../repositories/visit.repository';
import { groupRepository } from '../repositories/group.repository';
import { auditService } from './audit.service';
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors/AppError';
import { AUDIT_ACTIONS, ENTITY_TYPES, MESSAGES } from '../config/constants';
import { readStoredFile, saveBuffer } from '../utils/storage';

/** File foto bukti dari multer (memoryStorage). */
export interface VisitPhotoFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

const PHOTO_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png']);

export interface CreateVisitInput {
  groupId?: string | null;
  companyId?: string | null;
  scheduledAt: string;
  note?: string | null;
}

/**
 * Service kunjungan/monitoring guru pembimbing (Fase 3).
 * Guru hanya boleh menjadwalkan kunjungan untuk kelompok yang dibimbingnya.
 */
export class VisitService {
  async create(
    supervisorId: string,
    input: CreateVisitInput,
    ctx: { ipAddress?: string; userAgent?: string }
  ) {
    // Bila menargetkan group, pastikan guru adalah pembimbingnya.
    if (input.groupId) {
      const group = await groupRepository.findByIdWithRelations(input.groupId);
      if (!group) throw new NotFoundError('Kelompok tidak ditemukan');
      const isSupervisor = group.supervisors.some((s) => s.userId === supervisorId);
      if (!isSupervisor) throw new ForbiddenError(MESSAGES.VISIT.NOT_SUPERVISOR);
    }

    const visit = await visitRepository.create({
      supervisor: { connect: { id: supervisorId } },
      ...(input.groupId ? { group: { connect: { id: input.groupId } } } : {}),
      ...(input.companyId ? { company: { connect: { id: input.companyId } } } : {}),
      scheduledAt: new Date(input.scheduledAt),
      note: input.note ?? null,
    });

    await auditService.record({
      actorId: supervisorId,
      action: AUDIT_ACTIONS.CREATE_VISIT,
      entityType: ENTITY_TYPES.VISIT,
      entityId: visit.id,
      metadata: { groupId: input.groupId ?? null },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    // sendMonitoring: umumkan jadwal monitoring ke semua anggota kelompok
    if (input.groupId) {
      const members = await prisma.groupMember.findMany({
        where: { groupId: input.groupId },
        select: { userId: true },
      });
      const when = new Date(input.scheduledAt).toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
      await prisma.notification.createMany({
        data: members.map((m) => ({
          userId: m.userId,
          title: 'Jadwal Monitoring PKL',
          body: `Guru pembimbing menjadwalkan monitoring pada ${when}.${input.note ? ' Catatan: ' + input.note : ''}`,
          type: 'VISIT_SCHEDULE',
          link: '/pengaduan',
        })),
      });
    }

    return visitRepository.findById(visit.id);
  }

  /** Akses: admin bebas; guru hanya kunjungan miliknya sendiri. */
  private assertAccess(visit: Visit, actorId: string, role?: string): void {
    const isStaff = role === Role.ADMIN || role === Role.SUPER_ADMIN || role === Role.KEPALA_SEKOLAH;
    if (!isStaff && visit.supervisorId !== actorId) throw new ForbiddenError(MESSAGES.SCOPE);
  }

  /** Kunjungan yang sudah SELESAI/BATAL bersifat final dan tidak bisa diubah. */
  private assertEditable(visit: Visit): void {
    if (visit.status === VisitStatus.SELESAI || visit.status === VisitStatus.BATAL) {
      throw new BadRequestError('Kunjungan sudah ditutup dan tidak dapat diubah lagi');
    }
  }

  /**
   * Tandai monitoring SELESAI — wajib menyertakan bukti foto
   * (JPG/PNG) yang disimpan ke storage + database.
   */
  async complete(
    supervisorId: string,
    id: string,
    opts: { note?: string | null; role?: string; file?: VisitPhotoFile }
  ) {
    const visit = await visitRepository.findById(id);
    if (!visit) throw new NotFoundError(MESSAGES.NOT_FOUND);
    this.assertAccess(visit, supervisorId, opts.role);
    this.assertEditable(visit);

    const file = opts.file;
    if (!file || file.buffer.length === 0) {
      throw new BadRequestError('Bukti foto wajib diunggah untuk menandai monitoring selesai');
    }
    if (!PHOTO_MIME.has(file.mimetype)) {
      throw new BadRequestError('Bukti foto harus berupa gambar JPG atau PNG');
    }

    const ext = file.mimetype === 'image/png' ? 'png' : 'jpg';
    const filename = `${visit.id}-${Date.now()}.${ext}`;
    const { relativePath } = saveBuffer('visits', filename, file.buffer);

    await visitRepository.update(id, {
      status: VisitStatus.SELESAI,
      visitedAt: new Date(),
      photoPath: relativePath,
      photoName: file.originalname || filename,
      ...(opts.note !== undefined ? { note: opts.note ?? null } : {}),
    });
    return visitRepository.findWithRelations(id);
  }

  /** Tunda kunjungan — jadwal baru boleh diisi (mundurkan waktu kunjungan). */
  async postpone(
    supervisorId: string,
    id: string,
    opts: { note?: string | null; scheduledAt?: string | null; role?: string }
  ) {
    const visit = await visitRepository.findById(id);
    if (!visit) throw new NotFoundError(MESSAGES.NOT_FOUND);
    this.assertAccess(visit, supervisorId, opts.role);
    this.assertEditable(visit);

    await visitRepository.update(id, {
      status: VisitStatus.TERTUNDA,
      ...(opts.note !== undefined ? { note: opts.note ?? null } : {}),
      ...(opts.scheduledAt ? { scheduledAt: new Date(opts.scheduledAt) } : {}),
    });
    return visitRepository.findWithRelations(id);
  }

  /** Lanjutkan kembali kunjungan yang tertunda (jadwal baru boleh diisi). */
  async resume(
    supervisorId: string,
    id: string,
    opts: { scheduledAt?: string | null; role?: string }
  ) {
    const visit = await visitRepository.findById(id);
    if (!visit) throw new NotFoundError(MESSAGES.NOT_FOUND);
    this.assertAccess(visit, supervisorId, opts.role);
    this.assertEditable(visit);

    await visitRepository.update(id, {
      status: VisitStatus.TERJADWAL,
      ...(opts.scheduledAt ? { scheduledAt: new Date(opts.scheduledAt) } : {}),
    });
    return visitRepository.findWithRelations(id);
  }

  /** Batal kunjungan (dengan alasan/catatan). */
  async cancel(supervisorId: string, id: string, opts: { note?: string | null; role?: string }) {
    const visit = await visitRepository.findById(id);
    if (!visit) throw new NotFoundError(MESSAGES.NOT_FOUND);
    this.assertAccess(visit, supervisorId, opts.role);
    this.assertEditable(visit);

    await visitRepository.update(id, {
      status: VisitStatus.BATAL,
      ...(opts.note !== undefined ? { note: opts.note ?? null } : {}),
    });
    return visitRepository.findWithRelations(id);
  }

  /** Ambil bukti foto monitoring — guru/admin, atau siswa anggota kelompoknya. */
  async getPhoto(
    actorId: string,
    id: string,
    role: string
  ): Promise<{ buffer: Buffer; filename: string }> {
    const visit = await visitRepository.findById(id);
    if (!visit) throw new NotFoundError(MESSAGES.NOT_FOUND);

    if (role === Role.SISWA) {
      if (!visit.groupId) throw new ForbiddenError(MESSAGES.SCOPE);
      const member = await prisma.groupMember.findFirst({
        where: { groupId: visit.groupId, userId: actorId },
        select: { id: true },
      });
      if (!member) throw new ForbiddenError(MESSAGES.SCOPE);
    } else {
      this.assertAccess(visit, actorId, role);
    }

    if (!visit.photoPath) throw new NotFoundError('Foto bukti monitoring belum ada');
    const buffer = readStoredFile(visit.photoPath);
    if (!buffer) throw new NotFoundError('File foto tidak ditemukan di storage');
    return { buffer, filename: visit.photoName || 'bukti-monitoring.jpg' };
  }

  /** Kunjungan milik guru. */
  async myVisits(supervisorId: string, params: { page: number; perPage: number }) {
    return visitRepository.paginate(
      { supervisorId },
      (params.page - 1) * params.perPage,
      params.perPage
    );
  }

  /** Daftar kunjungan (admin) dengan filter; guru: hanya kunjungan miliknya sendiri. */
  async list(
    params: { page: number; perPage: number; groupId?: string; supervisorId?: string },
    actor?: { id: string; role: string }
  ) {
    const where: Prisma.VisitWhereInput = {
      ...(params.groupId ? { groupId: params.groupId } : {}),
      ...(params.supervisorId ? { supervisorId: params.supervisorId } : {}),
    };
    if (actor && actor.role === 'GURU_PEMBIMBING') {
      where.supervisorId = actor.id;
    }
    return visitRepository.paginate(where, (params.page - 1) * params.perPage, params.perPage);
  }
}

export const visitService = new VisitService();

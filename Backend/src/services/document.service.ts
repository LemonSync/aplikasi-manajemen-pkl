import {
  DocumentFile,
  DocumentStatus,
  DocumentType,
  Prisma,
  StudentPhase,
} from '@prisma/client';
import { documentRepository } from '../repositories/document.repository';
import { prisma } from '../config/prisma';
import { auditService } from './audit.service';
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors/AppError';
import { AUDIT_ACTIONS, ENTITY_TYPES, MESSAGES } from '../config/constants';
import { saveBuffer } from '../utils/storage';
import { studentWorkflowService } from './studentWorkflow.service';
import { classNameWithFallback } from './classResolver.service';
import { companyService } from './company.service';

export interface UploadResult {
  documentId: string;
  fileId: string;
  version: number;
}

/**
 * Service dokumen (upload, versioning, verifikasi admin).
 * Semua file disimpan di luar webroot dengan nama yang di-generate sistem.
 */
export class DocumentService {
  /**
   * Membuat/menyimpan dokumen beserta file terunggah.
   * Bila dokumen dengan (ownerId, type) sudah ada, file ditambahkan sebagai versi baru
   * dan status dikembalikan ke MENUNGGU_VERIFIKASI.
   */
  async uploadDocument(params: {
    ownerId: string;
    cohortId?: string | null;
    type: DocumentType;
    title?: string;
    file: Express.Multer.File;
    ctx: { ipAddress?: string; userAgent?: string };
  }): Promise<UploadResult> {
    const { ownerId, cohortId, type, file } = params;

    if (!file) throw new BadRequestError('File wajib diunggah');
    await studentWorkflowService.syncScheduledPhase(ownerId);
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { role: true, phase: true, cohortId: true },
    });
    if (!owner) throw new NotFoundError(MESSAGES.NOT_FOUND);
    if (cohortId !== (owner.cohortId ?? null)) {
      throw new ForbiddenError(MESSAGES.SCOPE);
    }

    const validSignatures: Record<string, (buffer: Buffer) => boolean> = {
      'application/pdf': (b) => b.subarray(0, 5).toString('ascii') === '%PDF-',
      'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
      'image/jpg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
      'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      'application/msword': (b) => b.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (b) => b.subarray(0, 2).toString('ascii') === 'PK',
    };
    if (!validSignatures[file.mimetype]?.(file.buffer)) {
      throw new BadRequestError(MESSAGES.DOCUMENT.INVALID_FILE);
    }

    // Hanya tipe dokumen berikut yang boleh diunggah lewat endpoint siswa;
    // tipe lain (surat permohonan/pengantar/monitoring/penjemputan) dibuat sistem/admin.
    const uploadableTypes: DocumentType[] = [
      DocumentType.SURAT_PENERIMAAN,
      DocumentType.SURAT_PERNYATAAN,
      DocumentType.LAPORAN_AKHIR,
      DocumentType.LAINNYA,
    ];
    if (!uploadableTypes.includes(type)) {
      throw new ForbiddenError('Tipe dokumen ini dibuat oleh sistem/admin dan tidak dapat diunggah manual');
    }

    if (owner.role === 'SISWA') {
      // Jendela fase per tipe: cegah upload di luar masa yang ditentukan.
      const phaseWindows: Partial<Record<DocumentType, StudentPhase[]>> = {
        [DocumentType.SURAT_PENERIMAAN]: [StudentPhase.NON_PKL],
        [DocumentType.SURAT_PERNYATAAN]: [StudentPhase.NON_PKL],
        [DocumentType.LAPORAN_AKHIR]: [StudentPhase.PKL_AKTIF, StudentPhase.PKL_SELESAI],
      };
      const window = phaseWindows[type];
      if (window && owner.phase && !window.includes(owner.phase)) {
        const label =
          type === DocumentType.LAPORAN_AKHIR
            ? 'Laporan Akhir'
            : type === DocumentType.SURAT_PERNYATAAN
              ? 'Surat Pernyataan'
              : 'Surat Penerimaan';
        throw new ForbiddenError(
          `Unggah ${label} hanya dapat dilakukan pada fase ${window.join(' / ')} (fase Anda saat ini: ${owner.phase})`
        );
      }
    }

    // Cari dokumen existing bertipe sama milik user
    const existingDocs = await documentRepository.findMany({ ownerId, type });
    let document = existingDocs[0];

    if (!document) {
      document = (await documentRepository.create({
        type,
        status: DocumentStatus.MENUNGGU_VERIFIKASI,
        title: params.title ?? null,
        owner: { connect: { id: ownerId } },
        ...(cohortId ? { cohort: { connect: { id: cohortId } } } : {}),
      })) as never;
    } else {
      // Jika dokumen sudah DISETUJUI, TIDAK BOLEH upload lagi
      if (document.status === DocumentStatus.DISETUJUI) {
        throw new BadRequestError('Dokumen ini sudah disetujui dan tidak dapat diunggah ulang');
      }
      // Sedang menunggu verifikasi admin → file terkunci, tidak boleh ditimpa.
      // Upload ulang hanya boleh setelah admin MENOLAK (status DITOLAK).
      if (
        document.status === DocumentStatus.MENUNGGU_VERIFIKASI ||
        document.status === DocumentStatus.DIUNGGAH
      ) {
        throw new BadRequestError(
          'Dokumen sedang menunggu verifikasi admin dan tidak dapat diganti. Unggah ulang hanya dapat dilakukan setelah admin menolak.'
        );
      }
      // Reset status -> menunggu verifikasi saat ada upload (baru/revisi)
      await documentRepository.update(document.id, {
        status: DocumentStatus.MENUNGGU_VERIFIKASI,
        note: null,
        verifiedById: null,
        verifiedAt: null,
      });
      // Nonaktifkan file lama (versioning)
      await documentRepository.deactivateFiles(document.id);
    }

    // Simpan file di luar webroot dengan nama generate
    const extensionByMime: Record<string, string> = {
      'application/pdf': '.pdf',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    };
    const ext = extensionByMime[file.mimetype] ?? '';
    const safeName = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const { relativePath } = saveBuffer('documents', safeName, file.buffer);

    const nextVersion = await documentRepository.nextVersion(document.id);
    const safeOriginalName = file.originalname.replace(/[\u0000-\u001f"\\/]/g, '_').slice(0, 255);
    const createdFile: DocumentFile = await documentRepository.createFile({
      document: { connect: { id: document.id } },
      uploadedBy: { connect: { id: ownerId } },
      originalName: safeOriginalName,
      storedPath: relativePath,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      version: nextVersion,
      isActive: true,
    });

    await auditService.record({
      actorId: ownerId,
      action: AUDIT_ACTIONS.UPLOAD_DOCUMENT,
      entityType: ENTITY_TYPES.DOCUMENT,
      entityId: document.id,
      metadata: { type, version: nextVersion, originalName: safeOriginalName },
      ipAddress: params.ctx.ipAddress,
      userAgent: params.ctx.userAgent,
    });

    return { documentId: document.id, fileId: createdFile.id, version: nextVersion };
  }

  async getById(id: string) {
    const doc = await documentRepository.findById(id);
    if (!doc) throw new NotFoundError(MESSAGES.NOT_FOUND);
    return doc;
  }

  /**
   * Cek akses dokumen: pemilik, admin/kepsek, atau guru pembimbing pemilik
   * dokumen. Lainnya ditolak (anti IDOR).
   */
  async assertCanAccess(docId: string, actor: { id: string; role: string }) {
    const doc = await this.getById(docId);
    if (actor.role === 'ADMIN' || actor.role === 'SUPER_ADMIN' || actor.role === 'KEPALA_SEKOLAH') {
      return doc;
    }
    if (doc.ownerId === actor.id) return doc;

    if (actor.role === 'GURU_PEMBIMBING') {
      const supervision = await prisma.studentSupervisor.findUnique({
        where: { studentId: doc.ownerId },
        select: { supervisorId: true },
      });
      if (supervision?.supervisorId === actor.id) return doc;
    }

    throw new ForbiddenError(MESSAGES.SCOPE);
  }

  /**
   * Penempatan pemilik dokumen (Surat Penerimaan): pendaftaran milik siswa
   * ini + data perusahaan tujuan + guru pembimbing. null bila tidak ada
   * pendaftaran.
   */
  async getOwnerPlacement(ownerId: string | null) {
    if (!ownerId) return null;

    const registration = await prisma.registration.findFirst({
      where: { studentId: ownerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        company: { include: { industry: { select: { name: true } } } },
        major: { select: { name: true } },
        student: {
          select: {
            id: true,
            username: true,
            studentProfile: {
              select: {
                fullName: true,
                nisn: true,
                class: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!registration) return null;

    const supervision = await prisma.studentSupervisor.findUnique({
      where: { studentId: ownerId },
      select: {
        supervisor: {
          select: { username: true, teacherProfile: { select: { fullName: true } } },
        },
      },
    });

    const profile = registration.student?.studentProfile;
    // Kelas: preferensi Class.name, fallback ke Master Siswa (NISN).
    const registryClassName = await classNameWithFallback(profile);
    const company = registration.company
      ? {
          name: registration.company.name,
          address: registration.company.address,
          phone: registration.company.phone,
          email: registration.company.email,
          city: registration.company.city,
          industryName: registration.company.industry?.name ?? null,
          website: registration.company.website,
        }
      : null;

    return {
      id: registration.id,
      code: registration.code,
      status: registration.status as string,
      majorName: registration.major?.name ?? null,
      supervisorName:
        supervision?.supervisor.teacherProfile?.fullName ?? supervision?.supervisor.username ?? null,
      student: {
        userId: registration.student?.id ?? ownerId,
        fullName: profile?.fullName ?? registration.student?.username ?? null,
        nisn: profile?.nisn ?? null,
        className: registryClassName,
      },
      company,
      source: 'REGISTRATION' as const,
    };
  }

  /** Ambil dokumen milik user (dengan proteksi kepemilikan). */
  async getOwned(ownerId: string, id: string) {
    const doc = await documentRepository.findById(id);
    if (!doc) throw new NotFoundError(MESSAGES.NOT_FOUND);
    if (doc.ownerId !== ownerId) throw new ForbiddenError(MESSAGES.SCOPE);
    return doc;
  }

  /** File aktif dari dokumen bertipe tertentu milik user (untuk unduh). */
  async getActiveFileByType(ownerId: string, type: DocumentType): Promise<DocumentFile> {
    const file = await documentRepository.findActiveFileByType(ownerId, type);
    if (!file) throw new NotFoundError(MESSAGES.DOCUMENT.NOT_UPLOADED);
    return file;
  }

  /**
   * Tandai Surat Permohonan sudah diunduh siswa (gerbang Fase 1 → Fase 2).
   * Hanya siswa pemilik pendaftaran yang menandai; unduhan admin/guru diabaikan
   * karena tidak berarti siswa sudah menerima fisik suratnya.
   */
  async markPermohonanDownloaded(registrationId: string, requesterId: string): Promise<void> {
    const reg = await prisma.registration.findUnique({
      where: { id: registrationId },
      select: { studentId: true, deletedAt: true },
    });
    if (!reg || reg.deletedAt || reg.studentId !== requesterId) return;
    await prisma.registration.update({
      where: { id: registrationId },
      data: { permohonanDownloadedAt: new Date() },
    });
  }

  async listByOwner(ownerId: string) {
    return documentRepository.findMany({ ownerId });
  }

  /** Daftar dokumen. Guru dibatasi pada siswa bimbingannya. */
  async list(
    params: { page: number; perPage: number; status?: DocumentStatus; type?: DocumentType; cohortId?: string },
    actor?: { id: string; role: string }
  ) {
    const where: Prisma.DocumentWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.type ? { type: params.type } : {}),
      ...(params.cohortId ? { cohortId: params.cohortId } : {}),
    };

    if (actor && actor.role === 'GURU_PEMBIMBING') {
      const links = await prisma.studentSupervisor.findMany({
        where: { supervisorId: actor.id },
        select: { studentId: true },
      });
      if (links.length === 0) return { items: [], total: 0 };
      where.ownerId = { in: links.map((l) => l.studentId) };
    }

    return documentRepository.paginate(where, (params.page - 1) * params.perPage, params.perPage);
  }

  /** Admin: verifikasi (setujui/tolak) dokumen. */
  async verify(
    id: string,
    actorId: string,
    actorRole: string,
    action: 'APPROVE' | 'REJECT',
    note: string | undefined,
    ctx: { ipAddress?: string; userAgent?: string }
  ) {
    const doc = await documentRepository.findById(id);
    if (!doc) throw new NotFoundError(MESSAGES.NOT_FOUND);
    if (actorRole === 'GURU_PEMBIMBING') {
      const scoped = await this.assertCanAccess(id, { id: actorId, role: actorRole });
      if (scoped.type !== DocumentType.LAPORAN_AKHIR) throw new ForbiddenError(MESSAGES.SCOPE);
    }
    if (doc.status === DocumentStatus.DISETUJUI) {
      throw new BadRequestError(MESSAGES.DOCUMENT.ALREADY_VERIFIED);
    }
    if (action === 'REJECT' && !note) {
      throw new BadRequestError('Alasan penolakan wajib diisi');
    }

    // Guard 2 (dua penjaga kuota): approve Surat Penerimaan menambah
    // pemakaian kuota perusahaan — tolak bila sudah penuh SEBELUM status
    // dokumen diubah (saat di-reject kembali, kuota otomatis tersedia lagi).
    if (action === 'APPROVE' && doc.type === DocumentType.SURAT_PENERIMAAN) {
      const activeReg = await prisma.registration.findFirst({
        where: {
          studentId: doc.ownerId,
          deletedAt: null,
          status: { in: ['DIAJUKAN', 'DISETUJUI'] },
        },
        orderBy: { createdAt: 'desc' },
        select: { companyId: true },
      });
      if (!activeReg) {
        throw new BadRequestError(
          'Tidak ada pendaftaran aktif untuk menyetujui Surat Penerimaan siswa ini'
        );
      }
      await companyService.assertSisaAvailable(activeReg.companyId);
    }

    const updated = await documentRepository.update(id, {
      status: action === 'APPROVE' ? DocumentStatus.DISETUJUI : DocumentStatus.DITOLAK,
      note: note ?? null,
      verifiedById: actorId,
      verifiedAt: new Date(),
    });

    // Gerbang fase (PRA_PKL → NON_PKL → PKL_AKTIF) dihitung otomatis oleh
    // StudentWorkflowService.checkPhaseCompletion — tidak ada provisioning akun.
    if (action === 'APPROVE' && doc.type === DocumentType.SURAT_PENERIMAAN) {
      await studentWorkflowService.syncScheduledPhase(doc.ownerId);
    }

    await auditService.record({
      actorId,
      action: AUDIT_ACTIONS.VERIFY_DOCUMENT,
      entityType: ENTITY_TYPES.DOCUMENT,
      entityId: id,
      metadata: { action, note },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return updated;
  }
}

export const documentService = new DocumentService();

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
    const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { role: true, phase: true } });
    if (!owner) throw new NotFoundError(MESSAGES.NOT_FOUND);

    // Hanya tipe dokumen berikut yang boleh diunggah lewat endpoint siswa/ketua;
    // tipe lain (surat permohonan/pengantar/penugasan/penarikan) dibuat sistem/admin.
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
    } else if (owner.role === 'KETUA') {
      // Akun ketua sementara hanya dipakai untuk surat balasan perusahaan.
      if (type !== DocumentType.SURAT_PENERIMAAN) {
        throw new ForbiddenError('Akun Ketua hanya dapat mengunggah Surat Penerimaan');
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
    const ext = file.originalname.includes('.') ? `.${file.originalname.split('.').pop()}` : '';
    const safeName = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const { relativePath } = saveBuffer('documents', safeName, file.buffer);

    const nextVersion = await documentRepository.nextVersion(document.id);
    const createdFile: DocumentFile = await documentRepository.createFile({
      document: { connect: { id: document.id } },
      uploadedBy: { connect: { id: ownerId } },
      originalName: file.originalname,
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
      metadata: { type, version: nextVersion, originalName: file.originalname },
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
   * Cek akses dokumen: pemilik, admin/kepsek, guru pembimbing kelompok pemilik,
   * atau DUDI mentor kelompok pemilik. Lainnya ditolak (anti IDOR).
   */
  async assertCanAccess(docId: string, actor: { id: string; role: string }) {
    const doc = await this.getById(docId);
    if (actor.role === 'ADMIN' || actor.role === 'SUPER_ADMIN' || actor.role === 'KEPALA_SEKOLAH') {
      return doc;
    }
    if (doc.ownerId === actor.id) return doc;

    if (actor.role === 'GURU_PEMBIMBING') {
      const supervised = await prisma.groupSupervisor.findFirst({
        where: { userId: actor.id, group: { deletedAt: null, members: { some: { userId: doc.ownerId } } } },
        select: { groupId: true },
      });
      if (supervised) return doc;
    }

    if (actor.role === 'DUDI') {
      const mentor = await prisma.groupDudiMentor.findFirst({
        where: { dudiUserId: actor.id, group: { deletedAt: null, members: { some: { userId: doc.ownerId } } } },
        select: { groupId: true },
      });
      if (mentor) return doc;
    }

    throw new ForbiddenError(MESSAGES.SCOPE);
  }

  /**
   * Detail kelompok/penerimaan untuk dokumen (Surat Penerimaan):
   * anggota + data perusahaan tempat PKL. Sumber data berurutan:
   *  1. Kelompok tempat pemilik dokumen tercatat sebagai anggota.
   *  2. Kelompok yang dibentuk dari pendaftaran milik pemilik (akun KETUA
   *     sementara tidak pernah menjadi GroupMember).
   *  3. Pendaftaran Fase 1 milik pemilik — fase di mana surat penerimaan
   *     memang sudah bisa diupload (Group baru dibentuk setelah surat
   *     disetujui / provisioning).
   * null bila tidak ada ketiganya.
   */
  async getOwnerGroup(ownerId: string | null) {
    if (!ownerId) return null;

    const groupInclude = {
      company: { include: { industry: { select: { name: true } } } },
      major: { select: { name: true } },
      members: {
        orderBy: [{ isLeader: 'desc' as const }, { joinedAt: 'asc' as const }],
        include: {
          user: {
            select: {
              username: true,
              role: true,
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
      },
    };

    // 1) owner adalah anggota kelompok
    let group = await prisma.group.findFirst({
      where: { deletedAt: null, members: { some: { userId: ownerId } } },
      orderBy: { createdAt: 'desc' },
      include: groupInclude,
    });

    // 2) kelompok hasil pembentukan dari pendaftaran milik owner
    if (!group) {
      group = await prisma.group.findFirst({
        where: { deletedAt: null, registration: { leaderId: ownerId } },
        orderBy: { createdAt: 'desc' },
        include: groupInclude,
      });
    }

    // pendaftaran Fase 1 milik owner (untuk fallback anggota/perusahaan)
    const registration = await prisma.registration.findFirst({
      where: { leaderId: ownerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        major: { select: { name: true } },
        members: { orderBy: [{ isLeader: 'desc' as const }, { createdAt: 'asc' as const }] },
      },
    });

    if (!group && !registration) return null;

    // Anggota: kelompok bila punya anggota, else baris anggota Fase 1
    // (skip auto-row "(Ketua)" tanpa NISN yang dibuat sistem).
    const groupMembers = group?.members ?? [];
    const members =
      groupMembers.length > 0
        ? groupMembers.map((m) => ({
            userId: m.userId,
            fullName: m.user.studentProfile?.fullName ?? m.user.username,
            nisn: m.user.studentProfile?.nisn ?? (m.user.role === 'SISWA' ? m.user.username : null),
            className: m.user.studentProfile?.class?.name ?? null,
            isLeader: m.isLeader,
          }))
        : (registration?.members ?? [])
            .filter((rm) => !(rm.nisn === null && rm.fullName === '(Ketua)'))
            .map((rm) => ({
              userId: rm.userId,
              fullName: rm.fullName,
              nisn: rm.nisn,
              className: rm.className,
              isLeader: rm.isLeader,
            }));

    // Perusahaan: group.company bila ada, else snapshot dari pendaftaran Fase 1
    const company = group?.company
      ? {
          name: group.company.name,
          address: group.company.address,
          phone: group.company.phone,
          email: group.company.email,
          city: group.company.city,
          industryName: group.company.industry?.name ?? null,
          website: null as string | null,
          contacts: null as string[] | null,
        }
      : registration
        ? {
            name: registration.companyName,
            address: registration.companyAddress,
            phone: registration.companyPhone,
            email: null as string | null,
            city: registration.companyCity,
            industryName: registration.companyIndustry,
            website: registration.companyWebsite,
            contacts: Array.isArray(registration.companyContacts)
              ? (registration.companyContacts as string[])
              : null,
          }
        : null;

    return {
      id: group?.id ?? registration!.id,
      name: group?.name ?? registration!.groupName,
      code: group?.code ?? registration!.code,
      status: (group?.status ?? registration!.status) as string,
      majorName: group?.major?.name ?? registration?.major?.name ?? null,
      company,
      members,
      source: (group ? 'GROUP' : 'REGISTRATION') as 'GROUP' | 'REGISTRATION',
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

  async listByOwner(ownerId: string) {
    return documentRepository.findMany({ ownerId });
  }

  /** Daftar dokumen. Guru dibatasi pada kelompok bimbingannya. */
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
      const supervised = await prisma.groupSupervisor.findMany({
        where: { userId: actor.id },
        select: { groupId: true },
      });
      const groupIds = supervised.map((s) => s.groupId);
      if (groupIds.length === 0) return { items: [], total: 0 };
      const owners = await prisma.groupMember.findMany({
        where: { groupId: { in: groupIds } },
        select: { userId: true },
      });
      const ownerIds = [...new Set(owners.map((o) => o.userId).filter((id): id is string => id !== null))];
      if (ownerIds.length === 0) return { items: [], total: 0 };
      where.ownerId = { in: ownerIds };
    }

    return documentRepository.paginate(where, (params.page - 1) * params.perPage, params.perPage);
  }

  /** Admin: verifikasi (setujui/tolak) dokumen. */
  async verify(
    id: string,
    actorId: string,
    action: 'APPROVE' | 'REJECT',
    note: string | undefined,
    ctx: { ipAddress?: string; userAgent?: string }
  ) {
    const doc = await documentRepository.findById(id);
    if (!doc) throw new NotFoundError(MESSAGES.NOT_FOUND);
    if (doc.status === DocumentStatus.DISETUJUI) {
      throw new BadRequestError(MESSAGES.DOCUMENT.ALREADY_VERIFIED);
    }
    if (action === 'REJECT' && !note) {
      throw new BadRequestError('Alasan penolakan wajib diisi');
    }

    const updated = await documentRepository.update(id, {
      status: action === 'APPROVE' ? DocumentStatus.DISETUJUI : DocumentStatus.DITOLAK,
      note: note ?? null,
      verifiedById: actorId,
      verifiedAt: new Date(),
    });

    // Surat penerimaan adalah gerbang Fase 2: langsung provision akun anggota
    // dan akun DUDI. Tidak lagi menunggu ketua membuka halaman workflow.
    if (action === 'APPROVE' && doc.type === DocumentType.SURAT_PENERIMAAN) {
      await studentWorkflowService.provisionAfterAcceptance(doc.ownerId);
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

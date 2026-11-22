import {
  ApprovalStatus,
  CompanyRequestStatus,
  DocumentStatus,
  Prisma,
  RegistrationStatus,
  Role,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { resolveScope, scopeUserWhere, andWhere, type MajorScope } from './majorScope.service';

/** Jenis antrean yang dikumpulkan di inbox verifikasi admin. */
export type InboxKind = 'REGISTRASI' | 'DOKUMEN' | 'USULAN_PERUSAHAAN' | 'NILAI';

export interface InboxStudent {
  id: string;
  fullName: string | null;
  username: string;
  nisn: string | null;
  className: string | null;
  majorName: string | null;
}

export interface InboxItem {
  kind: InboxKind;
  /** id entitas aslinya — dipakai FE memanggil endpoint review/verify/approve. */
  id: string;
  label: string;
  status: string;
  /** Kapan item masuk antrean admin — dasar pengurutan terlama↔terbaru. */
  queuedAt: string;
  student: InboxStudent | null;
  cohortName: string | null;
  company: string | null;
  /** Keterangan pendukung keputusan (nama file, nilai akhir, bidang usaha). */
  detail: string | null;
}

const ENTITY_GRADE = 'GRADE';

/** Label antrean per tipe dokumen; tipe lain (surat buatan sekolah) jatuh ke 'Dokumen'. */
const DOC_LABELS: Record<string, string> = {
  SURAT_PENERIMAAN: 'Surat Penerimaan',
  SURAT_PERNYATAAN: 'Surat Pernyataan',
  LAPORAN_AKHIR: 'Laporan Akhir PKL',
  LAINNYA: 'Dokumen Tambahan',
};

/** Batas baris per sumber — daftar gabungan dirender tanpa pagination server. */
const MAX_PER_SOURCE = 500;

const studentSelect = {
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
} satisfies Prisma.UserSelect;

type StudentRow = Prisma.UserGetPayload<{ select: typeof studentSelect }>;

function toStudent(s: StudentRow): InboxStudent {
  const p = s.studentProfile;
  return {
    id: s.id,
    fullName: p?.fullName ?? null,
    username: s.username,
    nisn: p?.nisn ?? null,
    className: p?.class?.name ?? null,
    majorName: p?.major?.name ?? null,
  };
}

/**
 * Inbox verifikasi admin — satu daftar untuk semua hal yang menunggu keputusan admin.
 *
 * Sumber: pendaftaran DIAJUKAN, dokumen MENUNGGU_VERIFIKASI, usulan tempat PKL
 * MENUNGGU, dan nilai dengan persetujuan MENUNGGU. Keputusannya tetap memakai
 * endpoint asli masing-masing sumber; halaman ini hanya membaca antreannya.
 *
 * Cakupan jurusan ditegakkan di sini (ADMIN = supervisedMajors) sama seperti
 * halaman aslinya, sehingga admin tidak melihat ajuan di luar jurusannya.
 */
export class InboxService {
  async list(
    actor: { id: string; role: Role },
    params: { cohortId?: string; order: 'OLDEST' | 'NEWEST' }
  ): Promise<{ items: InboxItem[]; counts: Record<InboxKind | 'TOTAL', number> }> {
    const scope = await resolveScope(actor);
    const { cohortId } = params;

    const [registrations, documents, companyRequests, grades] = await Promise.all([
      this.pendingRegistrations(scope, cohortId),
      this.pendingDocuments(scope, cohortId),
      this.pendingCompanyRequests(scope, cohortId),
      this.pendingGrades(scope, cohortId),
    ]);

    const items = [...registrations, ...documents, ...companyRequests, ...grades].sort((a, b) =>
      params.order === 'NEWEST'
        ? new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime()
        : new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime()
    );

    return {
      items,
      counts: {
        TOTAL: items.length,
        REGISTRASI: registrations.length,
        DOKUMEN: documents.length,
        USULAN_PERUSAHAAN: companyRequests.length,
        NILAI: grades.length,
      },
    };
  }

  private async pendingRegistrations(scope: MajorScope, cohortId?: string): Promise<InboxItem[]> {
    const rows = await prisma.registration.findMany({
      where: andWhere(
        {
          status: RegistrationStatus.DIAJUKAN,
          deletedAt: null,
          ...(cohortId ? { cohortId } : {}),
        },
        scopeUserWhere(scope, 'student')
      ) as Prisma.RegistrationWhereInput,
      select: {
        id: true,
        code: true,
        submittedAt: true,
        createdAt: true,
        company: { select: { name: true } },
        cohort: { select: { name: true } },
        student: { select: studentSelect },
      },
      orderBy: { submittedAt: 'asc' },
      take: MAX_PER_SOURCE,
    });

    return rows.map((r) => ({
      kind: 'REGISTRASI' as InboxKind,
      id: r.id,
      label: `Pendaftaran PKL${r.code ? ` · ${r.code}` : ''}`,
      status: RegistrationStatus.DIAJUKAN,
      queuedAt: (r.submittedAt ?? r.createdAt).toISOString(),
      student: r.student ? toStudent(r.student as StudentRow) : null,
      cohortName: r.cohort?.name ?? null,
      company: r.company?.name ?? null,
      detail: null,
    }));
  }

  private async pendingDocuments(scope: MajorScope, cohortId?: string): Promise<InboxItem[]> {
    const rows = await prisma.document.findMany({
      where: andWhere(
        {
          status: DocumentStatus.MENUNGGU_VERIFIKASI,
          ...(cohortId ? { owner: { cohortId } } : {}),
        },
        scopeUserWhere(scope, 'owner')
      ) as Prisma.DocumentWhereInput,
      select: {
        id: true,
        type: true,
        title: true,
        updatedAt: true,
        createdAt: true,
        cohort: { select: { name: true } },
        // Perusahaan asal surat (pendaftaran tempat dokumen ini diunggah),
        // supaya admin bisa membedakan dua Surat Penerimaan dari perusahaan berbeda.
        registration: { select: { company: { select: { name: true } } } },
        owner: { select: studentSelect },
        files: {
          where: { isActive: true },
          select: { originalName: true },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'asc' },
      take: MAX_PER_SOURCE,
    });

    return rows.map((d) => ({
      kind: 'DOKUMEN' as InboxKind,
      id: d.id,
      label: DOC_LABELS[d.type] ?? 'Dokumen',
      status: DocumentStatus.MENUNGGU_VERIFIKASI,
      queuedAt: d.updatedAt.toISOString(),
      student: d.owner ? toStudent(d.owner as StudentRow) : null,
      cohortName: d.cohort?.name ?? null,
      company: d.registration?.company?.name ?? null,
      detail: d.files[0]?.originalName ?? d.title ?? null,
    }));
  }

  private async pendingCompanyRequests(scope: MajorScope, cohortId?: string): Promise<InboxItem[]> {
    const rows = await prisma.companyRequest.findMany({
      where: andWhere(
        {
          status: CompanyRequestStatus.MENUNGGU,
          ...(cohortId ? { student: { cohortId } } : {}),
        },
        scopeUserWhere(scope, 'student')
      ) as Prisma.CompanyRequestWhereInput,
      select: {
        id: true,
        name: true,
        createdAt: true,
        industry: { select: { name: true } },
        student: { select: studentSelect },
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_PER_SOURCE,
    });

    return rows.map((r) => ({
      kind: 'USULAN_PERUSAHAAN' as InboxKind,
      id: r.id,
      label: 'Usulan Tempat PKL',
      status: CompanyRequestStatus.MENUNGGU,
      queuedAt: r.createdAt.toISOString(),
      student: r.student ? toStudent(r.student as StudentRow) : null,
      cohortName: null,
      company: r.name,
      detail: r.industry?.name ?? null,
    }));
  }

  private async pendingGrades(scope: MajorScope, cohortId?: string): Promise<InboxItem[]> {
    const approvals = await prisma.approval.findMany({
      where: { entityType: ENTITY_GRADE, status: ApprovalStatus.MENUNGGU },
      select: { entityId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    if (approvals.length === 0) return [];

    // Approval tidak punya relasi ke User — cakupan jurusan dijaga lewat Grade.student.
    const waitingSince = new Map<string, Date>();
    for (const a of approvals) if (!waitingSince.has(a.entityId)) waitingSince.set(a.entityId, a.createdAt);

    const rows = await prisma.grade.findMany({
      where: andWhere(
        {
          id: { in: [...waitingSince.keys()] },
          ...(cohortId ? { student: { cohortId } } : {}),
        },
        scopeUserWhere(scope, 'student')
      ) as Prisma.GradeWhereInput,
      select: {
        id: true,
        submittedAt: true,
        finalScore: true,
        predicate: true,
        student: { select: studentSelect },
      },
      orderBy: { submittedAt: 'asc' },
      take: MAX_PER_SOURCE,
    });

    return rows.map((g) => ({
      kind: 'NILAI' as InboxKind,
      id: g.id,
      label: 'Persetujuan Nilai PKL',
      status: ApprovalStatus.MENUNGGU,
      queuedAt: (g.submittedAt ?? waitingSince.get(g.id) ?? new Date()).toISOString(),
      student: g.student ? toStudent(g.student as StudentRow) : null,
      cohortName: null,
      company: null,
      detail:
        g.finalScore != null ? `Nilai akhir ${Number(g.finalScore)}${g.predicate ? ` (${g.predicate})` : ''}` : null,
    }));
  }
}

export const inboxService = new InboxService();

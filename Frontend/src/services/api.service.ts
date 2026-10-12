import http from './http';
import type { ApiResponse, PaginationMeta } from '@/types';

/**
 * Tipe data untuk modul pendaftaran & dokumen (per-orang, tanpa kelompok).
 */
export interface Registration {
  id: string;
  code: string;
  cohortId: string;
  majorId: string | null;
  status: string;
  note: string | null;
  permohonanDownloadedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  student?: {
    id: string;
    username: string;
    studentProfile: { fullName: string; nisn: string | null; class?: { name: string } | null } | null;
  } | null;
  company: {
    id: string;
    name: string;
    address: string;
    phone: string | null;
    email: string | null;
    city: string | null;
    website: string | null;
    industry?: { name: string } | null;
  };
  cohort?: { id: string; name: string; academicYear: string | null } | null;
  major?: { id: string; name: string; code: string } | null;
  document?: { id: string; type: string; status: string; files?: Array<{ id: string; isActive: boolean }> } | null;
}

export interface SaveRegistrationPayload {
  companyId: string;
  cohortId?: string | null;
  majorId?: string | null;
}

/** Opsi perusahaan untuk dropdown pendaftaran (sisa kuota > 0). */
export interface CompanyOption {
  id: string;
  name: string;
  address: string;
  city: string | null;
  phone: string | null;
  industryName: string | null;
  quota: number | null;
  terpakai: number;
  sisa: number | null;
}

export interface MasterLookups {
  cohorts: Array<{ id: string; name: string; status: string }>;
  majors: Array<{ id: string; name: string; code?: string }>;
  industries: Array<{ id: string; name: string }>;
}

export interface ClassOption {
  label: string;
  value: string;
  majorCode: string;
  majorId: string | null;
}

export interface DocumentRecord {
  id: string;
  type: string;
  status: string;
  title: string | null;
  note: string | null;
  createdAt: string;
  files?: Array<{ id: string; originalName: string; version: number; isActive: boolean }>;
}

/** Penempatan pemilik dokumen: pendaftaran milik siswa + perusahaan + pembimbing. */
export interface DocumentPlacement {
  id: string;
  code: string;
  status: string;
  majorName: string | null;
  supervisorName: string | null;
  student: {
    userId: string;
    username: string;
    fullName: string | null;
    nisn: string | null;
    className: string | null;
  };
  company: {
    name: string;
    address: string;
    phone: string | null;
    email: string | null;
    city: string | null;
    industryName: string | null;
    website: string | null;
  } | null;
}

/**
 * Service modul pendaftaran.
 */
export const registrationService = {
  async saveDraft(payload: SaveRegistrationPayload): Promise<Registration> {
    const { data } = await http.post<ApiResponse<Registration>>('/registrations', payload);
    return data.data;
  },

  async getMy(): Promise<Registration | null> {
    const { data } = await http.get<ApiResponse<Registration | null>>('/registrations/me');
    return data.data;
  },

  async submit(id: string): Promise<{ registration: Registration | null; documentId: string | null }> {
    const { data } = await http.post<ApiResponse<{ registration: Registration | null; documentId: string | null }>>(
      `/registrations/${id}/submit`
    );
    return data.data;
  },

  async list(
    status?: string,
    cohortId?: string
  ): Promise<{ items: Registration[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<Registration[]>>('/registrations', {
      params: {
        ...(status ? { status } : {}),
        ...(cohortId ? { cohortId } : {}),
      },
    });
    return { items: data.data, meta: data.meta };
  },

  async review(id: string, action: 'APPROVE' | 'REJECT', note?: string): Promise<Registration> {
    const { data } = await http.post<ApiResponse<Registration>>(`/registrations/${id}/review`, {
      action,
      note,
    });
    return data.data;
  },
};

/**
 * Service modul dokumen.
 */
export const documentService = {
  async listMine(): Promise<DocumentRecord[]> {
    const { data } = await http.get<ApiResponse<DocumentRecord[]>>('/documents/me');
    return data.data;
  },

  async list(
    status?: string,
    type?: string,
    cohortId?: string,
    page?: number,
    perPage?: number
  ): Promise<{ items: DocumentRecord[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<DocumentRecord[]>>('/documents', {
      params: {
        ...(status ? { status } : {}),
        ...(type ? { type } : {}),
        ...(cohortId ? { cohortId } : {}),
        ...(page ? { page } : {}),
        ...(perPage ? { perPage } : {}),
      },
    });
    return { items: data.data, meta: data.meta };
  },

  async upload(type: string, file: File, title?: string): Promise<void> {
    const form = new FormData();
    form.append('type', type);
    if (title) form.append('title', title);
    form.append('file', file);
    await http.post('/documents', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  async verify(id: string, action: 'APPROVE' | 'REJECT', note?: string): Promise<void> {
    await http.post(`/documents/${id}/verify`, { action, note });
  },

  async getDetail(id: string): Promise<DocumentRecord & { placement: DocumentPlacement | null }> {
    const { data } = await http.get<ApiResponse<DocumentRecord & { placement: DocumentPlacement | null }>>(
      `/documents/${id}`
    );
    return data.data;
  },
};

/**
 * Service data master.
 */
export const masterService = {
  async lookups(): Promise<MasterLookups> {
    const { data } = await http.get<ApiResponse<MasterLookups>>('/master/lookups');
    return data.data;
  },
  async classOptions(): Promise<ClassOption[]> {
    const { data } = await http.get<ApiResponse<ClassOption[]>>('/master/class-options');
    return data.data;
  },
};

/**
 * Service pembimbingan per siswa (1 siswa = 1 guru).
 */
export interface SupervisionRow {
  studentId: string;
  username: string;
  fullName: string | null;
  nisn: string | null;
  className: string | null;
  majorName: string | null;
  phase: string | null;
  cohortId: string | null;
  supervisorId: string | null;
  supervisorName: string | null;
  assignedAt: string | null;
}

export const supervisionService = {
  async list(params?: {
    page?: number;
    perPage?: number;
    search?: string;
    cohortId?: string;
    supervisorId?: string;
    unassigned?: boolean;
  }): Promise<{ items: SupervisionRow[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<SupervisionRow[]>>('/supervisions', {
      params: {
        ...(params?.page ? { page: params.page } : {}),
        ...(params?.perPage ? { perPage: params.perPage } : {}),
        ...(params?.search ? { search: params.search } : {}),
        ...(params?.cohortId ? { cohortId: params.cohortId } : {}),
        ...(params?.supervisorId ? { supervisorId: params.supervisorId } : {}),
        ...(params?.unassigned ? { unassigned: 'true' } : {}),
      },
    });
    return { items: data.data, meta: data.meta };
  },

  async assign(payload: { studentIds: string[]; supervisorId: string }): Promise<unknown> {
    const { data } = await http.post<ApiResponse<unknown>>('/supervisions/assign', payload);
    return data.data;
  },

  async unassign(studentId: string): Promise<void> {
    await http.delete(`/supervisions/${studentId}`);
  },

  async forStudent(studentId: string): Promise<{
    supervisorId: string;
    supervisorName: string;
    nip: string | null;
    phone: string | null;
    assignedAt: string;
  } | null> {
    const { data } = await http.get<ApiResponse<{
      supervisorId: string;
      supervisorName: string;
      nip: string | null;
      phone: string | null;
      assignedAt: string;
    } | null>>(`/supervisions/student/${studentId}`);
    return data.data;
  },
};

/**
 * Service perusahaan.
 */
export const companyService = {
  async list(params?: { search?: string; industryId?: string; page?: number; perPage?: number }): Promise<{ items: unknown[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<unknown[]>>('/companies', { params: params ?? {} });
    return { items: data.data, meta: data.meta };
  },
  async options(): Promise<CompanyOption[]> {
    const { data } = await http.get<ApiResponse<CompanyOption[]>>('/companies/options');
    return data.data;
  },
  async create(payload: unknown): Promise<unknown> {
    const { data } = await http.post<ApiResponse<unknown>>('/companies', payload);
    return data.data;
  },
  async update(id: string, payload: unknown): Promise<unknown> {
    const { data } = await http.patch<ApiResponse<unknown>>(`/companies/${id}`, payload);
    return data.data;
  },
};

// ============================================================================
// FASE 3 — Masa PKL Aktif (absensi, jurnal, pengaduan, kunjungan)
// ============================================================================

export interface AttendanceRecord {
  id: string;
  date: string;
  status: string;
  activity: string | null;
  checkInAt: string | null;
  checkInLat: string | null;
  checkInLong: string | null;
  checkInNote: string | null;
  checkOutAt: string | null;
  checkOutLat: string | null;
  checkOutLong: string | null;
  checkOutNote: string | null;
  isAnomaly: boolean;
  anomalyNote: string | null;
  verifiedById: string | null;
  verifiedAt: string | null;
  user?: { id: string; username: string; studentProfile?: { fullName: string; nisn?: string | null } | null };
}

export interface AttendanceStudentGroup {
  userId: string;
  username: string;
  fullName: string;
  nisn: string | null;
  total: number;
  counts: Record<string, number>;
  records: AttendanceRecord[];
}

export interface AttendanceClassSection {
  className: string;
  studentCount: number;
  students: AttendanceStudentGroup[];
}

export interface JournalRecord {
  id: string;
  date: string;
  activity: string;
  result: string | null;
  obstacles: string | null;
  supervisorNote: string | null;
  verifiedAt?: string | null;
  verifiedById?: string | null;
  verificationNote?: string | null;
  user?: { id: string; username: string; studentProfile?: { fullName: string; nisn?: string | null } | null };
}

export interface ComplaintRecord {
  id: string;
  subject: string;
  body: string;
  status: string;
  authorId: string;
  author?: { id: string; username: string; studentProfile?: { fullName: string } | null };
  replies?: Array<{ id: string; body: string; author?: { id: string; username: string }; createdAt: string }>;
  createdAt: string;
}

export type VisitStatus = 'TERJADWAL' | 'TERTUNDA' | 'BATAL' | 'SELESAI';

export interface VisitRecord {
  id: string;
  status: VisitStatus;
  scheduledAt: string;
  visitedAt: string | null;
  note: string | null;
  photoPath?: string | null;
  photoName?: string | null;
  supervisor?: { id: string; username: string };
  student?: { id: string; username: string; studentProfile?: { fullName: string } | null } | null;
  company?: { id: string; name: string } | null;
}

export interface GeoPayload {
  lat: number;
  long: number;
  note?: string | null;
}

/** Service absensi harian. */
export const attendanceService = {
  async today(): Promise<AttendanceRecord | null> {
    const { data } = await http.get<ApiResponse<AttendanceRecord | null>>('/attendances/today');
    return data.data;
  },
  async submit(payload: {
    status: 'HADIR' | 'IZIN' | 'SAKIT' | 'ALPHA';
    activity: string;
    geo: GeoPayload;
  }): Promise<AttendanceRecord> {
    const { data } = await http.post<ApiResponse<AttendanceRecord>>('/attendances/submit', payload);
    return data.data;
  },
  async verify(id: string, action: 'APPROVE' | 'REJECT', note?: string): Promise<AttendanceRecord> {
    const { data } = await http.post<ApiResponse<AttendanceRecord>>(`/attendances/${id}/verify`, { action, note });
    return data.data;
  },
  async checkIn(geo: GeoPayload): Promise<AttendanceRecord> {
    const { data } = await http.post<ApiResponse<AttendanceRecord>>('/attendances/check-in', geo);
    return data.data;
  },
  async checkOut(geo: GeoPayload): Promise<AttendanceRecord> {
    const { data } = await http.post<ApiResponse<AttendanceRecord>>('/attendances/check-out', geo);
    return data.data;
  },
  async listMine(): Promise<AttendanceRecord[]> {
    const { data } = await http.get<ApiResponse<AttendanceRecord[]>>('/attendances/me');
    return data.data;
  },
  async list(params?: { userId?: string; status?: string; from?: string; to?: string; page?: number; perPage?: number }): Promise<{ items: AttendanceRecord[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<AttendanceRecord[]>>('/attendances', { params: params ?? {} });
    return { items: data.data, meta: data.meta };
  },
  async summary(params?: { userId?: string; from?: string; to?: string }): Promise<Array<{ status: string; _count: number }>> {
    const { data } = await http.get<ApiResponse<Array<{ status: string; _count: number }>>>('/attendances/summary', { params: params ?? {} });
    return data.data;
  },
  /** Monitoring admin/guru: absensi per kelas → siswa (termasuk koordinat GPS). */
  async byClass(params?: { from?: string; to?: string; status?: string; cohortId?: string }): Promise<{ classes: AttendanceClassSection[]; total: number }> {
    const { data } = await http.get<ApiResponse<{ classes: AttendanceClassSection[]; total: number }>>('/attendances/by-class', { params: params ?? {} });
    return data.data;
  },
};

/** Service jurnal kegiatan. */
export const journalService = {
  async create(payload: { activity: string; result?: string | null; obstacles?: string | null }): Promise<JournalRecord> {
    const { data } = await http.post<ApiResponse<JournalRecord>>('/journals', payload);
    return data.data;
  },
  async listMine(): Promise<JournalRecord[]> {
    const { data } = await http.get<ApiResponse<JournalRecord[]>>('/journals/me');
    return data.data;
  },
  async list(params?: { userId?: string; page?: number; perPage?: number }): Promise<{ items: JournalRecord[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<JournalRecord[]>>('/journals', { params: params ?? {} });
    return { items: data.data, meta: data.meta };
  },
  async addSupervisorNote(id: string, note: string): Promise<JournalRecord> {
    const { data } = await http.post<ApiResponse<JournalRecord>>(`/journals/${id}/supervisor-note`, { note });
    return data.data;
  },
  async verify(id: string, note?: string): Promise<JournalRecord> {
    const { data } = await http.post<ApiResponse<JournalRecord>>(`/journals/${id}/verify`, { note });
    return data.data;
  },
};

/** Service pengaduan. */
export const complaintService = {
  async create(payload: { subject: string; body: string }): Promise<ComplaintRecord> {
    const { data } = await http.post<ApiResponse<ComplaintRecord>>('/complaints', payload);
    return data.data;
  },
  async listMine(): Promise<ComplaintRecord[]> {
    const { data } = await http.get<ApiResponse<ComplaintRecord[]>>('/complaints/me');
    return data.data;
  },
  async list(params?: { status?: string; authorId?: string; cohortId?: string; page?: number; perPage?: number }): Promise<{ items: ComplaintRecord[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<ComplaintRecord[]>>('/complaints', { params: params ?? {} });
    return { items: data.data, meta: data.meta };
  },
  async detail(id: string): Promise<ComplaintRecord> {
    const { data } = await http.get<ApiResponse<ComplaintRecord>>(`/complaints/${id}`);
    return data.data;
  },
  async reply(id: string, body: string): Promise<ComplaintRecord> {
    const { data } = await http.post<ApiResponse<ComplaintRecord>>(`/complaints/${id}/replies`, { body });
    return data.data;
  },
  async close(id: string): Promise<ComplaintRecord> {
    const { data } = await http.post<ApiResponse<ComplaintRecord>>(`/complaints/${id}/close`);
    return data.data;
  },
};

/** Service kunjungan/monitoring guru (per siswa). */
export const visitService = {
  async create(payload: { studentId?: string | null; companyId?: string | null; scheduledAt: string; note?: string | null }): Promise<VisitRecord> {
    const { data } = await http.post<ApiResponse<VisitRecord>>('/visits', payload);
    return data.data;
  },
  async listMine(): Promise<VisitRecord[]> {
    const { data } = await http.get<ApiResponse<VisitRecord[]>>('/visits/me');
    return data.data;
  },
  async list(params?: { studentId?: string; supervisorId?: string; page?: number; perPage?: number }): Promise<{ items: VisitRecord[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<VisitRecord[]>>('/visits', { params: params ?? {} });
    return { items: data.data, meta: data.meta };
  },
  /** Selesaikan monitoring — WAJIB upload foto bukti (JPG/PNG). */
  async complete(id: string, note: string | undefined, photo: File): Promise<VisitRecord> {
    const form = new FormData();
    form.append('photo', photo);
    if (note) form.append('note', note);
    const { data } = await http.post<ApiResponse<VisitRecord>>(`/visits/${id}/complete`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.data;
  },
  /** Tunda monitoring (opsional: jadwal baru + catatan). */
  async postpone(id: string, payload?: { scheduledAt?: string; note?: string | null }): Promise<VisitRecord> {
    const { data } = await http.post<ApiResponse<VisitRecord>>(`/visits/${id}/postpone`, payload ?? {});
    return data.data;
  },
  /** Lanjutkan kembali kunjungan yang ditunda. */
  async resume(id: string, payload?: { scheduledAt?: string }): Promise<VisitRecord> {
    const { data } = await http.post<ApiResponse<VisitRecord>>(`/visits/${id}/resume`, payload ?? {});
    return data.data;
  },
  /** Batalkan kunjungan (status final). */
  async cancel(id: string, note?: string | null): Promise<VisitRecord> {
    const { data } = await http.post<ApiResponse<VisitRecord>>(`/visits/${id}/cancel`, { note: note ?? undefined });
    return data.data;
  },
};

// ============================================================================
// FASE 4 — Pasca-PKL (nilai per siswa + approval guru, feedback, surat bulk)
// ============================================================================

export interface GradeApprovalInfo {
  status: string;
  actorId: string | null;
  note: string | null;
  actedAt: string | null;
}

export interface GradeRecord {
  id: string;
  studentId: string;
  giverId: string | null;
  giverRole: string;
  scoreDudi: number | string | null;
  scoreGuidance: number | string | null;
  finalScore: number | string | null;
  predicate: string | null;
  note: string | null;
  approval?: GradeApprovalInfo | null;
  aspects?: Array<{ id?: string; label: string; score: number | string }>;
  createdAt: string;
  student?: { id: string; username: string; studentProfile?: { fullName: string | null } | null };
}

export interface GradeRecapStudent {
  userId: string;
  username: string;
  fullName: string;
  nisn: string | null;
  companyName: string | null;
  supervisorName: string | null;
  approvalStatus: string | null;
  grade: GradeRecord | null;
}

export interface GradeRecapClass {
  className: string;
  studentCount: number;
  gradedCount: number;
  students: GradeRecapStudent[];
}

export interface GradeRecapByClass {
  classes: GradeRecapClass[];
  totalStudents: number;
  totalGraded: number;
}

export interface FeedbackRecord {
  id: string;
  authorId: string;
  studentId: string | null;
  body: string;
  author?: { id: string; username: string };
  createdAt: string;
}

export interface PhaseTransitionResult {
  studentId: string;
  from: string;
  to: string;
}

/** Service penilaian PKL (input siswa/admin, approval guru). */
export const gradeService = {
  async inputGrade(payload: { studentId?: string; scoreDudi?: number; aspects?: Array<{ label: string; score: number }>; note?: string | null }): Promise<GradeRecord> {
    const { data } = await http.post<ApiResponse<GradeRecord>>('/grades', payload);
    return data.data;
  },
  async approve(gradeId: string, payload: { approved: boolean; note?: string | null }): Promise<unknown> {
    const { data } = await http.post<ApiResponse<unknown>>(`/grades/${gradeId}/approve`, payload);
    return data.data;
  },
  async inputGuidance(gradeId: string, payload: { scoreGuidance: number; note?: string | null }): Promise<GradeRecord> {
    const { data } = await http.post<ApiResponse<GradeRecord>>(`/grades/${gradeId}/guidance`, payload);
    return data.data;
  },
  async myGrades(): Promise<GradeRecord[]> {
    const { data } = await http.get<ApiResponse<GradeRecord[]>>('/grades/me');
    return data.data;
  },
  async list(params?: { page?: number; perPage?: number; studentId?: string }): Promise<{ items: GradeRecord[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<GradeRecord[]>>('/grades', { params: params ?? {} });
    return { items: data.data, meta: data.meta };
  },
  async recap(): Promise<GradeRecord[]> {
    const { data } = await http.get<ApiResponse<GradeRecord[]>>('/grades/recap');
    return data.data;
  },
  /** Rekap admin: penilaian per kelas → siswa (termasuk yang belum dinilai). */
  async recapByClass(params?: { cohortId?: string }): Promise<GradeRecapByClass> {
    const { data } = await http.get<ApiResponse<GradeRecapByClass>>('/grades/recap-by-class', { params: params ?? {} });
    return data.data;
  },
};

/** Service feedback (admin/guru → siswa). */
export const feedbackService = {
  async create(payload: { studentId: string; body: string }): Promise<FeedbackRecord> {
    const { data } = await http.post<ApiResponse<FeedbackRecord>>('/feedbacks', payload);
    return data.data;
  },
  async listByStudent(studentId: string): Promise<FeedbackRecord[]> {
    const { data } = await http.get<ApiResponse<FeedbackRecord[]>>(`/feedbacks/student/${studentId}`);
    return data.data;
  },
  async list(params?: { studentId?: string; page?: number; perPage?: number }): Promise<{ items: FeedbackRecord[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<FeedbackRecord[]>>('/feedbacks', { params: params ?? {} });
    return { items: data.data, meta: data.meta };
  },
};

export interface LetterRecord {
  id: string;
  type: string;
  number: string | null;
  subject: string | null;
  signerName: string;
  createdById: string | null;
  supervisorName: string | null;
  studentCount: number;
  createdAt: string;
}

export interface BulkLetterResult {
  letterId: string;
  relativePath?: string;
  signerName: string;
  signerNip: string | null;
  studentCount: number;
  notified: number;
}

/** Service Fase 4 — surat bulk + transisi fase. */
export const phase4Service = {
  async generateBulkLetter(payload: {
    type: 'SURAT_PENGANTAR' | 'SURAT_MONITORING' | 'SURAT_PENJEMPUTAN';
    number?: string | null;
    subject?: string | null;
    replyNumber?: string | null;
    supervisorId?: string;
  }): Promise<BulkLetterResult> {
    const { data } = await http.post<ApiResponse<BulkLetterResult>>('/phase4/bulk-letter', payload);
    return data.data;
  },
  async completePhase(studentIds: string[]): Promise<{ results: PhaseTransitionResult[]; skipped: Array<{ studentId: string; reason: string }> }> {
    const { data } = await http.post<ApiResponse<{ results: PhaseTransitionResult[]; skipped: Array<{ studentId: string; reason: string }> }>>('/phase4/complete', { studentIds });
    return data.data;
  },
  async listLetters(params?: { type?: string }): Promise<LetterRecord[]> {
    const { data } = await http.get<ApiResponse<LetterRecord[]>>('/phase4/letters', { params: params ?? {} });
    return data.data;
  },
  async downloadLetter(letter: LetterRecord): Promise<void> {
    const num = letter.number ? `${letter.number}-` : '';
    await downloadFile(`/phase4/letters/${letter.id}/download`, `${letter.type}-${num}${letter.id}.pdf`);
  },
  /** Unduh surat terbit berdasarkan ID (dipakai hasil generator surat admin). */
  async downloadLetterById(letterId: string, filename = 'surat.pdf'): Promise<void> {
    await downloadFile(`/phase4/letters/${letterId}/download`, filename);
  },
  /** Unduh Laporan Hasil PKL (per siswa; guru/staff boleh memilih siswa). */
  async downloadFinalReport(studentId?: string): Promise<void> {
    await downloadFile('/phase4/final-report', 'Laporan-Hasil-PKL.pdf', studentId ? { studentId } : undefined);
  },
};

// ============================================================================
// GENERATOR SURAT ADMIN (Surat Permohonan / Penugasan)
// ============================================================================

export interface LetterGeneratorResult {
  letterId: string;
  signerName: string;
  signerNip: string | null;
  /** Jumlah siswa tercantum di surat (permohonan: siswa per perusahaan; penugasan: siswa dibimbing). */
  studentCount?: number;
  /** Penugasan: jumlah perusahaan tujuan. */
  tujuanCount?: number;
}

/** Service generator surat admin (Permohonan per-perusahaan, Penugasan per-guru pembimbing). */
export const letterGeneratorService = {
  /** Surat Permohonan PKL — satu surat untuk satu perusahaan, multi-siswa satu gelombang. */
  async generatePermohonan(payload: { cohortId: string; companyId: string; number?: string | null }): Promise<LetterGeneratorResult> {
    const { data } = await http.post<ApiResponse<LetterGeneratorResult>>('/letters/permohonan', payload);
    return data.data;
  },
  /** Surat Penugasan Pembimbing — satu surat per guru pembimbing (dasar opsional override). */
  async generatePenugasan(payload: { supervisorId: string; number?: string | null; dasar?: string | null }): Promise<LetterGeneratorResult> {
    const { data } = await http.post<ApiResponse<LetterGeneratorResult>>('/letters/penugasan', payload);
    return data.data;
  },
};

// ============================================================================
// MASTER SISWA (StudentRegistry)
// ============================================================================

export interface StudentRegistryRecord {
  id: string;
  nisn: string;
  fullName: string;
  className: string;
  cohortId: string;
  majorId: string | null;
  major?: { name: string; code: string } | null;
  isActive: boolean;
}

export interface StudentRegistryImportResult {
  total: number;
  created: number;
  updated: number;
  duplicates: { nisn: string; fullName: string; reason: string }[];
  errors: string[];
}

export interface StudentRegistryInspectResult {
  headers: string[];
  detected: { nisn: string | null; fullName: string | null; className: string | null; majorCode: string | null };
}

export interface StudentRegistryHeaderMapping {
  nisn: string;
  fullName: string;
  className: string;
  majorCode?: string;
}

/** Service Master Siswa. */
export const studentRegistryService = {
  async lookup(nisn: string, cohortId: string): Promise<StudentRegistryRecord | null> {
    const { data } = await http.get<ApiResponse<StudentRegistryRecord | null>>(`/student-registry/lookup/${nisn}`, {
      params: { cohortId },
    });
    return data.data;
  },
  async list(cohortId: string, params?: { page?: number; perPage?: number; search?: string }): Promise<{ items: StudentRegistryRecord[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<StudentRegistryRecord[]>>('/student-registry', {
      params: { cohortId, ...params },
    });
    return { items: data.data, meta: data.meta };
  },
  async create(input: { cohortId: string; nisn: string; fullName: string; className: string; majorCode?: string }): Promise<StudentRegistryRecord> {
    const { data } = await http.post<ApiResponse<StudentRegistryRecord>>('/student-registry', input);
    return data.data;
  },
  async inspect(file: File): Promise<StudentRegistryInspectResult> {
    const form = new FormData();
    form.append('file', file);
    const { data } = await http.post<ApiResponse<StudentRegistryInspectResult>>(
      '/student-registry/inspect',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data.data;
  },
  async importExcel(cohortId: string, file: File, mapping?: StudentRegistryHeaderMapping): Promise<StudentRegistryImportResult> {
    const form = new FormData();
    form.append('cohortId', cohortId);
    form.append('file', file);
    if (mapping) {
      form.append('mapNisn', mapping.nisn);
      form.append('mapFullName', mapping.fullName);
      form.append('mapClassName', mapping.className);
      if (mapping.majorCode) form.append('mapMajorCode', mapping.majorCode);
    }
    const { data } = await http.post<ApiResponse<StudentRegistryImportResult>>(
      '/student-registry/import',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data.data;
  },
  async remove(id: string): Promise<{
    fullName: string;
    nisn: string;
    accounts: number;
    attendance: number;
    journals: number;
    grades: number;
    documents: number;
    registrations: number;
  }> {
    const { data } = await http.delete<
      ApiResponse<{
        fullName: string;
        nisn: string;
        accounts: number;
        attendance: number;
        journals: number;
        grades: number;
        documents: number;
        registrations: number;
      }>
    >(`/student-registry/${id}`);
    return data.data;
  },
};

// ============================================================================
// MASTER GURU (TeacherRegistry) — akun login (username = NIP) dibuat otomatis
// ============================================================================

export interface TeacherRegistryRecord {
  id: string;
  nip: string;
  fullName: string;
  cohortId: string;
  majorId: string | null;
  major?: { name: string; code: string } | null;
  isActive: boolean;
}

/** Akun guru yang baru dibuat otomatis — password hanya ditampilkan sekali. */
export interface TeacherProvisionedAccount {
  userId: string;
  username: string;
  nip: string;
  fullName: string;
  password: string;
}

export interface TeacherRegistryImportResult {
  total: number;
  created: number;
  updated: number;
  duplicates: { nip: string; fullName: string; reason: string }[];
  errors: string[];
  /** Hasil pembuatan akun otomatis setelah import. */
  accounts: {
    created: TeacherProvisionedAccount[];
    skipped: number;
    errors: { nip: string; reason: string }[];
  };
}

export interface TeacherRegistryInspectResult {
  headers: string[];
  detected: { nip: string | null; fullName: string | null; majorCode: string | null };
}

export interface TeacherRegistryHeaderMapping {
  nip: string;
  fullName: string;
  majorCode?: string;
}

/** Service Master Guru. */
export const teacherRegistryService = {
  async list(cohortId: string, params?: { page?: number; perPage?: number; search?: string }): Promise<{ items: TeacherRegistryRecord[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<TeacherRegistryRecord[]>>('/teacher-registry', {
      params: { cohortId, ...params },
    });
    return { items: data.data, meta: data.meta };
  },
  /** Tambah guru manual — akun (username = NIP) dibuat otomatis, password dikembalikan sekali. */
  async create(input: { cohortId: string; nip: string; fullName: string; majorCode?: string }): Promise<{ record: TeacherRegistryRecord; account: TeacherProvisionedAccount | null; restored: boolean }> {
    const { data } = await http.post<ApiResponse<{ record: TeacherRegistryRecord; account: TeacherProvisionedAccount | null; restored: boolean }>>('/teacher-registry', input);
    return data.data;
  },
  async inspect(file: File): Promise<TeacherRegistryInspectResult> {
    const form = new FormData();
    form.append('file', file);
    const { data } = await http.post<ApiResponse<TeacherRegistryInspectResult>>(
      '/teacher-registry/inspect',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data.data;
  },
  async importExcel(cohortId: string, file: File, mapping?: TeacherRegistryHeaderMapping): Promise<TeacherRegistryImportResult> {
    const form = new FormData();
    form.append('cohortId', cohortId);
    form.append('file', file);
    if (mapping) {
      form.append('mapNip', mapping.nip);
      form.append('mapFullName', mapping.fullName);
      if (mapping.majorCode) form.append('mapMajorCode', mapping.majorCode);
    }
    const { data } = await http.post<ApiResponse<TeacherRegistryImportResult>>(
      '/teacher-registry/import',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data.data;
  },
  /** Tambal akun untuk baris master yang belum punya (idempoten). */
  async ensureAccounts(cohortId: string): Promise<{ created: TeacherProvisionedAccount[]; skipped: number; errors: { nip: string; reason: string }[] }> {
    const { data } = await http.post<ApiResponse<{ created: TeacherProvisionedAccount[]; skipped: number; errors: { nip: string; reason: string }[] }>>(
      '/teacher-registry/ensure-accounts',
      { cohortId }
    );
    return data.data;
  },
  async remove(id: string): Promise<{
    fullName: string;
    nip: string;
    accounts: number;
    supervisions: number;
    visits: number;
  }> {
    const { data } = await http.delete<
      ApiResponse<{
        fullName: string;
        nip: string;
        accounts: number;
        supervisions: number;
        visits: number;
      }>
    >(`/teacher-registry/${id}`);
    return data.data;
  },
};

// ============================================================================
// MODUL PENDUKUNG
// ============================================================================

export interface CohortRecord {
  id: string;
  name: string;
  academicYear: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  description: string | null;
  /** Gelombang aktif global (hanya satu). */
  isActive?: boolean;
}

export interface UserRecord {
  id: string;
  username: string;
  identifier: string | null;
  email: string | null;
  role: string;
  isActive: boolean;
  phase: string | null;
  cohortId: string | null;
  studentProfile?: { fullName: string; nisn: string; class?: { name: string } | null } | null;
  teacherProfile?: { fullName: string; nip: string } | null;
}

export interface StudentPklData {
  user: {
    id: string;
    username: string;
    identifier: string | null;
    role: string;
    phase: string | null;
    isActive: boolean;
    mustChangePassword: boolean;
    lastLoginAt: string | null;
    createdAt: string;
    cohort: { name: string; academicYear: string | null } | null;
  };
  pendaftaran: {
    code: string;
    status: string;
    submittedAt: string | null;
    permohonanDownloadedAt: string | null;
    cohort: { name: string; academicYear: string | null } | null;
    majorName: string | null;
    company: {
      name: string;
      address: string;
      phone: string | null;
      city: string | null;
      industry: string | null;
    } | null;
  } | null;
  fase2: {
    profile: {
      fullName: string;
      nisn: string;
      phone: string | null;
      address: string | null;
      gender: string | null;
      birthDate: string | null;
      className: string | null;
      majorName: string | null;
    };
    parentData: {
      fatherName: string | null;
      fatherPhone: string | null;
      motherName: string | null;
      motherPhone: string | null;
      guardianName: string | null;
      guardianPhone: string | null;
    } | null;
    pernyataan: { status: string; note: string | null; verifiedAt: string | null; createdAt: string } | null;
  } | null;
  pembimbing: {
    supervisorName: string;
    assignedAt: string;
  } | null;
}

export interface AnnouncementRecord {
  id: string;
  title: string;
  body: string;
  isPinned: boolean;
  author?: { id: string; username: string };
  createdAt: string;
}

export interface NotificationRecord {
  id: string;
  title: string;
  body: string | null;
  type: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  actor?: { id: string; username: string };
  createdAt: string;
}

/** Service manajemen gelombang. */
export const cohortService = {
  async create(payload: { name: string; academicYear?: string | null; description?: string | null }): Promise<CohortRecord> {
    const { data } = await http.post<ApiResponse<CohortRecord>>('/cohorts', payload);
    return data.data;
  },
  async update(
    id: string,
    payload: Partial<CohortRecord>
  ): Promise<CohortRecord & { deactivatedUsers?: number; restoredUsers?: number }> {
    const { data } = await http.patch<ApiResponse<CohortRecord & { deactivatedUsers?: number; restoredUsers?: number }>>(
      `/cohorts/${id}`,
      payload
    );
    return data.data;
  },
  async list(params?: { status?: string }): Promise<{ items: CohortRecord[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<CohortRecord[]>>('/cohorts', { params: params ?? {} });
    return { items: data.data, meta: data.meta };
  },
  /** Tetapkan gelombang aktif global (hanya gelombang OPEN). */
  async setActive(cohortId: string): Promise<CohortRecord> {
    const { data } = await http.post<ApiResponse<CohortRecord>>('/cohorts/active', { cohortId });
    return data.data;
  },
};

/**
 * Pilih gelombang untuk filter default tampilan admin: utamakan yang OPEN
 * (gelombang aktif), fallback ke gelombang pertama. Data gelombang lama tidak
 * tampil kecuali admin memilihnya secara manual.
 */
export const pickActiveCohortId = (cohorts: Array<{ id: string; status?: string }>): string =>
  cohorts.find((c) => c.status === 'OPEN')?.id ?? cohorts[0]?.id ?? '';

/** Hasil bulk pembuatan akun siswa dari Master Siswa. */
export interface ProvisionStudentsResult {
  total: number;
  created: Array<{ userId: string; username: string; nisn: string; fullName: string; password: string }>;
  skipped: Array<{ nisn: string; fullName: string; reason: string }>;
  /** Jumlah profil siswa lama yang kelasnya di-backfill dari Master Siswa. */
  classBackfilled: number;
}

/** Service manajemen user. */
export const userManageService = {
  async create(payload: { username: string; password: string; role: string; identifier?: string; fullName?: string; nisn?: string; nip?: string; cohortId?: string | null; majorId?: string | null }): Promise<UserRecord & { password?: string }> {
    const { data } = await http.post<ApiResponse<UserRecord & { password?: string }>>('/users', payload);
    return data.data;
  },
  /** Bulk: buat akun siswa (username = NISN) dari baris Master Siswa gelombang tsb. */
  async provisionStudents(cohortId: string): Promise<ProvisionStudentsResult> {
    const { data } = await http.post<ApiResponse<ProvisionStudentsResult>>('/users/provision-students', { cohortId });
    return data.data;
  },
  async update(id: string, payload: Partial<UserRecord>): Promise<UserRecord> {
    const { data } = await http.patch<ApiResponse<UserRecord>>(`/users/${id}`, payload);
    return data.data;
  },
  async resetPassword(id: string, payload: { newPassword?: string; generateRandom?: boolean }): Promise<{ plainPassword: string }> {
    const { data } = await http.post<ApiResponse<{ plainPassword: string }>>(`/users/${id}/reset-password`, payload);
    return data.data;
  },
  async list(params?: { role?: string; search?: string; cohortId?: string; page?: number; perPage?: number }): Promise<{ items: UserRecord[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<UserRecord[]>>('/users', { params: params ?? {} });
    return { items: data.data, meta: data.meta };
  },
  /** Data PKL siswa (pendaftaran per-orang + profil + pembimbing) — khusus Admin. */
  async getStudentData(id: string): Promise<StudentPklData> {
    const { data } = await http.get<ApiResponse<StudentPklData>>(`/users/${id}/student-data`);
    return data.data;
  },
  async remove(id: string): Promise<UserRecord> {
    const { data } = await http.delete<ApiResponse<UserRecord>>(`/users/${id}`);
    return data.data;
  },
};

/** Service pengumuman. */
export const announcementService = {
  async create(payload: { title: string; body: string; cohortId?: string | null }): Promise<AnnouncementRecord> {
    const { data } = await http.post<ApiResponse<AnnouncementRecord>>('/announcements', payload);
    return data.data;
  },
  async list(params?: { cohortId?: string }): Promise<{ items: AnnouncementRecord[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<AnnouncementRecord[]>>('/announcements', { params: params ?? {} });
    return { items: data.data, meta: data.meta };
  },
};

/** Service notifikasi. */
export const notificationService = {
  async listMine(): Promise<NotificationRecord[]> {
    const { data } = await http.get<ApiResponse<NotificationRecord[]>>('/notifications/me');
    return data.data;
  },
  async markRead(id: string): Promise<void> {
    await http.patch(`/notifications/${id}/read`);
  },
  async markAllRead(): Promise<void> {
    await http.patch('/notifications/read-all');
  },
};

/** Service dashboard. */
export const dashboardService = {
  async stats(): Promise<Record<string, unknown>> {
    const { data } = await http.get<ApiResponse<Record<string, unknown>>>('/dashboard/stats');
    return data.data;
  },
};

/** Service audit log. */
export const auditLogService = {
  async list(params?: { action?: string; actorId?: string; search?: string }): Promise<{ items: AuditLogRecord[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<AuditLogRecord[]>>('/audit-logs', { params: params ?? {} });
    return { items: data.data, meta: data.meta };
  },
};

// ============================================================================
// STUDENT WORKFLOW — Fase Efektif Berdasarkan Jadwal
// ============================================================================

export interface WorkflowPhaseInfo {
  phase: string;
  startDate: string | null;
  endDate: string | null;
}

export interface StudentWorkflowStatus {
  effectivePhase: string | null;
  hasCompleted: boolean;
  currentSchedule: WorkflowPhaseInfo | null;
  nextSchedule: WorkflowPhaseInfo | null;
  registrationStatus: string | null;
  registrationDocumentId: string | null;
  /** Gerbang Fase 1 → Fase 2: siswa sudah mengunduh Surat Permohonan? */
  permohonanDownloaded: boolean;
  hasParentData: boolean;
  hasSuratPenerimaan: boolean;
  hasSuratPenerimaanPending: boolean;
  suratPenerimaanStatus: string | null;
  suratPenerimaanNote: string | null;
  hasSuratPernyataan: boolean;
  hasLaporanAkhir: boolean;
}

/** Service status workflow siswa (berdasarkan jadwal fase). */
export const studentWorkflowService = {
  async getStatus(): Promise<StudentWorkflowStatus> {
    const { data } = await http.get<ApiResponse<StudentWorkflowStatus>>('/student/workflow');
    return data.data;
  },
};

/** Service export. */
export const exportService = {
  async grades(params?: { studentId?: string; cohortId?: string }): Promise<unknown[]> {
    const { data } = await http.get<ApiResponse<unknown[]>>('/export/grades', { params: params ?? {} });
    return data.data;
  },
  async attendances(params?: { studentId?: string; cohortId?: string; from?: string; to?: string }): Promise<unknown[]> {
    const { data } = await http.get<ApiResponse<unknown[]>>('/export/attendances', { params: params ?? {} });
    return data.data;
  },
};

/** Service profil (parent data). */
export const profileService = {
  async getParentData(): Promise<unknown> {
    const { data } = await http.get<ApiResponse<unknown>>('/profile/parent');
    return data.data;
  },
  async upsertParentData(payload: Record<string, unknown>): Promise<unknown> {
    const { data } = await http.put<ApiResponse<unknown>>('/profile/parent', payload);
    return data.data;
  },
};

// ============================================================================
// M7 - SURAT PERNYATAAN PKL (DOCX) & JADWAL FASE
// ============================================================================

export interface PernyataanPrefill {
  namaSiswa: string;
  kelasJurusan: string;
  namaOrtu: string;
  alamatSiswa: string;
  hpOrtu: string;
  hpSiswa: string;
  tempatPkl: string;
  tanggalPkl: string;
  tahunPelajaran: string;
}

export interface PernyataanResult {
  documentId: string;
  fileId: string;
  fileName: string;
}

/** Service Surat Pernyataan PKL (Fase 2: pendaftaran ulang). */
export const pernyataanService = {
  async prefill(): Promise<PernyataanPrefill> {
    const { data } = await http.get<ApiResponse<PernyataanPrefill>>('/pernyataan/prefill');
    return data.data;
  },
  async generate(payload: Partial<PernyataanPrefill>): Promise<PernyataanResult> {
    const { data } = await http.post<ApiResponse<PernyataanResult>>('/pernyataan/generate', payload);
    return data.data;
  },
  async download(documentId: string, filename = 'surat-pernyataan.pdf'): Promise<void> {
    await downloadFile(`/documents/${documentId}/download`, filename);
  },
};

export interface PhaseScheduleRecord {
  id: string;
  cohortId: string;
  phase: string;
  startDate: string | null;
  endDate: string | null;
}

export interface PhaseScheduleOverview {
  schedules: PhaseScheduleRecord[];
  currentPhase: string | null;
}

/** Service jadwal fase per gelombang (superadmin & kepsek). */
export const phaseScheduleService = {
  async list(cohortId: string): Promise<PhaseScheduleRecord[]> {
    const { data } = await http.get<ApiResponse<PhaseScheduleRecord[]>>(`/cohorts/${cohortId}/phase-schedule`);
    return data.data;
  },
  async overview(cohortId: string): Promise<PhaseScheduleOverview> {
    const { data } = await http.get<ApiResponse<PhaseScheduleOverview>>(`/cohorts/${cohortId}/phase-schedule/overview`);
    return data.data;
  },
  async replace(cohortId: string, items: Array<{ phase: string; startDate?: string | null; endDate?: string | null }>): Promise<PhaseScheduleRecord[]> {
    const { data } = await http.put<ApiResponse<PhaseScheduleRecord[]>>(`/cohorts/${cohortId}/phase-schedule`, { items });
    return data.data;
  },
};

/** Helper: download file via Axios (membawa token auth). */
export const downloadFile = async (url: string, filename: string, params?: Record<string, string>): Promise<void> => {
  const { data } = await http.get(url, { responseType: 'blob', params: params ?? {} });
  const blob = new Blob([data]);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

/** Buka file terproteksi (otomatis ikut auth) di tab baru — pratinjau foto bukti. */
export const openFileInTab = async (url: string): Promise<void> => {
  const { data } = await http.get(url, { responseType: 'blob' });
  const objectUrl = URL.createObjectURL(new Blob([data]));
  window.open(objectUrl, '_blank');
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
};

import http from './http';
import type { ApiResponse, PaginationMeta } from '@/types';

/**
 * Tipe data untuk modul pendaftaran & dokumen (subset yang dipakai FE).
 */
export interface RegistrationMember {
  id?: string;
  userId?: string | null;
  fullName: string;
  nisn?: string | null;
  className?: string | null;
  phone?: string | null;
  address?: string | null;
  isLeader: boolean;
}

export interface Registration {
  id: string;
  code: string;
  groupName: string;
  cohortId: string;
  majorId: string | null;
  companyName: string;
  companyAddress: string;
  companyIndustry: string | null;
  companyPhone: string | null;
  companyCity: string | null;
  companyWebsite: string | null;
  companyContacts: string[] | null;
  status: string;
  note: string | null;
  members: RegistrationMember[];
  document?: { id: string; type: string; status: string } | null;
  createdAt: string;
}

export interface SaveRegistrationPayload {
  groupName: string;
  cohortId: string;
  majorId?: string | null;
  companyName: string;
  companyAddress: string;
  companyIndustry?: string | null;
  companyPhone?: string | null;
  companyCity?: string | null;
  companyWebsite?: string | null;
  companyContacts?: string[] | null;
  members: RegistrationMember[];
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

export interface DocumentGroupMember {
  userId: string;
  fullName: string;
  nisn: string | null;
  className: string | null;
  isLeader: boolean;
}

export interface DocumentGroupDetail {
  id: string;
  name: string;
  code: string;
  status: string;
  majorName: string | null;
  source: 'GROUP' | 'REGISTRATION';
  company: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    city: string | null;
    industryName: string | null;
    website: string | null;
    contacts: string[] | null;
  } | null;
  members: DocumentGroupMember[];
}

export interface GroupedRegistration {
  groupName: string;
  companyName: string;
  companyAddress: string;
  companyIndustry: string | null;
  companyPhone: string | null;
  companyCity: string | null;
  companyWebsite: string | null;
  companyContacts: string[] | null;
  majorName: string | null;
  cohortName: string | null;
  cohortId: string | null;
  registrations: Array<{
    id: string;
    code: string;
    leaderId: string;
    leaderName: string;
    status: string;
    createdAt: string;
    members: RegistrationMember[];
  }>;
  totalCount: number;
  approvedCount: number;
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

  async submit(id: string): Promise<{ documentId: string }> {
    const { data } = await http.post<ApiResponse<{ documentId: string }>>(
      `/registrations/${id}/submit`
    );
    return data.data;
  },

  async list(
    status?: string,
    opts?: { withoutGroup?: boolean }
  ): Promise<{ items: Registration[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<Registration[]>>('/registrations', {
      params: {
        ...(status ? { status } : {}),
        ...(opts?.withoutGroup ? { withoutGroup: 'true' } : {}),
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
  async grouped(cohortId?: string): Promise<GroupedRegistration[]> {
    const { data } = await http.get<ApiResponse<GroupedRegistration[]>>('/registrations/grouped', {
      params: cohortId ? { cohortId } : {},
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
    cohortId?: string
  ): Promise<{ items: DocumentRecord[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<DocumentRecord[]>>('/documents', {
      params: {
        ...(status ? { status } : {}),
        ...(type ? { type } : {}),
        ...(cohortId ? { cohortId } : {}),
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

  async getDetail(id: string): Promise<DocumentRecord & { group: DocumentGroupDetail | null }> {
    const { data } = await http.get<ApiResponse<DocumentRecord & { group: DocumentGroupDetail | null }>>(
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
 * Service kelompok.
 */
export const groupService = {
  async setDudiMentors(id: string, mentors: Array<{ dudiUserId: string; isPrimary: boolean }>): Promise<void> {
    await http.put(`/groups/${id}/dudi-mentors`, { mentors });
  },
  async setSupervisors(id: string, supervisorIds: string[]): Promise<unknown> {
    const { data } = await http.put<ApiResponse<unknown>>(`/groups/${id}/supervisors`, { supervisorIds });
    return data.data;
  },
  async credentials(id: string): Promise<{ students: Array<{ userId: string; username: string; password: string; fullName: string; isLeader: boolean }>; dudi: Array<{ userId: string; username: string; password: string; fullName: string }> }> {
    const { data } = await http.get<ApiResponse<{ students: Array<{ userId: string; username: string; password: string; fullName: string; isLeader: boolean }>; dudi: Array<{ userId: string; username: string; password: string; fullName: string }> }>>(`/groups/${id}/credentials`);
    return data.data;
  },
  async listMine(): Promise<unknown[]> {
    const { data } = await http.get<ApiResponse<unknown[]>>('/groups/me');
    return data.data;
  },
  async listSupervised(): Promise<unknown[]> {
    const { data } = await http.get<ApiResponse<unknown[]>>('/groups/supervised');
    return data.data;
  },
  async list(params?: { cohortId?: string }): Promise<{ items: unknown[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<unknown[]>>('/groups', { params: params ?? {} });
    return { items: data.data, meta: data.meta };
  },
  async create(payload: unknown): Promise<unknown> {
    const { data } = await http.post<ApiResponse<unknown>>('/groups', payload);
    return data.data;
  },
  async getById(id: string): Promise<unknown> {
    const { data } = await http.get<ApiResponse<unknown>>(`/groups/${id}`);
    return data.data;
  },
  async remove(id: string): Promise<void> {
    await http.delete(`/groups/${id}`);
  },
};

/**
 * Service perusahaan.
 */
export const companyService = {
  async list(search?: string): Promise<{ items: unknown[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<unknown[]>>('/companies', {
      params: search ? { search } : {},
    });
    return { items: data.data, meta: data.meta };
  },
  async create(payload: unknown): Promise<unknown> {
    const { data } = await http.post<ApiResponse<unknown>>('/companies', payload);
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
  group?: { id: string; name: string } | null;
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

export interface AttendanceGroupSection {
  groupId: string | null;
  groupName: string;
  companyName: string | null;
  memberCount: number;
  students: AttendanceStudentGroup[];
}

export interface AttendanceClassSection {
  className: string;
  studentCount: number;
  groups: AttendanceGroupSection[];
}

export interface JournalRecord {
  id: string;
  date: string;
  activity: string;
  result: string | null;
  obstacles: string | null;
  supervisorNote: string | null;
  dudiVerifiedAt?: string | null;
  dudiVerifiedById?: string | null;
  dudiVerificationNote?: string | null;
  user?: { id: string; username: string; studentProfile?: { fullName: string; nisn?: string | null } | null };
  group?: { id: string; name: string } | null;
}

export interface ComplaintRecord {
  id: string;
  subject: string;
  body: string;
  status: string;
  authorId: string;
  author?: { id: string; username: string; studentProfile?: { fullName: string } | null };
  group?: { id: string; name: string } | null;
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
  group?: { id: string; name: string } | null;
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
  async listForDudi(params?: { status?: string; groupId?: string }): Promise<{ items: AttendanceRecord[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<AttendanceRecord[]>>('/attendances/dudi', { params: params ?? {} });
    return { items: data.data, meta: data.meta };
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
  async list(params?: { groupId?: string; status?: string; from?: string; to?: string }): Promise<{ items: AttendanceRecord[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<AttendanceRecord[]>>('/attendances', { params: params ?? {} });
    return { items: data.data, meta: data.meta };
  },
  async summary(params?: { groupId?: string; from?: string; to?: string; cohortId?: string }): Promise<Array<{ status: string; _count: number }>> {
    const { data } = await http.get<ApiResponse<Array<{ status: string; _count: number }>>>('/attendances/summary', { params: params ?? {} });
    return data.data;
  },
  /** Monitoring admin: absensi per kelas → kelompok → siswa (termasuk koordinat GPS). */
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
  async list(params?: { groupId?: string; userId?: string }): Promise<{ items: JournalRecord[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<JournalRecord[]>>('/journals', { params: params ?? {} });
    return { items: data.data, meta: data.meta };
  },
  async addSupervisorNote(id: string, note: string): Promise<JournalRecord> {
    const { data } = await http.post<ApiResponse<JournalRecord>>(`/journals/${id}/supervisor-note`, { note });
    return data.data;
  },
  async listForDudi(): Promise<JournalRecord[]> {
    const { data } = await http.get<ApiResponse<JournalRecord[]>>('/journals/dudi');
    return data.data;
  },
  async verifyByDudi(id: string, note?: string): Promise<JournalRecord> {
    const { data } = await http.post<ApiResponse<JournalRecord>>(`/journals/${id}/dudi-verify`, { note });
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
  async list(params?: { status?: string; groupId?: string; cohortId?: string }): Promise<{ items: ComplaintRecord[]; meta?: PaginationMeta }> {
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

/** Service kunjungan/monitoring guru. */
export const visitService = {
  async create(payload: { groupId?: string | null; companyId?: string | null; scheduledAt: string; note?: string | null }): Promise<VisitRecord> {
    const { data } = await http.post<ApiResponse<VisitRecord>>('/visits', payload);
    return data.data;
  },
  async listMine(): Promise<VisitRecord[]> {
    const { data } = await http.get<ApiResponse<VisitRecord[]>>('/visits/me');
    return data.data;
  },
  async list(params?: { groupId?: string; supervisorId?: string }): Promise<{ items: VisitRecord[]; meta?: PaginationMeta }> {
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
// FASE 4 — Pasca-PKL (nilai, feedback, surat penarikan, transisi fase)
// ============================================================================

export interface GradeRecord {
  id: string;
  studentId: string;
  groupId: string | null;
  giverId: string | null;
  giverRole: string;
  scoreDudi: number | string | null;
  scoreGuidance: number | string | null;
  finalScore: number | string | null;
  predicate: string | null;
  note: string | null;
  aspects?: Array<{ id?: string; label: string; score: number | string }>;
  createdAt: string;
  student?: { id: string; username: string; studentProfile?: { fullName: string | null } | null };
}

export interface GradeRecapStudent {
  userId: string;
  username: string;
  fullName: string;
  nisn: string | null;
  grade: GradeRecord | null;
}

export interface GradeRecapGroup {
  groupId: string;
  groupName: string;
  companyName: string | null;
  memberCount: number;
  students: GradeRecapStudent[];
}

export interface GradeRecapClass {
  className: string;
  studentCount: number;
  gradedCount: number;
  groups: GradeRecapGroup[];
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
  groupId: string | null;
  body: string;
  author?: { id: string; username: string };
  createdAt: string;
}

export interface WithdrawalLetterResult {
  letterId: string;
  relativePath: string;
  signerName: string;
  signerNip: string | null;
}

export interface PhaseTransitionResult {
  studentId: string;
  from: string;
  to: string;
}

/** Service penilaian PKL. */
export const gradeService = {
  async dudiAssignments(): Promise<Array<{ id: string; name: string; members: Array<{ user: { id: string; username: string; studentProfile: { fullName: string } | null } }> }>> {
    const { data } = await http.get<ApiResponse<Array<{ id: string; name: string; members: Array<{ user: { id: string; username: string; studentProfile: { fullName: string } | null } }> }>>>('/grades/dudi/assignments');
    return data.data;
  },
  async inputGrade(payload: { studentId: string; groupId?: string | null; scoreDudi?: number; aspects?: Array<{ label: string; score: number }>; note?: string | null }): Promise<GradeRecord> {
    const { data } = await http.post<ApiResponse<GradeRecord>>('/grades', payload);
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
  async listForDudi(): Promise<GradeRecord[]> {
    const { data } = await http.get<ApiResponse<GradeRecord[]>>('/grades/dudi');
    return data.data;
  },
  async list(params?: { groupId?: string; studentId?: string }): Promise<{ items: GradeRecord[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<GradeRecord[]>>('/grades', { params: params ?? {} });
    return { items: data.data, meta: data.meta };
  },
  async recap(groupId?: string): Promise<GradeRecord[]> {
    const { data } = await http.get<ApiResponse<GradeRecord[]>>('/grades/recap', {
      params: groupId ? { groupId } : {},
    });
    return data.data;
  },
  /** Rekap admin: penilaian per kelas → kelompok → siswa (termasuk yang belum dinilai). */
  async recapByClass(params?: { cohortId?: string }): Promise<GradeRecapByClass> {
    const { data } = await http.get<ApiResponse<GradeRecapByClass>>('/grades/recap-by-class', { params: params ?? {} });
    return data.data;
  },
};

/** Service feedback DUDI. */
export const feedbackService = {
  async create(payload: { studentId: string; groupId?: string | null; body: string }): Promise<FeedbackRecord> {
    const { data } = await http.post<ApiResponse<FeedbackRecord>>('/feedbacks', payload);
    return data.data;
  },
  async listByStudent(studentId: string): Promise<FeedbackRecord[]> {
    const { data } = await http.get<ApiResponse<FeedbackRecord[]>>(`/feedbacks/student/${studentId}`);
    return data.data;
  },
  async list(params?: { studentId?: string; groupId?: string }): Promise<{ items: FeedbackRecord[]; meta?: PaginationMeta }> {
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
  relatedGroupId: string | null;
  createdAt: string;
}

/** Service Fase 4 — surat + transisi fase. */
export const phase4Service = {
  async generateIntroductionLetter(payload: { groupId: string; number?: string | null }): Promise<WithdrawalLetterResult> {
    const { data } = await http.post<ApiResponse<WithdrawalLetterResult>>('/phase4/introduction-letter', payload);
    return data.data;
  },
  async generateAssignmentLetter(payload: { groupId: string; supervisorId: string; number?: string | null }): Promise<WithdrawalLetterResult> {
    const { data } = await http.post<ApiResponse<WithdrawalLetterResult>>('/phase4/assignment-letter', payload);
    return data.data;
  },
  async generateWithdrawalLetter(payload: { groupId: string; studentIds: string[]; number?: string | null }): Promise<WithdrawalLetterResult[]> {
    const { data } = await http.post<ApiResponse<WithdrawalLetterResult[]>>('/phase4/withdrawal-letter', payload);
    return data.data;
  },
  async completePhase(studentIds: string[]): Promise<{ results: PhaseTransitionResult[]; skipped: Array<{ studentId: string; reason: string }> }> {
    const { data } = await http.post<ApiResponse<{ results: PhaseTransitionResult[]; skipped: Array<{ studentId: string; reason: string }> }>>('/phase4/complete', { studentIds });
    return data.data;
  },
  async listLetters(params?: { groupId?: string; type?: string }): Promise<LetterRecord[]> {
    const { data } = await http.get<ApiResponse<LetterRecord[]>>('/phase4/letters', { params: params ?? {} });
    return data.data;
  },
  async downloadLetter(letter: LetterRecord): Promise<void> {
    const num = letter.number ? `${letter.number}-` : '';
    await downloadFile(`/phase4/letters/${letter.id}/download`, `${letter.type}-${num}${letter.id}.pdf`);
  },
  /** SISWA: unduh Laporan Hasil PKL kelompok (generate-once setelah PKL selesai). */
  async downloadFinalReport(): Promise<void> {
    await downloadFile('/phase4/final-report', 'Laporan-Hasil-PKL.pdf');
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
  async list(cohortId: string, params?: { page?: number; perPage?: number }): Promise<{ items: StudentRegistryRecord[]; meta?: PaginationMeta }> {
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
    memberRows: number;
    attendance: number;
    journals: number;
    grades: number;
    documents: number;
    groupMemberships: number;
    registrations: number;
  }> {
    const { data } = await http.delete<
      ApiResponse<{
        fullName: string;
        nisn: string;
        accounts: number;
        memberRows: number;
        attendance: number;
        journals: number;
        grades: number;
        documents: number;
        groupMemberships: number;
        registrations: number;
      }>
    >(`/student-registry/${id}`);
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
  studentProfile?: { fullName: string; nisn: string } | null;
  teacherProfile?: { fullName: string; nip: string } | null;
  companyMentor?: { fullName: string; company?: { name: string } } | null;
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
  fase1: {
    registration: {
      code: string;
      status: string;
      groupName: string;
      submittedAt: string | null;
      cohort: { name: string; academicYear: string | null } | null;
      company: { name: string; address: string; phone: string | null; city: string | null; industry: string | null };
    };
    member: { fullName: string; nisn: string | null; className: string | null; phone: string | null; isLeader: boolean };
    members: Array<{ fullName: string; nisn: string | null; className: string | null; phone: string | null; isLeader: boolean }>;
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
  group: {
    name: string;
    code: string;
    status: string;
    company: { name: string } | null;
    dudiMentors: Array<{ dudi: { username: string } }>;
  } | null;
}

export interface JobVacancyRecord {
  id: string;
  title: string;
  description: string;
  requirements: string | null;
  location: string | null;
  status: string;
  company?: { id: string; name: string } | null;
  createdAt: string;
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
};

/**
 * Pilih gelombang untuk filter default tampilan admin: utamakan yang OPEN
 * (gelombang aktif), fallback ke gelombang pertama. Data gelombang lama tidak
 * tampil kecuali admin memilihnya secara manual.
 */
export const pickActiveCohortId = (cohorts: Array<{ id: string; status?: string }>): string =>
  cohorts.find((c) => c.status === 'OPEN')?.id ?? cohorts[0]?.id ?? '';

/** Service manajemen user. */
export const userManageService = {
  async create(payload: { username: string; password: string; role: string; identifier?: string; fullName?: string; nisn?: string; nip?: string; cohortId?: string | null; companyId?: string | null; majorId?: string | null }): Promise<UserRecord & { password?: string }> {
    const { data } = await http.post<ApiResponse<UserRecord & { password?: string }>>('/users', payload);
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
  /** Data PKL siswa (Fase 1 pendaftaran + Fase 2 daftar ulang) — khusus Admin. */
  async getStudentData(id: string): Promise<StudentPklData> {
    const { data } = await http.get<ApiResponse<StudentPklData>>(`/users/${id}/student-data`);
    return data.data;
  },
  async remove(id: string): Promise<UserRecord> {
    const { data } = await http.delete<ApiResponse<UserRecord>>(`/users/${id}`);
    return data.data;
  },
};

/** Service loker. */
export const jobVacancyService = {
  async create(payload: { title: string; description: string; requirements?: string | null; location?: string | null; companyId?: string | null }): Promise<JobVacancyRecord> {
    const { data } = await http.post<ApiResponse<JobVacancyRecord>>('/job-vacancies', payload);
    return data.data;
  },
  async list(params?: { status?: string }): Promise<{ items: JobVacancyRecord[]; meta?: PaginationMeta }> {
    const { data } = await http.get<ApiResponse<JobVacancyRecord[]>>('/job-vacancies', { params: params ?? {} });
    return { items: data.data, meta: data.meta };
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
  async list(params?: { action?: string; actorId?: string }): Promise<{ items: AuditLogRecord[]; meta?: PaginationMeta }> {
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
  /** Gerbang Fase 1 → Fase 2: ketua sudah mengunduh Surat Permohonan? */
  isKetuaDownloadSuratPermohonan: boolean;
  isKetua: boolean;
  /** Password null = disembunyikan (semua anggota sudah login + Surat Pernyataan di-ACC admin). */
  groupMembers: Array<{ username: string; fullName: string; temporaryPassword: string | null }> | null;
  dudiCredential: { fullName: string; username: string } | null;
  hasGroup: boolean;
  dudiConnected: boolean;
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
  async grades(groupId?: string): Promise<unknown[]> {
    const { data } = await http.get<ApiResponse<unknown[]>>('/export/grades', { params: groupId ? { groupId } : {} });
    return data.data;
  },
  async attendances(params?: { groupId?: string; from?: string; to?: string }): Promise<unknown[]> {
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
export const downloadFile = async (url: string, filename: string): Promise<void> => {
  const { data } = await http.get(url, { responseType: 'blob' });
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

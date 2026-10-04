/**
 * Konstanta global aplikasi.
 */

/** Kode HTTP yang sering dipakai */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL: 500,
} as const;

/** Pesan error standar */
export const MESSAGES = {
  AUTH: {
    INVALID_CREDENTIALS: 'Username/identitas atau password salah',
    UNAUTHORIZED: 'Anda belum terautentikasi',
    FORBIDDEN: 'Anda tidak memiliki akses untuk aksi ini',
    TOKEN_EXPIRED: 'Sesi telah berakhir, silakan login kembali',
    TOKEN_INVALID: 'Token tidak valid',
    ACCOUNT_INACTIVE: 'Akun Anda tidak aktif. Hubungi administrator',
    REFRESH_INVALID: 'Refresh token tidak valid atau sudah dicabut',
  },
  VALIDATION: 'Data yang dikirim tidak valid',
  NOT_FOUND: 'Data tidak ditemukan',
  CONFLICT: 'Data sudah ada / konflik',
  PHASE: 'Aksi ini tidak tersedia pada fase Anda saat ini',
  PHASE_TRANSITION: 'Perpindahan fase tidak valid',
  COHORT_LOCKED: 'Gelombang sudah ditutup/diarsipkan, aksi dibatalkan',
  INTERNAL: 'Terjadi kesalahan pada server',
  SCOPE: 'Anda tidak berhak mengakses data ini',
  GROUP: {
    MAJOR_MISMATCH: 'Semua anggota kelompok harus berasal dari jurusan yang sama',
    MEMBER_EXISTS: 'Siswa sudah menjadi anggota kelompok lain pada gelombang ini',
    NO_MEMBERS: 'Kelompok harus memiliki minimal 1 anggota',
    LOCKED: 'Kelompok tidak dapat diubah pada status saat ini',
  },
  DOCUMENT: {
    INVALID_FILE: 'File tidak valid (jenis/ukuran tidak diizinkan)',
    ALREADY_VERIFIED: 'Dokumen sudah diverifikasi',
    NOT_UPLOADED: 'Dokumen belum diunggah',
  },
  ATTENDANCE: {
    ALREADY_CHECKED_IN: 'Anda sudah melakukan absen masuk hari ini',
    NOT_CHECKED_IN: 'Anda belum melakukan absen masuk hari ini',
    ALREADY_CHECKED_OUT: 'Anda sudah melakukan absen keluar hari ini',
    NO_GROUP: 'Anda belum tergabung pada kelompok PKL mana pun',
    INVALID_LOCATION: 'Koordinat lokasi tidak valid',
    BACKFILL_FORBIDDEN: 'Absensi terlewat tidak dapat dirapel. Hubungi pembimbing',
    IMMUTABLE: 'Absensi yang sudah selesai tidak dapat diubah',
  },
  JOURNAL: {
    DUPLICATE: 'Jurnal untuk tanggal ini sudah ada',
    BACKFILL_FORBIDDEN: 'Jurnal terlewat tidak dapat dirapel melebihi hari ini',
  },
  COMPLAINT: {
    CLOSED: 'Pengaduan sudah ditutup',
    NOT_OWNER: 'Anda bukan pemilik pengaduan ini',
  },
  VISIT: {
    NOT_SUPERVISOR: 'Anda bukan pembimbing kelompok ini',
  },
} as const;

/** Fase siswa berurutan (state machine) */
export const PHASE_ORDER: Record<string, number> = {
  PRA_PKL: 1,
  NON_PKL: 2,
  PKL_AKTIF: 3,
  PKL_SELESAI: 4,
};

/** Transisi fase yang diizinkan (state machine guard) */
export const ALLOWED_PHASE_TRANSITIONS: Record<string, string[]> = {
  PRA_PKL: ['NON_PKL'],
  NON_PKL: ['PKL_AKTIF'],
  PKL_AKTIF: ['PKL_SELESAI'],
  PKL_SELESAI: [],
};

/** Jenis MIME yang diizinkan untuk upload dokumen */
export const ALLOWED_DOCUMENT_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/** Pemetaan MIME -> ekstensi aman (mencegah path traversal & eksekusi) */
export const MIME_EXTENSION_MAP: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

/** Aksi yang dicatat ke audit log */
export const AUDIT_ACTIONS = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  CREATE_USER: 'CREATE_USER',
  CREATE_REGISTRATION: 'CREATE_REGISTRATION',
  UPDATE_USER: 'UPDATE_USER',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  GENERATE_LETTER: 'GENERATE_LETTER',
  CREATE_GROUP: 'CREATE_GROUP',
  UPDATE_GROUP: 'UPDATE_GROUP',
  UPDATE_GRADE: 'UPDATE_GRADE',
  UPLOAD_DOCUMENT: 'UPLOAD_DOCUMENT',
  VERIFY_DOCUMENT: 'VERIFY_DOCUMENT',
  PHASE_CHANGE: 'PHASE_CHANGE',
  CREATE_COHORT: 'CREATE_COHORT',
  CLOSE_COHORT: 'CLOSE_COHORT',
  REOPEN_COHORT: 'REOPEN_COHORT',
  CREATE_COMPANY: 'CREATE_COMPANY',
  CHECK_IN: 'CHECK_IN',
  CHECK_OUT: 'CHECK_OUT',
  CREATE_JOURNAL: 'CREATE_JOURNAL',
  CREATE_COMPLAINT: 'CREATE_COMPLAINT',
  REPLY_COMPLAINT: 'REPLY_COMPLAINT',
  CREATE_VISIT: 'CREATE_VISIT',
  CREATE_FEEDBACK: 'CREATE_FEEDBACK',
  GENERATE_WITHDRAWAL_LETTER: 'GENERATE_WITHDRAWAL_LETTER',
} as const;

/** Jenis entitas untuk audit/approval */
export const ENTITY_TYPES = {
  DOCUMENT: 'DOCUMENT',
  GROUP: 'GROUP',
  REPORT: 'REPORT',
  USER: 'USER',
  COHORT: 'COHORT',
  COMPANY: 'COMPANY',
  REGISTRATION: 'REGISTRATION',
  ATTENDANCE: 'ATTENDANCE',
  JOURNAL: 'JOURNAL',
  COMPLAINT: 'COMPLAINT',
  VISIT: 'VISIT',
} as const;

/** Nama cookie refresh token */
export const REFRESH_COOKIE_NAME = 'pkl_refresh_token';

/** Format tanggal default */
export const DATE_LOCALE = 'id-ID';

import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';
import { env } from '../config/env';
import { ALLOWED_DOCUMENT_MIME } from '../config/constants';
import { BadRequestError } from '../errors/AppError';
import { MESSAGES } from '../config/constants';

/**
 * Middleware upload file dengan multer.
 * - Menggunakan memoryStorage agar file disimpan terkontrol lewat utils/storage
 *   (di luar webroot, nama file di-generate sendiri, bukan nama asli user).
 * - Validasi MIME whitelist + batas ukuran dari env.
 *
 * Contoh: router.post('/', uploadDocument.single('file'), handler)
 */

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
  if (ALLOWED_DOCUMENT_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestError(MESSAGES.DOCUMENT.INVALID_FILE, { mimeType: file.mimetype }));
  }
};

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.maxUploadSizeBytes,
    files: 5,
  },
  fileFilter,
});

/** Upload satu file dengan nama field tertentu. */
export const singleFile = (field = 'file') => upload.single(field);

/** Upload beberapa file (maks 5). */
export const multipleFiles = (field = 'files', max = 5) => upload.array(field, max);

// ----------------------------------------------------------------------------
// Upload Excel/CSV (untuk import Master Siswa / Master Guru).
// Whitelist terpisah dari dokumen siswa agar .xlsx tidak ikut diizinkan di
// upload dokumen biasa.
// ----------------------------------------------------------------------------
const ALLOWED_EXCEL_MIME = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
  'text/plain', // sebagian browser/OS melaporkan CSV begini
];

const excelFileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
  if (ALLOWED_EXCEL_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestError('File harus berupa Excel (.xlsx/.xls) atau CSV', { mimeType: file.mimetype }));
  }
};

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.maxUploadSizeBytes,
    files: 1,
  },
  fileFilter: excelFileFilter,
});

/** Upload satu file Excel/CSV dengan nama field tertentu. */
export const singleExcelFile = (field = 'file') => excelUpload.single(field);

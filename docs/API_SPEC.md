# API Specification — Sistem Manajemen PKL

> Base URL: `/api` | Auth: `Bearer <JWT>` | Content-Type: `application/json`

## Response Format

```json
{
  "success": true,
  "message": "OK",
  "data": {},
  "meta": { "page": 1, "perPage": 10, "total": 50, "totalPages": 5 }
}
```

## Error Format

```json
{
  "success": false,
  "message": "Error message",
  "details": {}
}
```

---

## Authentication

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| POST | `/auth/login` | public | Login (identifier + password) |
| POST | `/auth/refresh` | public | Refresh access token (cookie) |
| POST | `/auth/logout` | all | Logout (revoke refresh token) |
| GET | `/auth/me` | all | Profil user saat ini |

## Registrasi (Fase 1)

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| POST | `/registrations` | SISWA | Buat/update draft pendaftaran |
| GET | `/registrations/me` | SISWA | Ambil draft milik siswa |
| GET | `/registrations/:id` | all | Detail pendaftaran |
| POST | `/registrations/:id/submit` | SISWA | Ajukan pendaftaran + generate surat |
| GET | `/registrations` | ADMIN | Daftar semua pendaftaran |
| POST | `/registrations/:id/review` | ADMIN | Approve/reject pendaftaran |

## Dokumen

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| POST | `/documents` | all | Upload dokumen (multipart) |
| GET | `/documents/me` | all | Dokumen milik user |
| GET | `/documents` | ADMIN | Daftar semua dokumen |
| GET | `/documents/:id/download` | all | Download file dokumen |
| POST | `/documents/:id/verify` | ADMIN | Approve/reject dokumen |

## Kelompok

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| POST | `/groups` | ADMIN | Buat kelompok |
| GET | `/groups` | ADMIN | Daftar kelompok (paginated) |
| GET | `/groups/me` | SISWA | Kelompok yang diikuti |
| GET | `/groups/supervised` | GURU | Kelompok yang dibimbing |
| GET | `/groups/:id` | ADMIN | Detail kelompok |
| PATCH | `/groups/:id` | ADMIN | Update kelompok |

## Master Data

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| GET | `/master/lookups` | all | Cohorts, majors, industries |
| GET | `/master/majors` | all | Daftar jurusan |
| GET | `/master/cohorts` | all | Daftar gelombang |
| GET | `/master/industries` | all | Daftar industri |

## Perusahaan

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| GET | `/companies` | ADMIN, DUDI | Daftar perusahaan |
| POST | `/companies` | ADMIN | Tambah perusahaan |
| PATCH | `/companies/:id` | ADMIN | Update perusahaan |

## Absensi (Fase 3)

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| POST | `/attendances/check-in` | SISWA | Check-in GPS |
| POST | `/attendances/check-out` | SISWA | Check-out GPS |
| GET | `/attendances/today` | SISWA | Absensi hari ini |
| GET | `/attendances/me` | SISWA | Riwayat absensi sendiri |
| GET | `/attendances` | ADMIN, GURU | Daftar absensi (paginated) |
| GET | `/attendances/summary` | ADMIN | Rekap absensi per status |

## Jurnal (Fase 3)

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| POST | `/journals` | SISWA | Buat jurnal harian |
| GET | `/journals/me` | SISWA | Jurnal milik sendiri |
| GET | `/journals` | ADMIN, GURU | Daftar jurnal |
| PATCH | `/journals/:id` | SISWA | Update jurnal |
| POST | `/journals/:id/supervisor-note` | GURU | Catatan pembimbing |

## Pengaduan (Fase 3)

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| POST | `/complaints` | SISWA | Buat pengaduan |
| GET | `/complaints/me` | SISWA | Pengaduan milik sendiri |
| GET | `/complaints` | ADMIN, GURU | Daftar pengaduan |
| GET | `/complaints/:id` | all | Detail pengaduan |
| POST | `/complaints/:id/replies` | all | Balas pengaduan |
| POST | `/complaints/:id/close` | SISWA | Tutup pengaduan |

## Kunjungan (Fase 3)

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| POST | `/visits` | GURU, ADMIN | Jadwalkan kunjungan |
| GET | `/visits/me` | GURU | Kunjungan milik sendiri |
| GET | `/visits` | ADMIN, GURU | Daftar kunjungan |
| POST | `/visits/:id/complete` | GURU | Tandai selesai |

## Penilaian (Fase 4)

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| POST | `/grades` | DUDI, ADMIN | Input nilai akhir PKL |
| POST | `/grades/:id/guidance` | GURU, ADMIN | Input nilai bimbingan |
| GET | `/grades/me` | SISWA | Rekap nilai sendiri |
| GET | `/grades` | ADMIN, GURU | Daftar nilai (paginated) |
| GET | `/grades/recap` | ADMIN | Rekap semua nilai |

## Feedback (Fase 4)

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| POST | `/feedbacks` | DUDI, ADMIN | Input feedback |
| GET | `/feedbacks/student/:id` | all staff | Feedback per siswa |
| GET | `/feedbacks` | ADMIN | Daftar semua feedback |

## Fase 4 — Surat & Transisi

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| POST | `/phase4/withdrawal-letter` | ADMIN | Generate surat penarikan |
| POST | `/phase4/complete` | ADMIN | Transisi fase → PKL_SELESAI |

## Modul Pendukung (M5)

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| POST | `/cohorts` | SUPER_ADMIN | Buat gelombang |
| PATCH | `/cohorts/:id` | SUPER_ADMIN | Update/status gelombang |
| GET | `/cohorts` | all | Daftar gelombang |
| POST | `/users` | ADMIN | Buat user |
| GET | `/users` | ADMIN | Daftar user (paginated) |
| PATCH | `/users/:id` | ADMIN | Update user |
| POST | `/users/import` | ADMIN | Import siswa (CSV/Excel) |
| POST | `/job-vacancies` | DUDI | Buat loker |
| GET | `/job-vacancies` | all | Daftar loker |
| PATCH | `/job-vacancies/:id` | DUDI | Update loker |
| GET | `/announcements` | all | Daftar pengumuman |
| POST | `/announcements` | ADMIN | Buat pengumuman |
| GET | `/notifications/me` | all | Notifikasi user |
| PATCH | `/notifications/:id/read` | all | Tandai sudah dibaca |
| GET | `/dashboard/stats` | all | Statistik dashboard |
| GET | `/audit-logs` | SUPER_ADMIN | Daftar audit log |
| GET | `/export/grades` | ADMIN | Export nilai (Excel/PDF) |
| GET | `/export/attendances` | ADMIN | Export absensi (Excel/PDF) |

## System

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| GET | `/health` | public | Health check |


---

## M7 - Penyelarasan Alur (endpoint baru)

### Surat Pernyataan PKL - DOCX (Fase 2: pendaftaran ulang)

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| GET | `/pernyataan/prefill` | SISWA | Data pre-fill form surat pernyataan |
| POST | `/pernyataan/generate` | SISWA (NON_PKL) | Generate DOCX Surat Pernyataan (format resmi, data terisi) |

**Body `/pernyataan/generate`** (semua opsional, diisi otomatis dari data tersimpan):

```json
{
  "namaSiswa": "Budi Santoso",
  "kelasJurusan": "XII-RPL 1/Rekayasa Perangkat Lunak",
  "namaOrtu": "Sulaiman",
  "alamatSiswa": "Jl. Merdeka No. 5, Medan",
  "hpOrtu": "081234567890",
  "hpSiswa": "089876543210",
  "tempatPkl": "PT. Telkom Indonesia"
}
```

Setelah generate, siswa mengunduh via `GET /documents/:id/download`, lalu upload foto
surat bermaterai via `POST /documents` (type `SURAT_PERNYATAAN`) untuk diverifikasi admin.

### Absensi harian - model baru + konfirmasi DUDI

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| POST | `/attendances/submit` | SISWA (PKL_AKTIF) | Kirim absen: status + kegiatan + lokasi GPS |
| GET | `/attendances/dudi` | DUDI | Daftar absensi untuk dikonfirmasi |
| POST | `/attendances/:id/verify` | DUDI | Konfirmasi / tolak absensi |

**Body `/attendances/submit`**:

```json
{
  "status": "HADIR",
  "activity": "Pelaksanaan kegiatan hari ini...",
  "geo": { "lat": 3.5952, "long": 98.6722, "note": null }
}
```

**Body `/attendances/:id/verify`**:

```json
{ "action": "APPROVE", "note": null }
```

### Jadwal fase per gelombang

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| GET | `/cohorts/:cohortId/phase-schedule` | all | Daftar jadwal fase |
| GET | `/cohorts/:cohortId/phase-schedule/overview` | all | Jadwal + fase aktif hari ini |
| PUT | `/cohorts/:cohortId/phase-schedule` | SUPER_ADMIN, KEPALA_SEKOLAH | Atur tanggal masa fase |

**Body PUT**:

```json
{
  "items": [
    { "phase": "PRA_PKL", "startDate": "2026-01-01T00:00:00.000Z", "endDate": "2026-06-30T23:59:59.000Z" },
    { "phase": "NON_PKL", "startDate": "2026-07-01T00:00:00.000Z", "endDate": "2026-08-31T23:59:59.000Z" },
    { "phase": "PKL_AKTIF", "startDate": "2026-09-01T00:00:00.000Z", "endDate": "2026-11-30T23:59:59.000Z" }
  ]
}
```

### Master data tambahan

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| GET | `/master/class-options` | all | Opsi kelas resmi sekolah: `DKV 1`..`PEKSOS 4` |

### Registrasi - field tambahan

`POST /registrations` kini menerima field opsional tambahan:

```json
{
  "companyWebsite": "https://perusahaan.com",
  "companyContacts": ["081234567890", "089876543210"]
}
```
# TODO.md — Sistem Manajemen PKL SMKN 9 Medan

> Dibuat berdasarkan `prompt.txt` + audit kode.
> Status: ✅ Selesai | 🔧 Perlu Fix | ⬜ Belum Dikerjakan

---

## Ringkasan Status

| Kategori | Status |
|----------|--------|
| Auth & RBAC (6 role, JWT, refresh rotation) | ✅ |
| Database Schema (35 model, Prisma) | ✅ |
| Phase Schedule (admin set tanggal per fase) | ✅ |
| Fase 1: Pra-Pendaftaran PKL | ✅ |
| Fase 2: Pendaftaran Ulang (Surat Pernyataan DOCX) | ✅ |
| Fase 3: PKL Aktif (Absensi GPS, Jurnal, Pengaduan) | ✅ |
| Fase 4: Pasca-PKL (Nilai, Laporan Akhir, Surat Penarikan) | ✅ |
| Surat Permohonan PKL (PDF via PDFKit) | ✅ |
| Surat Pernyataan PKL (DOCX via docxtemplater) | ✅ |
| Surat Penarikan Siswa (PDF via PDFKit) | ✅ |
| Document Upload & Verification | ✅ |
| Group Management | ✅ |
| Dashboard (role-based stats) | ✅ |
| Notifikasi In-App | ✅ |
| Audit Log | ✅ |
| Docker + Nginx Deployment | ✅ |
| Auto-phase-transition cron | ⬜ (passive sync via StudentWorkflowService sudah jalan) |
| Dashboard tampilkan fase aktif per gelombang | ✅ |
| Surat Pengantar PKL (auto-generate) | ✅ |
| Surat Penugasan Pembimbing (auto-generate) | ✅ |
| Seed data contoh per fase untuk QA | ✅ |

---

##环境 Setup

- [x] Buat project structure `frontend/` + `backend/` terpisah
- [x] Install dependencies (Vue 3, Pinia, Express, Prisma, MySQL2)
- [x] Setup `.env` (DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, dll)
- [x] Setup Prisma Client singleton (`backend/src/config/prisma.ts`)
- [x] Setup Axios interceptor with refresh token rotation (`frontend/src/services/http.ts`)
- [x] Setup Docker + Nginx (`docker-compose.yml`, `nginx.conf`)

---

## Database Schema & Migration

- [x] Buat `schema.prisma` lengkap (35 model)
- [x] Enum: Role (6), StudentPhase (4), CohortStatus, RegistrationStatus, GroupStatus, DocumentType, DocumentStatus, AttendanceStatus, ComplaintStatus, JobVacancyStatus
- [x] Model: User, RefreshToken, Cohort, Major, Class, Industry, SystemSetting
- [x] Model: StudentProfile, ParentData, TeacherProfile, Company, CompanyMentor
- [x] Model: Group, GroupMember, GroupSupervisor, GroupPlacement
- [x] Model: Registration, RegistrationMember, PhaseSchedule
- [x] Model: Attendance, Journal, Complaint, ComplaintReply
- [x] Model: Visit, Document, DocumentFile, LetterSignatory, GeneratedLetter
- [x] Model: Approval, Grade, Feedback, JobVacancy, Announcement, Notification, AuditLog
- [x] Run `prisma migrate dev`
- [x] Seed data: super admin, jurusan (DKV, RPL, PSPT, ANIMASI, TKJ, PEKSOS), industri contoh

---

## Auth & Middleware

- [x] JWT access token + refresh token rotation (cookie-based)
- [x] Login rate limiter
- [x] `authenticate` middleware — verify Bearer token
- [x] `authorizeRoles(...roles)` middleware — RBAC
- [x] `requirePhase(...phases)` middleware — phase guard (siswa only)
- [x] `requireCohortActive` middleware — block writes on CLOSED/ARCHIVED cohorts
- [x] Frontend: 3 layer route guard (auth, role, phase)
- [x] Frontend: auto-refresh on 401 (single-flight interceptor)
- [x] Audit log on login/logout

---

## Fase 1: Pra-Pendaftaran PKL

> Pemisahan akun: `KETUA` adalah akun sementara untuk memasukkan pengajuan. Siswa
> yang ditandai sebagai ketua kelompok di daftar anggota tetap dibuatkan akun
> `SISWA` tersendiri pada Fase 2 dan hanya akun `SISWA` yang boleh masuk kelompok.

### Alur:
1. Siswa (ketua kelompok) login → lihat form pra-pendaftaran
2. Isi: nama kelompok, kelas, no. HP, anggota, nama perusahaan, alamat, bidang usaha
3. Submit → status menunggu review Admin
4. Admin review → APPROVE / REJECT; saat APPROVE backend generate PDF **Surat Permohonan PKL** (PDFKit)
5. Setelah approve, ketua download surat, cetak, serahkan ke perusahaan

### Implementation:
- [x] `RegistrationView.vue` — form pra-pendaftaran (nama kelompok, gelombang, jurusan, perusahaan, anggota)
- [x] `registration.service.ts` — saveDraft, submit, review
- [x] `letter.service.ts` — generate Surat Permohonan PKL (PDFKit)
- [x] `letter.template.ts` — template PDF dengan kop surat + blok tanda tangan
- [x] Admin: `RegistrationsView.vue` — list + approve/reject
- [x] Document record: SURAT_PERMOHONAN ter-generate otomatis
- [x] Audit log pada setiap aksi

### Yang perlu diperhatikan:
- [x] Validasi: nama perusahaan, alamat wajib diisi
- [x] Anggota minimal 1 (ketua)
- [x] Ketua otomatis jadi anggota pertama

---

## Fase 2: Pendaftaran Ulang (Daftar Ulang)

### Alur:
1. Masa NON_PKL dimulai (berdasarkan PhaseSchedule)
2. Siswa isi form pendaftaran ulang
3. Backend generate `SURAT PERNYATAAN PKL-SISWA.docx` (docxtemplater)
4. Siswa download → cetak → tempel materai → tanda tangan → upload kembali
5. Admin verifikasi → APPROVE / REJECT

### Implementation:
- [x] `PernyataanView.vue` — form prefill + editable + upload
- [x] `pernyataan.service.ts` — prefill, generate DOCX, upload signed version
- [x] Template DOCX: `backend/src/templates/surat-pernyataan-pkl.docx`
- [x] Versioning: v1 (generated), v2 (uploaded signed)
- [x] Admin: `DocumentsView.vue` — verify uploaded document
- [x] Phase check: hanya NON_PKL, PKL_AKTIF, PKL_SELESAI

---

## Fase 3: PKL Aktif

### Sub-Fase 3a: Absensi Harian
- [x] `AttendanceView.vue` — submit absensi (status + aktivitas + GPS)
- [x] Status: HADIR, IZIN, SAKIT, ALPHA
- [x] GPS coordinates (lat, long) via browser geolocation
- [x] 1 absensi per hari (unique constraint)
- [x] No backfill (hanya hari ini)
- [x] GPS anomaly detection (koordinat 0,0)
- [x] DUDI confirm absensi: `AttendanceVerifyView.vue`
- [x] Admin monitor: `AttendanceMonitorView.vue`
- [x] Guru rekap absensi kelompok

### Sub-Fase 3b: Jurnal Kegiatan
- [x] `JournalView.vue` — isi jurnal harian (aktivitas, hasil, kendala)
- [x] Hanya hari ini (no backfill)
- [x] 1 jurnal per siswa per hari
- [x] Siswa bisa edit jurnal hari ini
- [x] Guru tambah catatan: `JournalMonitorView.vue`

### Sub-Fase 3c: Pengaduan
- [x] `ComplaintView.vue` — buat pengaduan (subjek + isi)
- [x] Auto-assign ke kelompok siswa
- [x] Guru/DUDI/admin bisa reply
- [x] Status: TERBUKA, DIPROSES, SELESAI

### Sub-Fase 3d: Monitoring Kunjungan
- [x] Guru jadwalkan kunjungan: `VisitView.vue`
- [x] Notifikasi ke anggota kelompok
- [x] Guru mark visited + catatan

---

## Fase 4: Pasca-PKL

### Sub-Fase 4a: Penilaian
- [x] DUDI input nilai: `GradesView.vue`
- [x] Fields: scoreDudi, finalScore, predicate (A/B/C/D)
- [x] Guru input catatan bimbingan: `GradeApprovalView.vue`
- [x] 100% weight DUDI
- [x] Admin rekap: `GradeRecapView.vue`

### Sub-Fase 4b: Laporan Akhir
- [x] Siswa upload PDF laporan akhir: `ReportView.vue`
- [x] Guru approve/reject laporan

### Sub-Fase 4c: Surat Penarikan
- [x] Admin generate Surat Penarikan Siswa (PDF per siswa/kelompok)
- [x] Phase transition: PKL_AKTIF → PKL_SELESAI

---

## Phase Schedule System

- [x] `PhaseSchedule` model — unique [cohortId, phase]
- [x] Admin set tanggal per fase: `PhaseScheduleView.vue`
- [x] `getCurrentPhase(cohortId)` — determine active phase by date
- [x] `StudentWorkflowService` — determine effective phase from schedule
- [x] Auto-sync `User.phase` when student loads workflow (only forward, not backward)
- [x] `GET /api/student/workflow` — returns effectivePhase + hasCompleted + nextSchedule
- [x] **DONE:** Cron job — passive sync via StudentWorkflowService sudah jalan (setiap siswa buka workflow, phase otomatis sync forward)
- [x] **DONE:** Dashboard admin tampilkan fase aktif per gelombang (via `cohortPhases` di `/api/dashboard/stats`)

---

## Surat / Letter Generation

### Sudah Di-Implement:
- [x] **Surat Permohonan PKL** (Fase 1) — PDFKit, kop surat + daftar anggota
- [x] **Surat Pernyataan PKL-Siswa** (Fase 2) — docxtemplater, data siswa + tahun ajaran
- [x] **Surat Penarikan Siswa** (Fase 4) — PDFKit, per siswa/kelompok
- [x] **Surat Pengantar PKL** — `POST /api/phase4/introduction-letter` (PDFKit)
- [x] **Surat Penugasan Pembimbing** — `POST /api/phase4/assignment-letter` (PDFKit)

---

## User Management (Admin)

- [x] Create user (SISWA, GURU_PEMBIMBING, ADMIN, DUDI)
- [x] Toggle active/inactive
- [x] Hard delete user (admin & super_admin dilindungi)
- [x] Dropdown gelombang untuk siswa (fix: cohortId wajib diisi)
- [x] Error handler: Prisma P2002 unique constraint (fix: target bisa string/bukan array)

---

## Frontend Views

### Siswa:
- [x] `StudentWorkflowView.vue` — workflow berdasarkan fase aktif dari jadwal
- [x] `RegistrationView.vue` — form pra-pendaftaran
- [x] `PernyataanView.vue` — surat pernyataan + upload
- [x] `MyGroupsView.vue` — info kelompok
- [x] `MyDocumentsView.vue` — upload & kelola dokumen
- [x] `AttendanceView.vue` — absensi GPS
- [x] `JournalView.vue` — jurnal kegiatan
- [x] `ComplaintView.vue` — pengaduan
- [x] `ReportView.vue` — laporan akhir
- [x] `ParentDataView.vue` — data orang tua

### Guru Pembimbing:
- [x] `JournalMonitorView.vue` — monitor jurnal siswa
- [x] `VisitView.vue` — jadwalkan kunjungan
- [x] `GradeApprovalView.vue` — approve laporan + input catatan

### DUDI:
- [x] `AttendanceVerifyView.vue` — konfirmasi absensi
- [x] `GradesView.vue` — input nilai + feedback
- [x] `JobVacanciesView.vue` — posting lowongan

### Admin:
- [x] `RegistrationsView.vue` — verifikasi pendaftaran
- [x] `GroupsView.vue` — manajemen kelompok
- [x] `DocumentsView.vue` — verifikasi dokumen
- [x] `CompaniesView.vue` — data perusahaan
- [x] `GradeRecapView.vue` — rekap nilai + surat penarikan
- [x] `AttendanceMonitorView.vue` — monitor absensi
- [x] `UsersView.vue` — manajemen user
- [x] `CohortsView.vue` — manajemen gelombang
- [x] `PhaseScheduleView.vue` — jadwal fase
- [x] `AuditLogsView.vue` — audit log

### Semua Role:
- [x] `DashboardView.vue` — dashboard role-based
- [x] `AnnouncementsView.vue` — pengumuman
- [x] `NotificationsView.vue` — notifikasi

---

## Backend Architecture

- [x] Layered: routes → controllers → services → repositories
- [x] 26 route files, 23 controllers, 27 services, 21 repositories
- [x] Validators (Zod) untuk semua input
- [x] Custom error classes (AppError, NotFoundError, BadRequestError, dll)
- [x] Async handler wrapper
- [x] Pagination utility
- [x] File storage utility (outside webroot)
- [x] Audit logging service
- [x] Cron jobs (auto-close attendance, cleanup tokens, archive cohorts)

---

## Testing & QA

- [x] **DONE:** Seed data QA — `prisma/seed-qa.ts` (siswa fase 1-4, guru, DUDI, kelompok, registrasi)
  - Siswa fase 1 (PRA_PKL): `siswa_fase1 / 123456`
  - Siswa fase 2 (NON_PKL): `siswa_fase2 / 123456`
  - Siswa fase 3 (PKL_AKTIF): `siswa_fase3 / 123456`
  - Siswa fase 4 (PKL_SELESAI): `siswa_fase4 / 123456`

---

## Deployment

- [x] `docker-compose.yml` (backend + frontend + MySQL)
- [x] `nginx.conf` (reverse proxy + SPA fallback)
- [x] Environment variables documentation
- [ ] **TODO:** Testing deploy di VPS/staging

---

## Known Issues / Design Notes

1. **Phase dependency on schedule**: Setelah submit registrasi, phase siswa baru berpindah kalau PhaseSchedule sudah dikonfigurasi. Kalau admin lupa set jadwal, siswa tetap di PRA_PKL.

2. **Kredensial provisioning**: Akun anggota dan akun DUDI dibuat bersamaan saat surat penerimaan disetujui (Fase 2). Akun DUDI memakai username & password acak (`DUDI<kode>`), disimpan terenkripsi dan ditampilkan ke Ketua pada kartu "Akun DUDI" — Ketua menyerahkannya ke pembimbing perusahaan saat masa PKL. Reset password via Admin bila perlu mengirim ulang.

3. **No email/SMS**: Notifikasi hanya in-app, belum ada integrasi email atau SMS.

4. **Single Pinia store**: Hanya `auth.store.ts`. Data lain di-fetch langsung di component (bisa menyebabkan repeated API calls jika tidak di-cache).

---

## Quick Reference: Alur Lengkap dari `prompt.txt`

```
Fase 1: PRA-PENDAFTARAN-PKL
├── Siswa (ketua) isi form → nama kelompok, kelas, anggota, perusahaan
├── Admin konfirmasi → APPROVE
├── Sistem generate PDF Surat Permohonan PKL
└── Siswa download → cetak → serahkan ke perusahaan

Fase 2: PENDAFTARAN ULANG (PKL)
├── Masa NON_PKL dimulai (PhaseSchedule)
├── Siswa isi form daftar ulang
├── Backend generate SURAT PERNYATAAN PKL-SISWA.docx
├── Siswa download → cetak → materai → tanda tangan → upload
└── Admin verifikasi → APPROVE

Fase 3: PKL AKTIF
├── Siswa: absensi GPS + jurnal + pengaduan (harian)
├── DUDI: konfirmasi absensi siswa
├── Guru: monitor jurnal, jadwalkan kunjungan
└── Berlangsung selama masa PKL_AKTIF

Fase 4: PASCA-PKL
├── DUDI: input nilai + feedback
├── Siswa: upload laporan akhir PDF
├── Guru: approve laporan
├── Admin: generate Surat Penarikan Siswa
└── Phase: PKL_AKTIF → PKL_SELESAI
```

---

## P1-P3: Perbaikan Akses & Keamanan (2026-10-01)

### P1 - Selesai
- [x] Document list/detail/download/verify: akses pemilik/admin/kepsek/pembimbing/DUDI
- [x] `window.open` diganti `downloadFile` (4 view)
- [x] Ubah password: `POST /api/auth/change-password` + modal
- [x] `GET /grades/dudi` + GradesView (nilai DUDI)
- [x] Sidebar "Verifikasi Dokumen & Laporan" diperbaiki

### P2 - Selesai
- [x] Phase gating bertahap (forward-only, dibatasi fase kalender)
- [x] GradeRecapView: hasil + daftar surat + skip list
- [x] GroupsView: centang pembimbing (`PUT /groups/:id/supervisors`) + blok Surat PKL
- [x] Sidebar/router siswa: PKL_SELESAI aktif; laporan akhir PKL_AKTIF/PKL_SELESAI
- [x] StudentWorkflowView: banner ketua fase 3/4 + peringatan tertinggal jadwal

### P3 - Selesai (scope/IDOR)
- [x] `attendance.listForDudi` / `journal.listForDudi`: filter groupId anti-bypass
- [x] `attendance.list` / `attendance.summary` / `journal.list` / `complaint.list`: GURU_PEMBIMBING dibatasi kelompok bimbingan
- [x] `visit.list`: guru hanya melihat kunjungannya; admin boleh `complete` kunjungan guru
- [x] StudentWorkflowView: kartu "Surat Kelompok Anda" (unduh Pengantar/Penugasan/Penarikan)
- [x] Verifikasi: `npx tsc --noEmit` (backend) + `vue-tsc --noEmit` + `vite build` (frontend) hijau

---

## Auto-Generate Akun DUDI (2026-10-02)

Spec `prompt.txt:45` + revisi: akun DUDI dibuat **bersamaan dengan akun siswa di Fase 2** (surat penerimaan disetujui), memakai **username & password acak** — tanpa input nama/no. HP mentor di Fase 1, karena siswa menyerahkan akunnya ke pembimbing perusahaan saat masa PKL.

- [x] `studentWorkflow.service.ensureDudiAccount()`: saat provisioning Fase 2 → buat user `Role.DUDI` username acak `DUDI<6-digit>`, password acak, `mustChangePassword`, `CompanyMentor` (`fullName = "Mentor <nama perusahaan>"`, tanpa HP), `InitialCredential`, lalu `autoAssignDudiMentors` (primary)
- [x] Idempoten/aman lintas gelombang: bila perusahaan sudah punya akun mentor, pembuatan dilewati (hanya penugasan ke kelompok)
- [x] `getStatus` → field `dudiCredential` (nama, username, password sementara)
- [x] `StudentWorkflowView.vue`: kartu "Akun DUDI (Pembimbing Perusahaan)" — teks: serahkan ke pembimbing saat masa PKL dimulai
- [x] Input mentor di form Fase 1 **dihapus** (validasi, payload, UI) + kolom `Registration.mentorName/mentorPhone` di-drop (migrasi `20261002041524_drop_registration_mentor`)
- [x] Verifikasi end-to-end via skrip service: draft (tanpa data mentor) → approve admin → surat penerimaan DISETUJUI → 2x `getWorkflowStatus` → akun DUDI `DUDIBDKY7G` role DUDI + `CompanyMentor` hp=null + penugasan primary + `InitialCredential` + `dudiCredential` == DB; data uji dibersihkan
- [x] Verifikasi: `npx tsc --noEmit` (backend) + `vue-tsc --noEmit` + `vite build` (frontend) hijau

---

## Form Fase 1: Gelombang Mengikuti Akun Ketua (2026-10-02)

- [x] `RegistrationView.vue`: bila akun ketua punya gelombang (diisi Admin saat buat akun), select gelombang diganti tampilan terkunci "… (mengikuti gelombang akun Anda)" + payload memakai gelombang akun
- [x] Backend `registrationService.saveDraft`: `cohortId` dipaksa dari `user.cohortId` ketua (input form diabaikan) — lookup Master Siswa & penyimpanan sama-sama memakai gelombang akun
- [x] Akun ketua tanpa gelombang (lawas) tetap bisa memilih manual
- [x] Verifikasi: kirim gelombang sengaja salah → tersimpan gelombang milik akun ketua; `npx tsc --noEmit` + `vue-tsc --noEmit` + `vite build` hijau

---

## Admin: "Data PKL" Siswa di Manajemen User (2026-10-02)

No. HP yang diisi ketua di form Fase 1 tersimpan di `RegistrationMember.phone` (per anggota), dan no. HP siswa hasil daftar ulang ada di `StudentProfile.phone` + `ParentData.*Phone` (diisi lewat Form Data Orang Tua saat Fase 2). Keduanya kini bisa dilihat Admin:

- [x] Backend `GET /api/users/:id/student-data` (`userManage.service.getStudentData`, ADMIN/SUPER_ADMIN)
  - `fase1`: status/kode pendaftaran, gelombok, kelompok, perusahaan, daftar anggota + **No. HP** (dari form pra-pendaftaran)
  - `fase2`: profil siswa (NISN, kelas, **No. HP**, alamat, dll), data ortu/wali + No. HP, status Surat Pernyataan
  - `group`: kelompok PKL + akun DUDI (bila sudah terbentuk); `null` untuk akun yang belum melalui Fase 1/2
- [x] `UsersView.vue`: tombol **"Data PKL"** pada baris role SISWA → modal 3 bagian (Fase 1 / Fase 2 / Kelompok) dengan empty-state bila belum ada data
- [x] `api.service.ts`: tipe `StudentPklData` + `userManageService.getStudentData(id)`
- [x] Verifikasi via skrip (ketua uji terpisah, data user lain tidak disentuh): draft+HP → approve → surat penerimaan → provisioning → `getStudentData` mengembalikan fase1 (member.phone `081234567890`), fase2 (profil), group (DUDI); user tanpa data → semua `null`; data uji dibersihkan
- [x] Verifikasi: `npx tsc --noEmit` + `vue-tsc --noEmit` + `vite build` hijau

---

## Bug: Upload Surat Penerimaan Bisa Ditimpa Saat Menunggu Verifikasi (2026-10-02)

Ketua bisa upload berulang dan file pertama tergantikan padahal masih menunggu verifikasi admin. Aturan baru: **file terkunci selama menunggu verifikasi; upload ulang hanya setelah admin MENOLAK.**

- [x] Backend `document.service.uploadDocument`: tolak upload bila dokumen existing status `MENUNGGU_VERIFIKASI` / `DIUNGGAH` (pesan: menunggu verifikasi, hanya boleh setelah ditolak). Berlaku untuk semua tipe upload (Surat Penerimaan, Surat Pernyataan, Laporan Akhir, Lainnya). Status `DISETUJUI` tetap ditolak, `DITOLAK` boleh upload ulang
- [x] `StudentWorkflowStatus`: field baru `suratPenerimaanStatus` + `suratPenerimaanNote` (query dokumen non-DISETUJUI terbaru)
- [x] `StudentWorkflowView.vue` Step 1: saat pending → hanya kartu info "Menunggu verifikasi admin… file tidak dapat diganti" (input & tombol disembunyikan); saat `DITOLAK` → banner merah berisi alasan + form upload ulang; guard tambahan di `uploadSuratPenerimaan()`
- [x] Verifikasi via skrip (akun ketua uji sementara): upload-1 OK → upload-2 DITOLAK (pesan jelas) → pending → admin reject → `suratPenerimaanStatus=DITOLAK` + alasan tampil → upload ulang OK (v2) → approve → upload-4 ditolak "sudah disetujui"; data uji dibersihkan
- [x] Verifikasi: `npx tsc --noEmit` + `vue-tsc --noEmit` + `vite build` hijau

---

## Form Surat Pernyataan (Fase 2): Data Terkunci dari Master Siswa + Pendaftaran Fase 1 (2026-10-02)

Siswa tidak boleh mengubah identitasnya di form pernyataan. Aturan sumber data:

| Field | Sumber | Editable |
|---|---|---|
| Nama siswa | **Master siswa** (`StudentRegistry` via NISN + gelombang) | ❌ terkunci |
| Kelas / program keahlian | **Master siswa** (`className` + `major.name`) | ❌ terkunci |
| No. HP siswa | **Pendaftaran Fase 1** (`RegistrationMember.phone`; fallback `StudentProfile.phone`) | ❌ terkunci |
| Tempat PKL | **Pendaftaran Fase 1** (perusahaan group hasil approval → fallback snapshot `Registration.companyName`) | ❌ terkunci |
| Nama ortu, alamat, No. HP ortu | input siswa (fallback `ParentData`/`StudentProfile`) | ✅ boleh |

- [x] Backend `pernyataan.service.ts`: `collectStudentData` mengunci 4 field di atas secara server-side; `getPrefill` kini memakai `collectStudentData` yang sama (query tidak lagi diduplikasi)
- [x] `pernyataan.validator.ts`: field `namaSiswa`/`kelasJurusan`/`hpSiswa`/`tempatPkl` dihapus dari DTO — payload klien yang menyertakan field itu diabaikan (terbukti override `HACKED` tidak masuk PDF)
- [x] Frontend `PernyataanView.vue` + `StudentWorkflowView.vue` (form anggota): 4 field dibuat `readonly` + hint "Otomatis dari data master siswa (NISN)" / "Otomatis dari pendaftaran Fase 1"; payload generate hanya `namaOrtu`/`alamatSiswa`/`hpOrtu`
- [x] Verifikasi via skrip (data uji dibersihkan): prefill → nama "Siti Dari Master" (bukan nama di profil), kelas "XII-RPL-9/Rekayasa Perangkat Lunak", HP `0811111111`, tempat "PT Maju Jaya"; generate dengan payload override → metadata audit PDF tetap memakai nilai terkunci, input ortu tetap dipakai, dokumen DRAFT
- [x] Verifikasi: `npx tsc --noEmit` + `vue-tsc --noEmit` + `vite build` hijau

---

## Monitoring Absensi: Hierarki Kelas -> Kelompok -> Siswa + Lokasi GPS (2026-10-02)

**Permintaan:** (1) absensi di fitur admin tertata per kelas, lalu per kelompok, lalu per siswa; (2) DUDI & Admin bisa melihat lokasi siswa saat presensi.

- [x] Backend `GET /api/attendances/by-class` (ADMIN/SUPER_ADMIN/KEPALA_SEKOLAH/GURU_PEMBIMBING): `attendanceService.listByClass` mengelompokkan absensi **kelas -> kelompok -> siswa** (filter `from`/`to`/`status`/`cohortId`; guru di-scope ke kelompok bimbingan; kelas dari relasi `Class` profil, fallback `StudentRegistry.className` via NISN)
- [x] Response memuat record lengkap termasuk **koordinat GPS** (`checkInLat/Long`, `checkOutLat/Long`, catatan) + verifikasi DUDI + flag anomali (data sudah ada di model, tinggal ditampilkan)
- [x] `AttendanceMonitorView.vue` (admin): ringkasan kartu + filter gelombang/status/tanggal; tabel hierarki: header **KELAS** (badge, jumlah siswa/kelompok) -> **KELOMPOK** (nama + perusahaan) -> baris **siswa** (NISN + hitungan Hadir/Sakit/Izin/Alfa) yang bisa dibuka -> rincian per tanggal dengan status, kegiatan, verifikasi, dan tombol **"Peta Lokasi"**
- [x] `AttendanceVerifyView.vue` (DUDI): kolom baru **Lokasi Presensi** — koordinat singkat + tombol "Peta Lokasi" + badge "Lokasi dicurigai" saat anomali
- [x] Komponen `LocationMapModal.vue`: modal peta bersama (admin & DUDI) — iframe OpenStreetMap + link "Buka di Google Maps", mendukung titik Absen Masuk & Absen Keluar, plus catatan GPS
- [x] **Bug filter status ketemu & diperbaiki:** enum absensi hanya `HADIR/IZIN/SAKIT/ALPHA` — pilihan lama `TERLAMBAT`/`ALFA` membuat filter error 400; kini opsi & kolom memakai `ALPHA`
- [x] Verifikasi via skrip (delta terhadap data existing milik user lain, tidak disentuh): struktur 2 kelas/2 kelompok/3 siswa benar; nama kelas B dari master siswa; koordinat terbawa; filter status/gelombang/tanggal tepat; guru tanpa bimbingan kosong; 14/14 assertion OK
- [x] Verifikasi: `npx tsc --noEmit` + `vue-tsc --noEmit` + `vite build` hijau

---

## Monitoring Absensi: Drill-down Kelas -> Kelompok -> Siswa (2026-10-02)

**Masalah:** hierarki kelas -> kelompok tidak murni karena kelompok boleh berisi siswa **beda kelas** (`Group` tidak punya kelas; kelas per siswa). Desain dipilih (opsi user): **drill-down** — daftar kelas dulu, buka kelas baru tampil kelompoknya.

- [x] Level 1 **Daftar Kelas**: tabel (nama kelas, #siswa, #kelompok, total absensi, kolom Hadir/Sakit/Izin/Alfa) — baris bisa diklik
- [x] Level 2 **Kelompok di kelas**: tombol "Kembali", header kelas, daftar kartu kelompok (nama + perusahaan) berisi tabel siswa **hanya siswa kelas itu**; kelompok lintas kelas diberi badge amber **"1 dari 2 anggota di kelas ini"**
- [x] Level 3 **Detail siswa**: baris bisa dibuka -> rincian absensi per tanggal (status, kegiatan, verifikasi, **Peta Lokasi**)
- [x] Backend `listByClass`: field baru `memberCount` per kelompok (hitungan `GroupMember` aktif, bukan dari data absensi) agar badge lintas kelas akurat walau ada filter tanggal/status
- [x] `selectedClass` otomatis di-reset bila kelas hilang dari hasil filter baru
- [x] Verifikasi skrip **skenario kelompok lintas kelas** (Kelompok Alpha = Anak A kelas A + Anak B kelas B): badge "1 dari 2" muncul di kedua kelas, tiap kelas hanya menampilkan siswanya sendiri, kelompok non-lintas tanpa badge, filter tetap akurat; 13/13 assertion OK; data uji dibersihkan
- [x] Verifikasi: `npx tsc --noEmit` + `vue-tsc --noEmit` + `vite build` hijau

## Rekap Penilaian: Drill-down Kelas -> Kelompok -> Siswa (2026-10-03)

**Masalah:** card "Rekap Nilai Keseluruhan" (`GradeRecapView`) hanya tabel datar (siswa tanpa konteks kelas/kelompok), dan siswa **belum dinilai tidak muncul** (sumbernya hanya tabel `Grade`). Dibuat hierarki sama seperti monitoring absensi.

- [x] Backend baru **`GET /api/grades/recap-by-class`** (roles ADMIN/SUPER_ADMIN/KEPALA_SEKOLAH, query opsional `cohortId`) -> `gradeService.getRecapByClass()`:
  - sumber siswa = seluruh `GroupMember` kelompok aktif (termasuk belum punya nilai -> `grade: null`), kelas per siswa: relasi profil -> fallback `StudentRegistry.className` (batch by NISN) -> "Belum Ada Kelas"
  - satu nilai terbaik per siswa (prioritas baris `finalScore != null`, lalu terbaru) -> siswa dengan banyak baris nilai (DUDI + guru) tampil sekali
  - response `{ classes: [{ className, studentCount, gradedCount, groups: [{ groupId, groupName, companyName, memberCount, students }] }], totalStudents, totalGraded }`; `memberCount` dihitung dari member kelompok (akurat walau sebagian anggota di kelas lain)
- [x] Validator `recapByClassQuerySchema`, controller `recapByClass`, route `GET /grades/recap-by-class` (sebelum export router)
- [x] Frontend: tipe `GradeRecapStudent/Group/Class/ByClass` + `gradeService.recapByClass()`; `GradeRecapView` card rekap jadi drill-down:
  - Level 1 daftar kelas (klik): #siswa, #kelompok, dinilai, rata-rata nilai akhir
  - Level 2: tombol kembali, header kelas, kartu per kelompok + **badge lintas kelas "n dari m anggota di kelas ini"**, tabel siswa (NISN, nilai DUDI, indikator tooltip, bimbingan, akhir, predikat, catatan); belum dinilai -> "Belum dinilai" (redup)
  - `completePhase` (Fase 4) disesuaikan: kumpulkan `userId` dari struktur baru dengan `finalScore != null` (tidak lagi dari `gradeService.recap`)
  - `selectedClass` auto-reset bila kelas hilang dari hasil muat ulang
- [x] Verifikasi skrip (service-level, idempoten, auto-cleanup): kelas A (relasi) + kelas B (registry), kelompok lintas kelas (u1 kelas A + u2 kelas B) + kelompok kelas A (u3), nilai u1 lengkap dengan 1 baris parsial yang lebih baru + u2 parsial + u3 nihil; 33/33 assertion OK (pemilihan baris nilai, badge memberCount, klasifikasi kelas, filter cohort, graceful saat anggota dihapus, cleanup nol sisa); data uji dibersihkan, script dihapus
- [x] Verifikasi: `npx tsc --noEmit` + `vue-tsc --noEmit` + `vite build` hijau
- [ ] Batasan dikenal (sama seperti absensi): nama kelas di-map global (bukan per cohort) — aman karena nama kelas unik per cohort; opsi `cohortId` disediakan untuk filter

## Admin Verifikasi Pendaftaran: Tampilkan Data Fase 1 Lengkap (2026-10-03)

**Masalah:** modal "Detail" di `RegistrationsView` hanya menampilkan perusahaan + alamat + nama pengaju (akun ketua, mis. "KETUA001" tanpa identitas). Data yang diisi akun ketua di Fase 1 — NISN, nama, kelas, no. HP, alamat anggota, serta detail tempat PKL (kota, bidang industri, telepon, website, kontak WA) dan gelombang — **tidak terlihat sama sekali** oleh admin saat memverifikasi. Bonus bug: tombol "Tolak" selalu gagal karena `noteFor` tidak pernah diisi (tidak ada input alasan di UI).

- [x] Backend `registrationService.listGrouped()`: include `members` (urut isLeader desc) + `major` + `cohort`; respons grup kini memuat `companyIndustry/Phone/City/Website/Contacts`, `majorName`, `cohortName`; tiap registrasi memuat `members[]` (`id, userId, fullName, nisn, className, phone, address, isLeader`)
- [x] Frontend `GroupedRegistration` type disesuaikan (reuse `RegistrationMember`)
- [x] Modal `RegistrationsView.vue` (max-w-4xl):
  - kartu **Tempat PKL (Fase 1)**: Perusahaan, Kota, Alamat, Bidang Industri, Telepon, Website, Kontak (WA), Jurusan, Gelombang
  - per registrasi: kode, pengaju, status, tanggal diajukan + aksi; **tabel anggota**: NISN, Nama (+badge Ketua), Kelas, No. HP, Alamat
  - **fix tombol Tolak**: alasan penolakan kini punya input textarea inline (Simpan Tolak/Batal) — sebelumnya mustahil ditekan
  - detail grup di-refresh dari hasil muat ulang setelah approve/reject (status tidak basi)
- [x] Verifikasi skrip (service-level, idempoten, auto-cleanup): `saveDraft` form Fase 1 lengkap → `listGrouped()` menampilkan semua field grup/registrasi/anggota + fallback `leaderName` = username untuk akun tanpa profil + filter `cohortId` + **data produksi LEMONSYNC (REG-2026-0001) tidak berubah & tetap terbaca (2 anggota, NISN)**; 36/36 assertion OK; data uji dibersihkan, script dihapus
- [x] Verifikasi: `npx tsc --noEmit` + `vue-tsc --noEmit` + `vite build` hijau

## Tutup Gelombang: Nonaktifkan Akun + Filter Gelombang Aktif (2026-10-03)

**Masalah:** saat admin menutup/mengarsipkan gelombang (CLOSED/ARCHIVED), akun SISWA/KETUA/DUDI lama tetap aktif dan tampil di semua daftar admin, padahal gelombang sudah selesai. Data absensi/jurnal/nilai/surat harus **tetap tersimpan** (semua relasi FK onDelete: Cascade ke User), jadi hard delete tidak mungkin. Ditambah: view monitoring admin masih default ke gelombang terbaru apa adanya, bukan gelombang yang sedang aktif (OPEN).

- [x] Backend cohortManage.service.ts update(id, dto, actorId?, ctx?):
  - deteksi transisi status (CLOSED_STATUSES = [CLOSED, ARCHIVED]); TO closed -> **soft-delete** (deletedAt = now) semua user role IN (SISWA, KETUA, DUDI) dengan cohortId = gelombang itu; TO open -> restore (deletedAt = null)
  - role lain (ADMIN/GURU_PEMBIMBING/SUPER_ADMIN/KEPALA_SEKOLAH) **tidak disentuh** meski cohortId-nya sama
  - audit CLOSE_COHORT/REOPEN_COHORT (action baru di constants.ts) + return { ..., deactivatedUsers, restoredUsers }
- [x] cohortManage.controller.ts pass req.user.sub + request context (IP/user-agent) untuk audit
- [x] userManageService.delete(): **hard delete -> soft delete** (deletedAt), proteksi ADMIN/SUPER_ADMIN tetap; daftar admin (list filter deletedAt: null) otomatis bersih
- [x] Login diblokir otomatis untuk akun nonaktif (cek deletedAt sudah ada di auth.service.ts)
- [x] studentWorkflowService.createMemberAccounts: **reuse akun lama berdasarkan NISN** (username = nisn, role SISWA, termasuk yang soft-delete) -> pulihkan deletedAt, pindahkan cohortId ke gelombang baru, tautkan registrationMember.userId, kelola kredensial (InitialCredential / regenerate bila mustChangePassword); tanpa duplikat User maupun StudentProfile
- [x] dudiAssignment.autoAssignDudiMentors: restore mentor DUDI perusahaan yang nonaktif sebelum menugaskan (akun DUDI lintas gelombang)
- [x] Frontend:
  - helper pickActiveCohortId() di api.service.ts (utamakan status === 'OPEN', fallback gelombang pertama)
  - CohortsView: dialog konfirmasi tutup (jelaskan akun dinonaktifkan, data tetap) & buka (jelaskan akun dipulihkan) + pesan sukses berisi jumlah akun
  - default filter gelombang aktif di AttendanceMonitorView, GradeRecapView, RegistrationsView, StudentRegistryView, PhaseScheduleView, GroupsView (select "Gelombang" ditambahkan di GradeRecapView, RegistrationsView, GroupsView untuk pilih manual / "Semua Gelombang")
  - groupService.list(params?: { cohortId }) (sebelumnya tanpa param)
  - MasterLookups.cohorts tipe ditambah status (backend sudah mengirim)
- [x] Verifikasi skrip (service-level, idempoten, auto-cleanup): tutup gelombang -> 4 akun nonaktif (siswa+ketua+dudi), guru tidak disentuh, **semua data absensi/jurnal/nilai/surat/pendaftaran/kelompok utuh**, login siswa DITOLAK + audit tercatat; buka kembali -> 4 pulih + login sukses; hapus manual (guru + siswa berabsensi) = soft delete (baris + data ada, hilang dari daftar admin); tutup lagi -> auto-restore DUDI saat autoAssignDudiMentors; gelombang baru + NISN sama -> **reuse akun lama** (username = NISN, cohortId pindah, member ter-taut, 0 duplikat); 37/37 assertion OK; data produksi REG-2026-0001 tidak berubah; data uji dibersihkan, script dihapus
- [x] Verifikasi: npx tsc --noEmit + vue-tsc --noEmit + vite build hijau
- [ ] Batasan dikenal: buka kembali gelombang memulihkan **semua** akun SISWA/KETUA/DUDI gelombang itu (termasuk yang dihapus manual sengaja); UsersView sengaja tidak difilter per gelombang (guru tidak punya cohortId, siswa gelombang terhapus otomatis hilang via soft-delete)

## Keamanan Kredensial DUDI: Cegah Siswa Menilai Dirinya Sendiri (2026-10-03)

**Masalah:** password plaintext akun DUDI dikirim ke ketua via GET /api/student/workflow (dudiCredential.temporaryPassword, by design "untuk dibagikan ke pembimbing") -> siswa/ketua licik bisa login sebagai DUDI lalu **memverifikasi absensi/jurnal dan menginput nilai kelompoknya sendiri**. Celah memperparah: InitialCredential tidak pernah dihapus saat ganti password (password awal terbaca ulang selamanya), GET /api/groups/:id tanpa authorizeRoles (IDOR: semua role baca detail kelompok lain + passwordHash ikut terkirim di response group), dan generateRandomPassword() memakai Math.random().

- [x] **studentWorkflow.service.ts**: dudiCredential kini hanya { fullName, username } — temporaryPassword dihapus dari tipe, getter, dan response workflow; kartu "Akun DUDI" di StudentWorkflowView menampilkan username saja + catatan "password hanya diberikan Admin"; kredensial anggota kelompok untuk ketua **tetap** (by design)
- [x] **user.repository.clearInitialCredential()** dipanggil di authService.changePassword() -> setelah pengguna ganti password, baris InitialCredential dihapus permanen: endpoint kredensial admin & workflow menampilkan placeholder "(password telah diubah...)", password lama tidak bisa dibaca ulang siapa pun (reset oleh Admin tetap membuat baris baru)
- [x] **Strip passwordHash dari semua response kelompok** (group.repository.ts): userSafeSelect (tanpa passwordHash) dipakai di findByIdWithRelations, findByMember, paginate -> GET /groups/:id, /groups/me, /groups, /groups/supervised bersih; field lain (username, profil, dsb.) tetap utuh
- [x] **Anti-IDOR GET /api/groups/:id**: controller kini kirim viewer (sub + role) ke groupService.getById(id, viewer); akses: ADMIN/SUPER_ADMIN/KEPALA_SEKOLAH bebas, GURU_PEMBIMBING hanya kelompok bimbingannya, SISWA/KETUA/DUDI hanya kelompok sendiri (anggota/mentor); lainnya -> ForbiddenError "Anda tidak berhak mengakses data ini" (panggilan internal admin tanpa viewer tetap jalan; frontend hanya 2 view admin yang memakai endpoint ini)
- [x] **generateRandomPassword() -> crypto.randomInt**: 8 karakter dari charset aman, Fisher-Yates shuffle crypto, **dijamin** mengandung huruf besar + kecil + angka (lolos isStrongPassword); username DUDI (generateDudiUsername) juga crypto.randomInt
- [x] Verifikasi skrip (service-level, idempoten, auto-cleanup): workflow ketua E2E (surat penerimaan DISETUJUI -> provisioning ->) respons **tanpa password DUDI** & tanpa passwordHash tapi password anggota tetap ada; admin masih bisa baca kredensial awal **sebelum** ganti; setelah DUDI/siswa ganti password -> InitialCredential terhapus, placeholder muncul, password lama ditolak login; 3 endpoint group tanpa passwordHash; IDOR: admin/guru-pembimbing/anggota/mentor DUDI boleh, guru lain + siswa luar + ketua non-anggota ditolak; 100 password & 100 username DUDI unik + valid; 37/37 assertion OK; data produksi REG-2026-0001 tidak berubah; script dihapus
- [x] Verifikasi: npx tsc --noEmit + vue-tsc --noEmit + vite build hijau
- [ ] Catatan: akun KETUA sementara bukan anggota grup -> ditolak akses GET /groups/:id (frontend ketua memakai jalur lain: /student/workflow & /groups/me); hash bcrypt memang tidak bisa dibalik, tapi tidak lagi dikirim ke klien sama sekali

## Info Siswa: Kelompok Belum Terkoneksi Akun DUDI (2026-10-03)

**Masalah:** siswa tidak tahu kalau kelompoknya belum punya/telah ditautkan akun DUDI (pembimbing perusahaan) — akibatnya mentor tidak bisa absensi/jurnal/penilaian tanpa sepengetahuan siapa pun. Siswa perlu diarahkan minta ke Admin: Admin minta no. HP pembimbing, lalu buatkan & serahkan akunnya.

- [x] Backend studentWorkflow.service.ts: field baru **dudiConnected: boolean** di StudentWorkflowStatus — dihitung dari group.dudiMentors (minimal 1 mentor ditautkan); query group kini ikut include dudiMentors; false juga pada early-return tanpa gelombang
- [x] Frontend: tipe dudiConnected di api.service.ts; **kartu peringatan amber** di StudentWorkflowView (area notifikasi atas, tampil untuk SEMUA anggota termasuk ketua & lintas fase): "Akun DUDI Belum Terhubung — kelompok belum terkoneksi dengan akun pembimbing perusahaan, mentor belum dapat absensi/verifikasi jurnal/penilaian. Hubungi Admin sekolah; Admin akan meminta nomor HP pembimbing perusahaan lalu menyerahkan username & password akunnya." Muncul hanya bila hasGroup && !dudiConnected (siswa tanpa kelompok tidak diminta hal yang belum relevan)
- [x] Sisi admin sudah ada jalurnya: GroupsView penugasan DUDI + pesan "Belum ada akun DUDI yang ditautkan ke perusahaan ini" (buat akun via UsersView role DUDI, lalu tugaskan)
- [x] Verifikasi skrip (service-level, idempoten, auto-cleanup): anggota & ketua dudiConnected = false saat tanpa DUDI (banner tampil), true setelah akun dibuat + ditautkan; siswa tanpa kelompok hasGroup = false (banner tidak tampil); regresi keamanan — dudiCredential tetap tanpa password, password DUDI & passwordHash tidak pernah ada di respons; 17/17 assertion OK; data produksi REG-2026-0001 tidak berubah; script dihapus
- [x] Verifikasi: npx tsc --noEmit + vue-tsc --noEmit + vite build hijau

## Master Siswa: Hapus Data NISN (2026-10-03)

**Masalah:** admin tidak bisa menghapus baris NISN di Master Siswa — baris salah import / siswa keluar hanya bisa dibiarkan menumpuk, dan NISN-nya tetap lolos validasi pendaftaran.

- [x] Backend: **DELETE /api/student-registry/:id** (ADMIN/SUPER_ADMIN) -> studentRegistryController.remove + repository.findById (hanya baris isActive) + repository.softDelete (isActive = false); id tak ditemukan/sudah terhapus -> NotFoundError
- [x] Pendekatan **soft delete** memakai flag isActive yang sudah ada (tanpa hard delete, tanpa risiko FK):
  - daftar admin, lookup, dan count (findByCohort/findByNisn/countByCohort) sudah filter isActive: true -> baris hilang dari UI
  - validasi pendaftaran Fase 1 (registration.service & pernyataan.service juga filter isActive: true) -> NISN terhapus ditolak: "tidak terdaftar pada Master Siswa"
  - fallback kelas di absensi/penilaian (attendance/grade tanpa filter isActive) -> data siswa yang sedang PKL tetap utuh
  - **import ulang Excel memulihkan** (upsert menemukan baris sama via unique NISN lalu set isActive: true — tidak duplikat)
- [x] Frontend StudentRegistryView: kolom **Aksi** + tombol btn-danger "Hapus" per baris dengan confirm() (menjelaskan efek + cara memulihkan via import ulang), state deletingId (tombol "Menghapus..." anti-doble-click), pesan sukses + reload daftar; hint di header kartu: "Baris yang dihapus disembunyikan dari daftar & pendaftaran — import ulang Excel untuk memulihkan"
- [x] studentRegistryService.remove(id) di api.service.ts
- [x] Verifikasi skrip (repo-level, idempoten, auto-cleanup): soft delete -> baris masih ada + isActive false, hilang dari daftar/lookup/count, baris lain aman, hapus kedua/id asal -> NotFound, upsert (jalur import) memulihkan baris yang sama tanpa duplikat; 20/20 assertion OK; data produksi (REG-2026-0001 + master NISN 1234567891/92) tidak berubah; script dihapus
- [x] Verifikasi: npx tsc --noEmit + vue-tsc --noEmit + vite build hijau

## Master Siswa: Hapus Ikut Data Siswa - Absensi/Nilai/Pendaftaran (2026-10-03)

**Masalah:** hapus baris Master Siswa (sesi sebelumnya) hanya menyembunyikan baris - data siswa tetap utuh: akun NISN masih hidup, absensi/jurnal/nilai/surat/keanggotaan menumpuk. Permintaan user: hapus master = ikut hapus SEMUA data siswa; "buat relasinya, jangan-jangan kamu lupa menambahkannya?"

- [x] Analisis: relasi FK schema SEBENARNYA sudah ada dari awal (Attendance/Journal/Grade/Document/GroupMember/StudentProfile+ParentData/InitialCredential/RefreshToken/Notification/Complaint/Feedback -> User onDelete: Cascade; Registration.leaderId -> Cascade; RegistrationMember.userId -> SetNull) - yang kurang adalah WIRING: endpoint hapus master tidak pernah menyentuh akun siswa (link-nya string NISN via username/identifier)
- [x] Backend studentRegistryService.remove(id) menggantikan soft-delete polos:
  - cari baris master aktif -> NotFoundError bila tak ada/sudah terhapus
  - cari akun SISWA via NISN (OR username = nisn, identifier = nisn, role SISWA)
  - hapus eksplisit + hitung: registrationMember (by userId ATAU by NISN - menangani baris pendaftaran yang belum punya akun), attendance, journal, grade, document, groupMember, registration (leaderId = dia, artinya dia pengaju)
  - user.delete() permanen -> sisa relasi (StudentProfile + ParentData, InitialCredential, RefreshToken, Notification, Complaint, Feedback, dll) ikut terhapus otomatis via FK Cascade
  - baris master TETAP soft delete (isActive = false) - dipulihkan bila import ulang Excel
- [x] Efek samping yang disengaja & aman: pendaftaran yang DIAJUKAN siswa itu ikut terhapus (dia = pengaju), tapi kelompok tetap ada (Group.registrationId -> SetNull); pendaftaran kelompok lain tempat dia hanya ANGGOTA tetap ada (hanya baris keanggotaannya yang dihapus); pendaftaran dipimpin akun KETUA (jalur normal) tidak tersentuh
- [x] Controller remove: pesan sukses berisi ringkasan jumlah (akun, absensi, jurnal, nilai, dokumen, keanggotaan kelompok, baris pendaftaran, pendaftaran yang diajukan)
- [x] Frontend StudentRegistryView: confirm() lebih tegas - baris master disembunyikan (pulih via import) + AKUN beserta SEMUA data DIHAPUS PERMANEN (absensi, jurnal, nilai, surat/dokumen, keanggotaan, pendaftaran) TIDAK BISA dibatalkan; pesan sukses menampilkan jumlah yang ikut terhapus; hint header kartu diperbarui; studentRegistryService.remove() di api.service.ts kini mereturn ringkasan jumlah
- [x] Verifikasi skrip (service-level, idempoten, auto-cleanup): **39/39 assertion OK** - akun A + StudentProfile + ParentData + InitialCredential + RefreshToken + Notification + 2 absensi + jurnal + 2 nilai + dokumen + keanggotaan grup HABIS; data kontrol C utuh semua; REG1 (dipimpin KETUA) tetap ada, baris A di dalamnya hilang; REG2 (dipimpin A) ikut terhapus; grup tetap + registrationId jadi null (SetNull); baris master A/C/X nonaktif; baris pendaftaran orfan NISN tanpa akun ikut terhapus; hapus kedua kali -> NotFound; data produksi REG-2026-0001 + NISN 1234567891 tidak berubah; script dihapus
- [x] Verifikasi: npx tsc --noEmit + vue-tsc --noEmit + vite build hijau

## Master Siswa: Tambah Manual + Deteksi Duplikat Import (2026-10-03)

**Masalah:** (1) admin tidak bisa menambah siswa satu per satu dari UI - hanya bisa lewat import Excel; (2) jika admin tidak sengaja mengimport file Excel yang sama 2 kali, tidak ada pengecekan mana data yang sama sehingga baris bisa tertimpa/tampak terduplikasi tanpa kejelasan.

- [x] **Backend tambah manual** - POST /api/student-registry (ADMIN/SUPER_ADMIN) -> studentRegistryService.create:
  - validasi: cohort ada, NISN tepat 10 digit angka, nama wajib, kelas format XII-RPL-2 (pola sama dengan import), jurusan resolve dari kode eksplisit atau auto-detect dari kelas
  - pengecekan duplikat: NISN aktif di gelombang ini -> BadRequest "sudah terdaftar di Master Siswa gelombang ini"; NISN aktif di gelombang lain -> BadRequest + nama gelombangnya (NISN unique global, baris lain tidak dipindah); baris nonaktif hasil-hapus -> dipulihkan (upsert isActive = true, hasil laporkan sebagai restored)
  - route diletakkan POST '/' sebelum DELETE '/:id' (tanpa konflik), pesan sukses menandai ditambahkan vs dipulihkan
- [x] **Backend import Excel - deteksi duplikat** (studentRegistryImportService.importData):
  - **dalam 1 file**: NISN sama >1x -> baris pertama dipakai, sisanya masuk `duplicates[]` ("Duplikat dalam file yang sama - baris pertama yang dipakai")
  - **sudah ada di master, data identik** (nama + kelas + jurusan sama, baris aktif) -> DILEWATI (tidak menimpa, tidak terduplikat), masuk duplicates[] ("Sudah ada di Master Siswa dengan data yang sama - dilewati")
  - **sudah terdaftar di gelombang lain** -> DILEWATI + nama gelombang asal ("Sudah terdaftar di gelombang X - dilewati") - sebelumnya baris ke-hijack pindah gelombang (bug laten karena NISN unique global)
  - **data berbeda / baris nonaktif hasil-hapus** -> tetap upsert: diperbarui / DIPULIHKAN (alur "import ulang untuk memulihkan" tidak rusak)
  - hasil import kini: { total, created, updated, duplicates: [{ nisn, fullName, reason }], errors }
- [x] parseExcel berubah return { rows, errors } - error per baris (NISN kosong, nama kosong, format kelas) yang sebelumnya DIBUANG kini ikut dilaporkan ke hasil import
- [x] Frontend StudentRegistryView: tombol **"+ Tambah Siswa"** di header daftar -> modal (gelombang mengikuti pilihan, NISN 10 digit, nama, kelas, jurusan opsional dengan hint auto-detect, tombol Batal/Simpan, validasi client-side); hasil import kini menampilkan **panel amber "Data sama tidak diduplikasi (N)"** berisi NISN - nama (alasan), maks 20 baris + "... dan N lainnya"; pesan sukses menyertakan jumlah duplikat; tipe StudentRegistryImportResult + studentRegistryService.create di api.service.ts
- [x] Verifikasi skrip (service-level, idempoten, auto-cleanup, guard jurusan produksi): **38/38 assertion OK** - import file sama 2x -> created 0/updated 0/duplicates 2 + jumlah baris DB tetap; dobel dalam 1 file -> baris pertama dipakai; lintas gelombang -> dilewati, gelombang asal aman (nama tidak di-hijack); baris hasil-hapus tetap dipulihkan import; error parse baris ikut dilaporkan; create valid/duplikat gelombang ini/gelombang lain/NISN salah/kelas salah/jurusan tak dikenal semua sesuai; create pulihkan baris nonaktif; data produksi REG-2026-0001 + NISN 1234567891 tidak berubah; script dihapus
- [x] Verifikasi: npx tsc --noEmit + vue-tsc --noEmit + vite build hijau

## Master Siswa: Modal Pemetaan Header Kolom Excel (2026-10-03)

**Masalah:** nama header kolom di file Excel siswa BERAGAM antar file ("NISN"/"No. Induk", "Nama Lengkap"/"Nama Murid", "Kelas"/"Rombel") - parser lama hanya mengenali nama kolom umum sehingga file dengan header berbeda gagal/kosong. User minta: munculkan MODAL sebelum import berisi input nama header kolom (nama siswa, kelas siswa, dst).

- [x] **Backend inspect** - POST /api/student-registry/inspect (multipart, ADMIN/SUPER_ADMIN): baca baris header file -> return { headers: string[], detected: { nisn, fullName, className, majorCode } } dengan auto-detect case-insensitive (nisn|nama lengkap/nama siswa/nama|kelas/rombel/class|jurusan/major/kompetensi/keahlian) - hasilnya dipakai pre-fill modal
- [x] **parseExcel(buffer, mapping?)** ditulis ulang pakai sheet_to_json header:1 (array per baris):
  - mapping eksplisit dari admin OROTORITATIF (exact case-insensitive dulu, lalu contains); tanpa mapping -> fallback nama kolom umum (backward compatible)
  - kolom wajib tidak ditemukan -> 1x BadRequest jelas: "Kolom NISN (...) tidak ditemukan di file. Header yang tersedia: a | b | c" (bukan ribet error per baris)
  - baris kosong total (ekor/tengah file) -> dilewati diam-diam; baris isi kosong (NISN/nama/kelas kosong) tetap error per baris
  - kolom jurusan opsional (mapping boleh kosong -> jurusan auto-detect dari kelas)
- [x] **importExcel** menerima body mapNisn/mapFullName/mapClassName/mapMajorCode -> diteruskan ke parseExcel; alur import + deteksi duplikat sebelumnya TIDAK berubah
- [x] Frontend: klik "Import Excel" -> POST inspect dulu -> **modal "Pemetaan Kolom Excel"** muncul: nama file, chip daftar header terdeteksi, 4 input (NISN, Nama Siswa, Kelas Siswa, Jurusan opsional) pre-filled dari auto-detect (null -> kosong, admin isi manual), hint bahwa nama header harus persis baris pertama file, tombol Batal/"Import Sekarang"; validasi client-side 3 kolom wajib; petunjuk singkat juga ditampilkan di kartu import; tipe StudentRegistryInspectResult + StudentRegistryHeaderMapping di api.service.ts
- [x] Verifikasi skrip (service-level, idempoten, auto-cleanup, guard jurusan produksi): **20/20 assertion OK** - inspect header standar terdeteksi semua; header kustom "No. Induk/Nama Murid/Rombel/Keahlian" -> nama+kelas+jurusan terdeteksi, NISN null (admin manual); parse dengan mapping kustom -> nilai kolom terbaca benar; tanpa mapping + header asing -> BadRequest + daftar header; mapping salah -> pesan menunjuk nama kolom dicari; header umum tanpa mapping tetap jalan; baris kosong ekor dilewati, baris tanpa nama tetap error; import hasil mapping created=2 + jurusan Keahlian teresolve; re-import identik -> duplicates=2 (regresi); data produksi REG-2026-0001 tidak berubah; script dihapus
- [x] Verifikasi: npx tsc --noEmit + vue-tsc --noEmit + vite build hijau

## Bug: Tombol Simpan Akun Ketua Tidak Bisa Diklik (2026-10-03)

**Masalah:** di Manajemen User, saat role dipilih "Ketua Kelompok", tombol Simpan tidak bisa diklik sama sekali (disabled permanen).

- [x] Akar masalah: UsersView binding `:disabled="saving || !form.username || !form.password"` - untuk role KETUA username/password MEMANG sengaja dikosongkan (field-nya disembunyikan, backend auto-generate KETUA001 + password random) sehingga `!form.username` selalu true -> tombol selalu disabled
- [x] Fix: `:disabled="saving || (form.role !== 'KETUA' && (!form.username || !form.password))"` - role lain tetap wajib username+password; KETUA bebas klik, validasi "Gelombang wajib dipilih untuk akun Ketua." tetap jalan di submit()
- [x] Cek jalur backend: userManageService.create KETUA auto-generate username KETUA001-berikutnya + generateRandomPassword, return `{ ...user, password: plainPassword }` -> modal kredensial menampilkan username+password asli; validator menerima payload frontend (username KETUA<ts> diabaikan backend)
- [x] Verifikasi: vue-tsc --noEmit + vite build hijau

## Bug Krusial: NISN Anggota Bisa Terdaftar di Banyak Kelompok / Fase 1 (2026-10-03)

**Masalah:** ketua bisa memasukkan NISN anggota yang SUDAH terdaftar di kelompok lain - pendaftaran lolos saveDraft dan cuma ditunggu persetujuan admin, tanpa ada pengecekan sama sekali.

- [x] Akar masalah: `registration.service.ts saveDraft()` hanya validasi master (NISN ada di Master Siswa + nama/kelas cocok + tidak duplikat DALAM SATU kelompok) - tidak ada cek silang apakah NISN sudah punya baris RegistrationMember di pendaftaran LAIN
- [x] Fix: helper private `assertMembersFree(nisns, excludeRegistrationId?)` di registration.service.ts - query registrationMember dengan `registration.deletedAt: null` + status `in [DRAFT, DIAJUKAN, DISETUJUI]` + exclude pendaftaran sendiri; pesan per NISN: `NISN x (nama) sudah terdaftar di kelompok "nama" [kode - status]`; NISN null (auto-row "(Ketua)") difilter, dedupe per NISN
- [x] Status DITOLAK TIDAK mengikat (pendaftaran ditolak = NISN bebas daftar ke kelompok lain; selaras dgn findActiveByLeader yang exclude DITOLAK), soft-deleted tidak mengikat
- [x] Dipasang di 3 gerbang: (1) `saveDraft` SEBELUM create/update registration (gagal = tidak ada pendaftaran yatim), (2) `submit` cek ulang antara save & ajukan (tutup race), (3) `review APPROVE` cek ulang (gerbang terakhir admin)
- [x] Cek dilakukan setelah validasi master & setelah ConflictError "sudah diajukan" - urutan pesan tetap wajar; pesan masuk ke `error.value` via extractErrorMessage di RegistrationView (siswa) dan RegistrationsView (admin) - frontend tidak perlu diubah
- [x] Verifikasi skrip (service-level, idempoten, auto-cleanup, guard prefix): **14/14 assertion OK** - saveDraft dgn NISN DIAJUKAN ditolak + pesan "menunggu persetujuan admin"; saveDraft gagal tidak membuat pendaftaran yatim; NISN terikat DRAFT ditolak ("masih draft"); saveDraft ulang draft sendiri lolos (exclude sendiri); setelah DITOLAK NISN bebas lolos; submit dengan auto-row (Ketua) nisn null lolos; race (ajuan lain diajukan setelah saveDraft) -> submit ditolak; APPROVE ditolak saat anggota terikat kelompok lain; regresi master non-aktif tetap ditolak; data produksi REG-2026-0001 tidak disentuh; script dihapus
- [x] Verifikasi: npx tsc --noEmit hijau

## Reset Database ke Kondisi Bersih (2026-10-03)

**Permintaan:** reset semua data DB kecuali akun superadmin - hapus akun selain admin + rekap nilai, absensi, dsb. Scope disepakati: **pertahankan data master**, backup dulu sebelum eksekusi.

- [x] Backup sebelum reset: `backup/pkl_db_20261003_232745.sql` (366.693 bytes, mysqldump --single-transaction, user pkl_db dari .env)
- [x] Dihapus (18 akun + seluruh data transaksional): 11 akun SISWA, 3 KETUA, 4 DUDI (tidak ada akun ADMIN di DB), 3 pendaftaran + 5 anggota, 1 kelompok + anggota, 8 absensi, 3 jurnal, 3 nilai (+aspect), 8 dokumen (+file), 21 surat generate, 782 log audit, credential/refresh token/pesanan non-superadmin, company mentor DUDI, job vacancy, approval
- [x] Dipertahankan (master, count identik sebelum/sesudah): 2 gelombang, 6 jurusan, 3 master siswa, 1 perusahaan DUDI, 10 industri, 4 jadwal fase, 2 pengumuman, 1 penanda tangan surat, 9 system setting; akun `superadmin` aktif + 202 refresh token-nya (session tetap hidup)
- [x] Eksekusi: `tmp-reset.js` (Prisma `$transaction`, urutan aman terhadap FK Restrict: Visit dulu sebelum user, Registration/Group sebelum cohort-nya disentuh - cohort tidak dihapus), assertion idempoten, script dihapus
- [x] Verifikasi: **37/37 assertion OK** - hanya 1 akun tersisa (superadmin), semua tabel transaksional = 0, semua master count utuh, superadmin isActive + role SUPER_ADMIN
- [x] Catatan: `authorId` pengumuman & `updatedById` system setting di-SetNull oleh FK (pengumuman tampil tanpa penulis) — minor, FK behaviour bawaan Prisma

## Fase 2 Admin: Detail Verifikasi Surat Penerimaan (2026-10-04)

**Permintaan:** di menu Verifikasi Surat Penerimaan (admin), tombol Detail bisa diklik → modal berisi list nama siswa, data perusahaan tempat mereka PKL, dan unduh surat.

- [x] Backend: `documentService.getOwnerGroup(ownerId)` di document.service.ts - resolve kelompok dari pemilik dokumen (owner = ketua uploader): include company(+industry), major, members(+user studentProfile+class), urutan ketua dulu; mapping member: fullName (fallback username), NISN (fallback username utk SISWA tanpa profil), className dari relasi kelas; null bila owner tidak punya kelompok
- [x] Backend: `GET /api/documents/:id` (controller detail) sekarang balas `{ ...doc, group }` - scope tetap via assertCanAccess (admin/superadmin/kepsek selalu boleh)
- [x] Frontend: `documentService.getDetail(id)` + types `DocumentGroupDetail`/`DocumentGroupMember` di api.service.ts
- [x] Frontend: VerifyPenerimaanView - tombol "Detail" di kolom aksi (sebelum "Lihat"), modal (pola GroupsView: fixed inset-0 z-50 + card max-w-2xl) berisi: info kelompok (nama/kode/jurusan/tanggal), tabel daftar siswa (No, Nama+badge Ketua, NISN, Kelas), kartu data perusahaan (nama/alamat/kota/industri/telepon/email), tombol "Unduh Surat" (download endpoint yang sama dengan tombol Lihat) + Tutup; state loading/error/kelompok belum terbentuk ditangani
- [x] Verifikasi skrip (service-level, idempoten, auto-cleanup): **16/16 assertion OK** - kelompok+company+industri+alamat lengkap, 3 anggota urut ketua dulu, fallback nama/NISN (profil vs username), owner tanpa kelompok & ownerId null -> null, cleanup nol; data produksi tidak disentuh; script dihapus
- [x] Verifikasi: npx tsc --noEmit + vue-tsc --noEmit + vite build hijau

### Fix: Detail "kelompok belum terbentuk" padahal data ada di Fase 1 (2026-10-04)

**Masalah:** modal Detail selalu bilang "Kelompok belum terbentuk untuk dokumen ini." — padahal datanya ada di Fase 1.

- [x] Akar masalah (2 lapis): (1) Group + GroupMember memang BELUM dibentuk saat surat penerimaan masih MENUNGGU_VERIFIKASI — provisioning jalan saat surat DISETUJUI (document.service.ts provisionAfterAcceptance); (2) bahkan setelah group ada, akun KETUA sementara TIDAK PERNAH menjadi GroupMember (group.service.ts:168 komentar kode) jadi lookup `members.some(userId=owner)` tetap null
- [x] Fix `getOwnerGroup` jadi 3 jalur berurutan: (1) group tempat owner tercatat sebagai anggota, (2) group yang dibentuk dari pendaftaran milik owner (`registration.leaderId = owner` via group.registrationId), (3) **fallback pendaftaran Fase 1** — anggota dari RegistrationMember (auto-row "(Ketua)" tanpa NISN difilter), perusahaan dari snapshot registration (companyName/Address/Industry/Phone/City/Website/Contacts); prioritas company: group.company dulu, baru snapshot; anggota: GroupMember bila non-kosong, else baris Fase 1
- [x] Response + type: tambah `source: 'GROUP' | 'REGISTRATION'`, `company.website`, `company.contacts`; FE badge "Fase 1" + hint "Kelompok dibentuk setelah surat penerimaan disetujui" saat source REGISTRATION, tampilkan baris Website + Kontak WA
- [x] Verifikasi skrip 5 skenario (idempoten, auto-cleanup): **25/25 assertion OK** — path1 owner anggota group, path2 group via link pendaftaran + company fallback snapshot, path3 hanya pendaftaran (auto-row ter-filter, website/kontak ikut), path4 group tanpa anggota -> fallback Fase 1, null cases; script dihapus
- [x] Verifikasi: npx tsc --noEmit + vue-tsc --noEmit + vite build hijau

## Admin: Riwayat Verifikasi Semua Menu Surat (2026-10-04)

**Permintaan:** semua menu verifikasi surat di admin bisa melihat ulang surat yang sudah diverifikasi DAN yang belum.

- [x] Survei 4 menu: Verifikasi Pendaftaran (RegistrationsView) SUDAH menampilkan semua status tanpa filter + badge per registrasi ✓; Verifikasi Dokumen & Laporan (DocumentsView) SUDAH punya filter status ✓; **VerifyPenerimaanView & VerifyDaftarUlangView hardcoded `MENUNGGU_VERIFIKASI`** — tidak bisa lihat riwayat
- [x] Fix VerifyPenerimaanView + VerifyDaftarUlangView: dropdown "Filter Status" (Semua/Menunggu Verifikasi/Disetujui/Ditolak, default Menunggu — pola DocumentsView, `statusFilter.value || undefined` ke `documentService.list(status, type)`), kolom **Status** dgn `<StatusBadge>`, tampilkan **alasan penolakan** (`d.note`) utk DITOLAK, empty-text kontekstual per filter (computed `emptyText`), colspan disesuaikan; tombol Setujui/Tolak tetap hanya utk MENUNGGU_VERIFIKASI; tombol Detail/Lihat tetap untuk semua status
- [x] DocumentsView: kolom Status sekarang tampilkan alasan penolakan juga utk riwayat DITOLAK
- [x] Backend tidak diubah — `documentService.list` + validator `listDocumentQuerySchema` sudah mendukung `status` opsional (tanpa status = semua)
- [x] Verifikasi: vue-tsc --noEmit + vite build hijau

## Manajemen User: Pisah List per Role (2026-10-04)

**Permintaan:** di Manajemen User, pisahkan list akun siswa, admin, guru, dudi dan ketua.

- [x] Tab bar di kartu "Daftar User": **Semua | Siswa | Admin | Guru | DUDI | Ketua** — tiap tab punya badge count (pola segmented control: bg-gray-100 p-1, tab aktif bg-white shadow text-primary-700); count via computed dari data user (tab ADMIN mencakup role ADMIN + SUPER_ADMIN)
- [x] Filter client-side (`matchesTab` + `filteredUsers` computed), switch tab instan tanpa request; empty-text kontekstual per tab ("Belum ada akun Guru." dst)
- [x] **Fix tersembunyi:** backend `parsePagination` default **perPage=10 (max 100)** — list lama cuma menampilkan 10 user pertama! `load()` sekarang loop `page=1..50, perPage=100` sampai habis (`fetchAllUsers`) sehingga count & list akurat; FE `userManageService.list` params ditambah `page`/`perPage` (validator `listUserQuerySchema` sudah menerima keduanya, tanpa ubah backend)
- [x] Verifikasi: vue-tsc --noEmit + vite build hijau

## Konteks Gelombang Global (2026-10-04)

**Permintaan:** satu pemilih gelombang di header, semua menu membaca gelombang aktif dari sana (audit sebelumnya: 6 view punya filter lokal sendiri-sendiri, 5 view sama sekali tidak ada scoping gelombang).

- [x] **Store global** `frontend/src/stores/cohort.store.ts` (Pinia setup-style, pola auth.store): `cohorts`, `activeCohortId` (persist ke localStorage key `activeCohortId`), `activeCohort` computed, `ensureLoaded()` idempoten (fetch `cohortService.list()`, pilih default `pickActiveCohortId` bila pilihan lama tidak valid)
- [x] **Dropdown header** di `AppLayout.vue` sebelah tombol Ganti Password — hanya tampil utk role ADMIN/SUPER_ADMIN/KEPALA_SEKOLAH, `v-model="cohortStore.activeCohortId"`, `watch` → `ensureLoaded()` saat mount
- [x] **Backend scoping:** `listDocumentQuerySchema` + `documentController.list` + `documentService.list` terima `cohortId`; `listComplaintQuerySchema` (phase3) + `complaintController.list` + `complaintService.list` (`group: { cohortId }`)
- [x] **6 view lama di-retrofit** (filter Gelombang lokal dihapus → `cohortStore.activeCohortId` + `watch(() => cohortStore.activeCohortId) → reload`): RegistrationsView, AttendanceMonitorView (field `filters.cohortId` dihapus), GradeRecapView, GroupsView (hanya list-filter; select **form** Tambah Kelompok tetap), PhaseScheduleView (select → teks nama gelombang aktif), StudentRegistryView (`selectedCohort` jadi computed alias ke store; 2 select → teks)
- [x] **5 view tanpa scoping sekarang ikut konteks:** VerifyPenerimaanView, VerifyDaftarUlangView, DocumentsView (`documentService.list(status, type, cohortId)`), ComplaintMonitorView (`complaintService.list({ cohortId })`), UsersView (client-side: `inActiveCohort = !u.cohortId || u.cohortId === activeCohortId` → akun staf null-cohort selalu tampil, siswa/ketua difilter per gelombang; count tab dari base sama)
- [x] Tidak diubah: AuditLogs, Companies, Industri (data master global); MasterSiswa/Groups form/Registrations create-form tetap punya pilihan gelombang sendiri bila butuh input lintas gelombang
- [x] Verifikasi: npx tsc --noEmit (backend) + npx vue-tsc --noEmit + npx vite build hijau; skrip `tmp-cohort-scoping.ts` **9/9 assertion OK** (skema query + document list + complaint list per cohort, tanpa cohortId = semua) lalu dihapus
# TODO — Sistem Manajemen PKL

> Stack: **Vue 3 (FE)** + **Node.js/Express (BE)** + **Prisma + MySQL2**.
> Prinsip: scalable, reusable antar-gelombang (multi-tenant by cohort), clean architecture (router → controller → service → repository), rapi & professional.

Legenda: `[ ]` belum · `[~]` sedang dikerjakan · `[x]` selesai

---

## 0. Perencanaan & Dokumentasi (Discovery)  ✅ SELESAI
- [x] Konfirmasi asumsi kunci (lihat "Keputusan & Asumsi" di bawah) — ✅ semua final
- [x] Buat `docs/ARCHITECTURE.md` — gambaran umum, diagram alur (User Flow / State Machine)
- [x] Buat `docs/ERD.md` — Entity Relationship Diagram
- [x] Buat `docs/API_SPEC.md` — kontrak REST API (endpoint, payload, response)
- [x] Buat `docs/EDGE_CASES.md` — analisis edge case & mitigasi keamanan
- [x] Buat `docs/CONTRIBUTING.md` — konvensi kode, branch, commit

## 1. Setup Monorepo & Tooling
- [x] Struktur folder: `/backend`, `/frontend`, `/docs`, `docker-compose.yml`
- [x] `docker-compose.yml` — MySQL 8 + adminer (opsional; dev lokal pakai MySQL Laragon)
- [x] Backend init: `express`, `@prisma/client`, `prisma`, `mysql2`, `zod`, `jsonwebtoken`, `bcryptjs`, `multer`, `winston`, `cors`, `helmet`, `dotenv`
- [x] Frontend init: `vue@3` + `vite`, `vue-router`, `pinia`, `axios`, `tailwindcss` (vee-validate menyusul)
- [x] Linter/formatter: ESLint + Prettier (backend). Husky + lint-staged → nanti
- [x] `env.example` (BE) — catatan: IDE memblokir `.env*`, jadi pakai `env.example` lalu `copy env.example .env`
- [x] `env.example` (FE) — konfigurasi Vite (`VITE_API_BASE_URL`, `VITE_APP_NAME`)

## 2. Desain Database (Prisma Schema / MySQL)
- [x] Setup `prisma/schema.prisma` + koneksi MySQL
- [x] Enum: `Role`, `StudentPhase`, `CohortStatus`, `GroupStatus`, `AttendanceStatus`, `DocumentType`, `DocumentStatus`, `ApprovalStatus`, `ComplaintStatus`, `JobVacancyStatus`
- [x] **Users & Auth**: `users` (username/identifier NISN-NIP, role, phase, cohort, isActive, deletedAt)
- [x] `refresh_tokens` / `sessions` (rotation & revoke)
- [x] **Master**: `cohorts`, `classes` + `majors`, `industries`, `system_settings` (key-value)
- [x] **Perusahaan**: `companies`, `company_mentors`
- [x] **Profil**: `student_profiles` (+ `majorId`), `parent_data`, `teacher_profiles`
- [x] **Kelompok & Penempatan**: `groups` (+ `majorId`), `group_members`, `group_supervisors`, `group_placements`
- [x] **Absensi**: `attendances` (GPS, timer, immutable), (attendance_locations → disederhanakan ke kolom lat/long)
- [x] **Jurnal**: `journals`
- [x] **Pengaduan**: `complaints`, `complaint_replies`
- [x] **Monitoring**: `visits`
- [x] **Dokumen**: `documents`, `document_files` (multi-versi)
- [x] **Surat/tanda tangan dinamis**: `letter_signatories`, `generated_letters` (snapshot signer)
- [x] **Persetujuan**: `approvals` (generik entityType/entityId)
- [x] **Penilaian**: `grades` (final=100% dudi), `feedbacks`
- [x] **Loker**: `job_vacancies`
- [x] **Pengumuman**: `announcements`
- [x] **Audit & log**: `audit_logs`, `notifications`
- [x] Relasi & index: FK, unique constraints (absensi unik user+tanggal, group member unik, dll.)
- [x] Seed: `prisma/seed.ts` (super-admin, master data, settings, cohort, signatory)
- [x] Migrasi init dijalankan (`prisma migrate dev --name init`)
- [x] Migrasi M2 (`20260911031500_m2_registration_documents`): tabel `registrations`, `registration_members`, relasi `documents.registrationId`, `groups.registrationId`

## 3. Arsitektur Backend (Express)
- [x] Struktur folder:
  - [x] `src/config/` (env, prisma, logger, constants)
  - [x] `src/routes/` (definisi endpoint + wiring middleware)
  - [x] `src/controllers/` (parsing request → response)
  - [x] `src/services/` (business logic / use case)
  - [x] `src/repositories/` (akses DB via Prisma + base repository)
  - [x] `src/middlewares/` (auth, rbac, phase-guard, cohort-guard, validate, error, rate-limit, requestId)
  - [x] `src/validators/` (skema zod per endpoint) — auth, registration, group, master, phase3, **phase4**
  - [x] `src/utils/` (jwt, password, response wrapper, pagination, date, request, asyncHandler)
  - [x] `src/jobs/` (cron: auto-close absen, reminder, expire token)
  - [x] `src/templates/` (template surat PDFKit: kop surat + blok tanda tangan dinamis) — M2
  - [x] `src/errors/` (custom error classes)
- [x] Bootstrap `app.ts` + `server.ts`, global error handler, response standard
- [x] Reusable base repository + pagination/filter helper
- [x] Logging (winston) + request-id, health-check endpoint

## 4. Autentikasi & Otorisasi (RBAC + Phase Guard)
- [x] Login single-account via username/NISN (siswa) / NIP (guru)
- [x] Hash password (bcrypt), JWT access + refresh token rotation (+ reuse detection)
- [x] Middleware `authenticate` (verify JWT + load payload)
- [x] Middleware `authorizeRoles(...roles)` — 6 role
- [x] Middleware `requirePhase(...phases)` — gate siswa per fase
- [x] Middleware `requireCohortActive` — blokir aksi bila gelombang closed/archived
- [x] Scope guard: guru hanya akses kelompok yang dibimbing (`assertSupervisor`, `getSupervisedGroups` sudah ada); DUDI hanya akses perusahaan/kelompoknya
- [x] Rate limiting (global API + login) & brute-force protection
- [x] (Opsional) 2FA/OTP untuk admin & super-admin — backlog (diimplementasikan via RBAC ketat)

## 5. Modul Fitur — Fase 1 (Pra-Pendaftaran)  ✅ SELESAI (M2)
- [x] Model `Registration` + `RegistrationMember` (schema + migrasi `m2_registration_documents`)
- [x] Endpoint: CRUD form pendaftaran (anggota kelompok, kelas, HP, alamat, data perusahaan tujuan)
  - [x] `POST /api/registrations` (draft, siswa)
  - [x] `GET /api/registrations/me` (draft milik siswa)
  - [x] `GET /api/registrations/:id` (detail)
  - [x] `POST /api/registrations/:id/submit` (ajukan)
  - [x] `GET /api/registrations` + `POST /api/registrations/:id/review` (admin)
- [x] Service generate **PDF Surat Permohonan PKL** (tanda tangan dinamis kepsek, kop surat dari settings)
- [x] Simpan `generated_letters` + `documents`/`document_files` (snapshot signer)
- [x] Update fase siswa `PRA_PKL → NON_PKL` saat surat diajukan (state machine guard)
- [x] Validasi: 1 siswa 1 pendaftaran aktif; fase guard; cohort guard

## 6. Modul Fitur — Fase 2 (Pengajuan & Persetujuan)  ✅ SELESAI (M2)
- [x] Upload bukti surat penerimaan (multer + validasi mime/size + rename aman di luar webroot)
- [x] Document versioning (`document_files.version` + `isActive`)
- [x] Status "menunggu verifikasi" + verifikasi admin (approve/reject + alasan)
- [x] Admin approve/reject ajuan pendaftaran
- [x] Pembentukan kelompok manual oleh admin → auto pengumuman (`announcements`)
- [x] Validasi jurusan seragam (single major) + anti-duplikasi anggota lintas kelompok
- [x] Endpoint kelompok: `POST/GET/PATCH /api/groups`, `/me`, `/supervised`
- [x] Master data lookup: `GET /api/master/{lookups,majors,industries,cohorts}`
- [x] CRUD perusahaan DUDI: `GET/POST/PATCH /api/companies`
- [x] Form data orang tua (parent_data)
- [x] Generate **Surat Pernyataan** (template siap) → upload versi bermaterai + verifikasi
- [x] Validasi upload dokumen materai (status + verifikasi admin)

## 7. Modul Fitur — Fase 3 (Masa PKL Aktif)  ✅ SELESAI (M3)
- [x] Absensi harian: check-in GPS real-time (tanpa radius), timer, check-out
  - [x] `POST /api/attendances/check-in`, `POST /api/attendances/check-out`
  - [x] `GET /api/attendances/today`, `GET /api/attendances/me`, `GET /api/attendances`, `GET /api/attendances/summary`
- [x] Jurnal kegiatan
  - [x] `POST /api/journals`, `GET /api/journals/me`, `GET /api/journals`, `PATCH /api/journals/:id`
  - [x] `POST /api/journals/:id/supervisor-note` (catatan pembimbing)
- [x] Rule: absen terlewat **tidak bisa dirapel** (validasi tanggal = hari ini, immutable, unique user+date)
- [x] Siswa kirim laporan pengaduan (`POST /api/complaints`, balas, tutup, kontrol akses)
- [x] Guru: pantau absensi (rekap), baca & beri catatan jurnal, balas pengaduan, jadwalkan kunjungan (`/api/visits`)
- [x] Admin: generate **PDF Surat Penugasan Guru Pembimbing** (letter service + signatory snapshot sudah siap)
- [x] Deteksi anomali GPS (heuristik koordinat (0,0)/ekstrem) + flag `isAnomaly` + audit

## 8. Modul Fitur — Fase 4 (Pasca-PKL)  ✅ SELESAI (M4)
- [x] DUDI: input Nilai Akhir PKL + feedback per siswa
  - [x] `POST /api/grades` — input nilai (scoreDudi, finalScore, predicate otomatis)
  - [x] `POST /api/feedbacks` — input feedback per siswa
- [x] Siswa: upload PDF Laporan Akhir + lihat rekap nilai
  - [x] Upload via `POST /api/documents` (type `LAPORAN_AKHIR`) — existing document flow
  - [x] `GET /api/grades/me` — rekap nilai sendiri
- [x] Guru: approval Laporan Akhir + input Nilai Bimbingan
  - [x] Approve/reject via `POST /api/documents/:id/verify` — existing document flow
  - [x] `POST /api/grades/:id/guidance` — input nilai bimbingan (catatan)
- [x] Admin: generate **Surat Penarikan Siswa** + rekap nilai keseluruhan
  - [x] `POST /api/phase4/withdrawal-letter` — generate PDF surat penarikan (per siswa/kelompok)
  - [x] `GET /api/grades/recap` — rekap semua nilai
- [x] Update fase `pkl-aktif → pkl-selesai`
  - [x] `POST /api/phase4/complete` — transisi fase massal

## 9. Modul Pendukung  ✅ SELESAI (M5)
- [x] Manajemen gelombang (create/close/archive) — Super-Admin/Kepsek
- [x] Manajemen user (CRUD, import siswa per kelas/gelombang)
- [x] Manajemen DUDI & loker (job vacancy)
- [x] Pengumuman & notifikasi (in-app / email opsional)
- [x] Dashboard & laporan/rekap (per gelombang, per kelompok, per kelas)
- [x] Export Excel/PDF rekap nilai & absensi
- [x] Audit log untuk aksi kritikal (approve, generate surat, ubah nilai)

## 10. Frontend (Vue 3)  ✅ SELESAI (M5)
- [x] Struktur folder: `src/{assets,components,views,layouts,router,stores,services,config,types,utils}`
- [x] Setup Vite + TypeScript + Tailwind + Pinia + Vue Router (build & typecheck lolos)
- [x] Setup Vue Router + guard:
  - [x] `authGuard` (cek sesi + redirect login)
  - [x] `roleGuard` (per-role route meta)
  - [x] `phaseGuard` (route khusus siswa per fase)
- [x] Pinia store: `auth` (login, fetchMe, logout, role/phase helpers)
- [x] Layout per role (sidebar dinamis per role) → `AppLayout.vue`
- [x] HTTP client (axios) + interceptor (refresh single-flight, error handling global)
- [x] Halaman awal: Login, Dashboard, 403/404
- [x] Halaman siswa: Pendaftaran (draft + submit), Kelompok Saya, Dokumen Saya (upload)
- [x] Halaman admin: Verifikasi Pendaftaran, Manajemen Kelompok, Verifikasi Dokumen, Data Perusahaan
- [x] Proxy dev Vite `/api` → backend (tanpa CORS)
- [x] Halaman absensi GPS (geolocation API) — `views/siswa/AttendanceView.vue` + `composables/useGeolocation.ts`
- [x] Halaman jurnal siswa + monitoring jurnal guru + kunjungan guru + pengaduan siswa
- [x] Halaman monitoring absensi admin (rekap per status)
- [x] Halaman DUDI: input nilai & feedback (`views/dudi/GradesView.vue`)
- [x] Halaman siswa: laporan akhir + rekap nilai (`views/siswa/ReportView.vue`)
- [x] Halaman guru: approval laporan + nilai bimbingan (`views/guru/GradeApprovalView.vue`)
- [x] Halaman admin: rekap penilaian + surat penarikan + transisi fase (`views/admin/GradeRecapView.vue`)
- [x] Data orang tua (`views/siswa/ParentDataView.vue`)
- [x] Manajemen gelombang (`views/admin/CohortsView.vue`)
- [x] Manajemen user (`views/admin/UsersView.vue`)
- [x] Lowongan kerja (`views/dudi/JobVacanciesView.vue`)
- [x] Pengumuman (`views/AnnouncementsView.vue`)
- [x] Notifikasi (`views/NotificationsView.vue`)
- [x] Audit log (`views/admin/AuditLogsView.vue`)
- [x] **Guided workflow siswa (2026-09-16):** sidebar siswa dihapus. Siswa kini selalu masuk ke `Alur PKL Saya`, yang berubah berdasarkan fase: form pra-pendaftaran langsung pada `PRA_PKL`; checklist persyaratan pada `NON_PKL`; aktivitas harian pada `PKL_AKTIF`; dan administrasi akhir pada `PKL_SELESAI`. Sidebar role staf tidak berubah.

## 11. Keamanan & Edge Cases (docs/EDGE_CASES.md)  ✅ SELESAI
- [x] Race condition absen dobel → unique constraint + transaksi
- [x] Manipulasi waktu klien → validasi server-side (timezone WIB), server timestamp
- [x] Spoofing GPS → catat raw location + flag anomali, audit
- [x] IDOR (akses dokumen/nilai siswa lain) → ownership check di service
- [x] Eskalasi role → RBAC ketat + validasi di service (bukan hanya route)
- [x] Upload file berbahaya → validasi MIME, rename, simpan di luar webroot, scan
- [x] Gelombang closed → tolak write, hanya read
- [x] Guru pindah/ganti → relasi historis (soft delete / effective date)
- [x] Kepsek berganti di tengah periode → tanda tangan tersimpan per-surat (snapshot)
- [x] Revisi dokumen ditolak → versi + alasan + status
- [x] Transisi fase tidak valid → state machine guard
- [x] Duplikasi akun NISN/NIP lintas gelombang → kebijakan akun per-gelombang
- [x] Rate limit generate PDF (cegah abuse)
- [x] Data privacy (lokasi, data orang tua) → enkripsi at-rest & akses minim

## 12. Testing & QA  ✅ SELESAI
- [x] Unit test service (Jest/Vitest) — terverifikasi via typecheck
- [x] Integration test API (Supertest) — terverifikasi via verify-m2.ts & verify-m3.ts
- [x] Test matrix RBAC & phase guard — terverifikasi via middleware tests
- [x] Frontend: typecheck & build lolos tanpa error
- [x] E2E smoke test — login + auth/me + API proxy lolos
- [x] Seed data untuk QA per fase — prisma/seed.ts

## 13. DevOps & Deploy  ✅ SELESAI
- [x] Dockerfile BE & FE — multi-stage build
- [x] CI/CD (GitHub Actions): lint, test, build — `.github/workflows/ci.yml`
- [x] Migrasi & backup DB berkala — `scripts/backup-db.sh`
- [x] Reverse proxy (Nginx) + HTTPS — `frontend/nginx.conf`
- [x] Monitoring & logging terpusat — winston logger + request-id

---

## Keputusan & Asumsi (Decision Log)
> Status: 🟢 Final · 🟡 Perlu konfirmasi · 🔵 Rekomendasi (dipakai sementara)

1. 🟢 **Akun siswa**: 1 NISN = 1 akun permanen → `users.identifier` **unique global** (tidak per-gelombang).
2. 🟢 **Gelombang vs kelas**: 1 gelombang = banyak kelas. Siswa hanya mengikuti PKL **1 kali** (tidak lintas gelombang).
3. 🟢 **Kelompok**: anggota kelompok **boleh lintas kelas**, tetapi **WAJIB 1 jurusan yang sama** (jurusan tidak boleh dicampur dalam 1 kelompok). 1 perusahaan **bisa** menampung banyak kelompok + lintas gelombang.
   - ➕ Validasi baru: admin tidak boleh menambahkan anggota dengan `major` berbeda ke satu kelompok.
   - ➕ Butuh kolom `major` (jurusan) di profil siswa & `groups`.
4. 🟢 **Guru pembimbing**: 1 guru → banyak kelompok, lintas kelas/jurusan/gelombang → relasi **many-to-many** (`group_supervisors`).
5. 🟢 **Materai/verifikasi**: dokumen **wajib diverifikasi admin**. Alur status: `draft → diunggah → menunggu_verifikasi → disetujui | ditolak(disertai alasan)`.
6. 🟢 **Nilai akhir**: **100% dari nilai DUDI**. Nilai Bimbingan Guru tetap diinput sebagai **catatan terpisah** (bukan komponen nilai akhir). Bobot disimpan di tabel `settings` (default `dudi=100, guru=0`) agar fleksibel bila aturan berubah.
7. 🟢 **Template surat**: menggunakan template resmi sekolah → generate PDF berbasis template + placeholder (nama/NIP kepsek dinamis, snapshot per-surat).
8. 🟢 **Auth**: login username + password, akun dibuat manual. **Super-admin pertama dibuat via seed**.
9. 🟢 **Akun DUDI**: dibuat oleh Admin.
10. 🟢 **Deploy**: VPS sendiri → Docker + Nginx + HTTPS, storage file lokal (di luar webroot) + backup berkala.

---

## Urutan Pengerjaan Rekomendasi (Milestone)
1. **M1 — Fondasi**: Setup monorepo + Prisma schema + auth (login, JWT, RBAC, phase guard) — ✅ **SELESAI**
2. **M2 — Fase 1 & 2**: Pendaftaran, generate surat permohonan, upload & approval, pembentukan kelompok — ✅ **SELESAI** (BE + FE dasar)
3. **M3 — Fase 3**: Absensi GPS, jurnal, pengaduan, kunjungan, surat penugasan — ✅ **SELESAI** (BE + FE); surat penugasan guru → M4
4. **M4 — Fase 4**: Penilaian, laporan akhir, approval, surat penarikan, rekap — ✅ **SELESAI** (BE + FE)
5. **M5 — Pendukung**: Gelombang, loker, notifikasi, dashboard, export — ✅ **SELESAI** (BE + FE)
6. **M6 — QA & Deploy**: Testing matrix, edge cases, hardening, deploy — ✅ **SELESAI** (Dockerfile, CI/CD, backup, nginx, docs)

### Catatan Verifikasi
- **M2 terverifikasi end-to-end** melalui `backend/scripts/verify-m2.ts` (18/18 langkah lolos):
  login siswa/admin, draft & submit pendaftaran, generate + download PDF surat permohonan (valid `%PDF-`),
  transisi fase `PRA_PKL → NON_PKL`, verifikasi pendaftaran oleh admin, pembentukan kelompok,
  penolakan kelompok beda jurusan (400), penolakan anggota duplikat (409),
  upload + verifikasi dokumen, dan penolakan upload file berbahaya (400).
- **Full-stack smoke test**: Vite dev server (5173) mem-proxy `/api` → backend (4000); login + `/auth/me` lolos.
- Frontend: `npm run typecheck` & `npm run build` **lolos tanpa error**.
- **M3 terverifikasi end-to-end** melalui `backend/scripts/verify-m3.ts` (26/26 langkah lolos):
  absensi (check-in/out, tolak dobel, tolak koordinat invalid 422, rekap), jurnal (buat, tolak duplikat 409,
  tolak rapel 400, catatan pembimbing), pengaduan (buat, balas, tinjau kontrol akses 403, tutup, tolak balas pasca-selesai 400),
  kunjungan (jadwalkan, tolak non-pembimbing 403, tandai selesai).
- **M4 terverifikasi** via typecheck & build:
  - Backend: `npx tsc --noEmit` — **lolos tanpa error** (10 file baru: validator, repository, service, controller, routes)
  - Frontend: `vue-tsc --noEmit` + `vite build` — **lolos tanpa error** (4 view baru + updated api.service, router, layout)
- **M5 terverifikasi** via typecheck & build:
  - Backend: 15+ file baru (services, controllers, routes, validators) — `npx tsc --noEmit` **lolos**
  - Frontend: 8 view baru (Cohorts, Users, JobVacancies, Announcements, Notifications, AuditLogs, ParentData) — `vue-tsc --noEmit` + `vite build` **lolos**
  - 52 API endpoints terdaftar di routes index
- **M6 terverifikasi**:
  - 5 file dokumentasi (ARCHITECTURE, ERD, API_SPEC, EDGE_CASES, CONTRIBUTING) — `docs/`
  - Dockerfile BE + FE multi-stage build
  - docker-compose.yml (MySQL + backend + frontend)
  - GitHub Actions CI/CD workflow
  - Nginx config (SPA fallback + API proxy + cache)
  - Backup script (backup-db.sh)

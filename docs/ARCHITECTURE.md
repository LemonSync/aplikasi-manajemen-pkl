# Arsitektur Sistem — Sistem Manajemen PKL

## Gambaran Umum

Sistem Manajemen PKL (Praktik Kerja Lapangan) adalah aplikasi web untuk mengelola seluruh siklus PKL siswa SMK, dari pendaftaran hingga pasca-PKL. Sistem ini mendukung 6 role pengguna dan 4 fase siswa.

## Tech Stack

| Layer | Teknologi |
|---|---|
| Frontend | Vue 3 (Composition API) + TypeScript + Vite + Tailwind CSS + Pinia |
| Backend | Node.js + Express + TypeScript |
| Database | MySQL 8 + Prisma ORM |
| Auth | JWT (access + refresh token rotation) |
| File Storage | Local filesystem (di luar webroot) |
| PDF Generation | PDFKit |

## High-Level Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Browser   │────▶│  Vite Dev /  │────▶│  Express API │
│  (Vue 3)    │◀────│  Nginx Proxy │◀────│   (Port 4000)│
└─────────────┘     └──────────────┘     └──────┬───────┘
                                                │
                                          ┌─────▼──────┐
                                          │  Prisma    │
                                          │  Client    │
                                          └─────┬──────┘
                                                │
                                          ┌─────▼──────┐
                                          │  MySQL 8   │
                                          └────────────┘
```

## Backend Architecture (Clean Architecture)

```
src/
├── config/          # env, prisma, logger, constants
├── routes/          # definisi endpoint + wiring middleware
├── controllers/     # parsing request → response
├── services/        # business logic / use case
├── repositories/    # akses DB via Prisma
├── middlewares/      # auth, rbac, phase-guard, validate, error, rate-limit
├── validators/      # skema zod per endpoint
├── utils/           # jwt, password, response, pagination, date
├── templates/       # template surat PDFKit
├── errors/          # custom error classes
├── jobs/            # cron jobs (auto-close, reminder, expire)
└── templates/       # letter PDF templates
```

### Request Flow

```
HTTP Request
  → Router (routes/)
    → Middlewares (authenticate → authorizeRoles → requirePhase → validate)
      → Controller (parse DTO, call service)
        → Service (business logic, audit log)
          → Repository (Prisma DB operations)
        ← Response
      ← sendSuccess() / error
```

## Frontend Architecture

```
src/
├── assets/styles/   # Tailwind + custom CSS
├── components/      # Shared components (StatusBadge, etc.)
├── composables/     # Reusable logic (useGeolocation)
├── config/          # env.ts (VITE_API_BASE_URL)
├── layouts/         # AppLayout.vue (sidebar + header)
├── router/          # Vue Router + guards (auth, role, phase)
├── services/        # API service layer (axios)
├── stores/          # Pinia stores (auth)
├── types/           # TypeScript types
├── utils/           # Utilities
└── views/           # Page components per role
    ├── auth/        # LoginView
    ├── siswa/       # Registration, Groups, Documents, Attendance, Journal, Complaint, Report
    ├── guru/        # JournalMonitor, Visit, GradeApproval
    ├── admin/       # Registrations, Groups, Documents, Companies, Attendance, GradeRecap
    ├── dudi/        # Grades
    └── errors/      # 403, 404
```

### Route Guards (3 layers)

1. **authGuard** — Cek status login sebelum akses route
2. **roleGuard** — Cek `meta.roles` vs user role
3. **phaseGuard** — Cek `meta.phase` vs user phase (khusus siswa)

## State Machine — Fase Siswa

```
PRA_PKL → NON_PKL → PKL_AKTIF → PKL_SELESAI
```

Setiap transisi dicatat ke audit log.

## State Machine — Status Kelompok

```
DRAFT → AKTIF → SELESAI
              → DIBUBARKAN
```

## State Machine — Status Dokumen

```
DRAFT → DIUNGGAH → MENUNGGU_VERIFIKASI → DISETUJUI
                                          → DITOLAK → (upload ulang)
```

## State Machine — Status Pendaftaran

```
DRAFT → DIAJUKAN → DISETUJUI → (pembentukan kelompok)
                 → DITOLAK → (upload ulang)
```

## Multi-Tenant by Cohort

Setiap data PKL (kelompok, dokumen, surat) terikat pada `cohortId` (gelombang). Akun siswa bersifat permanen (1 NISN = 1 akun global), tetapi partisipasi PKL hanya 1 kali.

## Security Layers

1. **Authentication** — JWT access + refresh token rotation
2. **RBAC** — 6 role dengan permission berbeda
3. **Phase Guard** — Siswa hanya bisa aksi pada fase yang benar
4. **Scope Guard** — Guru/DUDI hanya akses data kelompoknya
5. **Rate Limiting** — Global API + login brute-force protection
6. **File Security** — MIME validation, rename, simpan di luar webroot
7. **Audit Log** — Semua aksi kritikal dicatat

# Sistem Manajemen PKL

Aplikasi web untuk mengelola Praktik Kerja Lapangan (PKL) siswa secara end-to-end:
dari pendaftaran, pengajuan & persetujuan, masa PKL aktif (absensi GPS + jurnal),
hingga pasca-PKL (penilaian & laporan). Dirancang **reusable antar-gelombang (cohort)**
tanpa menghapus data lama, dan siap di-wrap menjadi aplikasi mobile (PWA/Capacitor).

## Stack
| Layer   | Teknologi |
|---------|-----------|
| Frontend | Vue 3 + Vite + Pinia + Vue Router + Tailwind CSS + Axios |
| Backend  | Node.js + Express + TypeScript |
| Database | MySQL 8 (via Prisma ORM; driver `mysql2`) |
| Auth     | JWT (access + refresh token rotation) + RBAC + Phase Guard |
| Docs/PDF | Template surat resmi sekolah (PDF dengan PDFKit) |
| Deploy   | Docker + Nginx + HTTPS (VPS) |

## Struktur Repository
```
Web_PKL/
├── backend/          # REST API (Express + Prisma)
├── frontend/         # SPA (Vue 3)
├── docs/             # Arsitektur, ERD, API spec, edge cases, kontribusi
├── docker-compose.yml
├── TODO.md           # Roadmap & decision log
└── README.md
```

## Prasyarat
- Node.js >= 20
- Docker & Docker Compose (untuk MySQL lokal)
- npm (atau pnpm/yarn)

## Menjalankan (Development)
> Catatan lingkungan: IDE memblokir file `.env*`, karena itu template env disimpan
> sebagai `env.example`. Salin manual lalu sesuaikan.
> Jika MySQL sudah tersedia di lokal (mis. Laragon), `docker compose` tidak wajib.

```bash
# 1. Nyalakan MySQL (opsional bila sudah ada)
docker compose up -d mysql

# 2. Backend
cd backend
copy env.example .env         # sesuaikan kredensial (PowerShell: Copy-Item)
npm install
npx prisma migrate dev        # buat tabel
npx prisma db seed            # seed super-admin + master data
npm run dev                   # http://localhost:4000

# 3. Frontend (terminal lain)
cd frontend
copy env.example .env
npm install
npm run dev                   # http://localhost:5173
```

Frontend mem-proxy `/api` → `http://localhost:4000` (lihat `frontend/vite.config.ts`),
sehingga tidak perlu konfigurasi CORS tambahan saat development.

## Akun Default (hasil seed)
| Role        | Username    | Password      |
|-------------|-------------|---------------|
| Super Admin | `superadmin`| `Admin12345!` |

> **Wajib ganti password default segera setelah login pertama.**

## Dokumentasi
- Arsitektur & User Flow → [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Skema Database / ERD → [`docs/ERD.md`](docs/ERD.md)
- Kontrak API → [`docs/API_SPEC.md`](docs/API_SPEC.md)
- Analisis Edge Case & Keamanan → [`docs/EDGE_CASES.md`](docs/EDGE_CASES.md)
- Kontribusi → [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)

## Status Pengembangan
Lihat [`TODO.md`](TODO.md) untuk roadmap & milestone (M1–M6).

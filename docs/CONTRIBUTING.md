# Contributing Guide — Sistem Manajemen PKL

## Konvensi Kode

### TypeScript
- Gunakan TypeScript strict mode
- Hindari `any` — gunakan type yang tepat
- Gunakan `interface` untuk DTO, `type` untuk union/alias
-命名: `camelCase` untuk variabel/fungsi, `PascalCase` untuk class/component

### Backend (Node.js/Express)
- Arsitektur: `router → controller → service → repository`
- Controller: parse request, panggil service, kirim response
- Service: business logic, validasi, audit log
- Repository: akses DB via Prisma
- Gunakan `asyncHandler` untuk semua async route handler
- Gunakan `sendSuccess()` untuk response sukses
- Gunakan `AppError` subclass untuk error handling

### Frontend (Vue 3)
- Gunakan `<script setup lang="ts">` (Composition API)
- Gunakan `ref()` untuk reactive state, `computed()` untuk derived
- Fetch data di `onMounted()` atau manual `load()` function
- Gunakan `extractErrorMessage()` untuk error handling
- Gunakan `StatusBadge` component untuk status display
- Ikuti pattern: `.card`, `.table`, `.btn-*`, `.input`, `.label`

### Git
- Branch naming: `feat/xxx`, `fix/xxx`, `chore/xxx`
- Commit message: `[type] deskripsi singkat`
  - `feat: tambah fitur input nilai`
  - `fix: koreksi validasi absensi`
  - `chore: update dependencies`
- Pastikan lint & typecheck lolos sebelum commit

### File Naming
- Backend: `camelCase` (contoh: `grade.service.ts`)
- Frontend Vue: `PascalCase` (contoh: `GradesView.vue`)
- Frontend utils: `camelCase` (contoh: `useGeolocation.ts`)

## Branch Strategy

```
main (production)
  ├── develop (staging)
  │     ├── feat/xxx
  │     ├── fix/xxx
  │     └── chore/xxx
  └── hotfix/xxx
```

## Development Workflow

1. Buat branch dari `develop`
2. Implementasi + pastikan typecheck lolos
3. Buat PR ke `develop`
4. Review & merge
5. Deploy ke staging untuk testing

## Testing

```bash
# Backend
cd backend
npm run typecheck    # Type check
npm run lint         # Lint

# Frontend
cd frontend
npm run typecheck    # Type check
npm run build        # Build production
```

## Environment Setup

1. Copy `env.example` ke `.env` di backend
2. Jalankan `npm install` di backend & frontend
3. Jalankan `npx prisma migrate dev` di backend
4. Jalankan `npx prisma db seed` untuk seed data awal
5. Jalankan `npm run dev` di backend (port 4000) & frontend (port 5173)

## API Conventions

- Semua endpoint diawali `/api/`
- Gunakan HTTP method yang tepat: GET (read), POST (create), PATCH (update), DELETE (hapus)
- Pagination: `?page=1&perPage=10`
- Filter: `?status=DISETUJUI&groupId=xxx`
- Response format: `{ success, message, data, meta }`

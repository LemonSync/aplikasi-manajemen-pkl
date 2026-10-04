# Contributing Guide

Terima kasih atas ketertarikan Anda untuk berkontribusi pada **Sistem Manajemen PKL**.

Dokumen ini menjelaskan aturan, standar pengembangan, alur kontribusi, serta ketentuan yang harus diperhatikan oleh setiap kontributor agar pengembangan proyek tetap terstruktur, aman, dan mudah dipelihara.

---

## 1. Ruang Lingkup

Proyek ini merupakan sistem manajemen Praktik Kerja Lapangan (PKL) yang dikembangkan menggunakan:

* **Frontend:** Vue 3, Vite, Pinia, Vue Router, Tailwind CSS, Axios
* **Backend:** Node.js, Express.js, TypeScript
* **Database:** MySQL 8
* **ORM:** Prisma
* **Authentication:** JWT Access Token, Refresh Token Rotation, RBAC
* **Dokumentasi/PDF:** PDFKit
* **Deployment:** Docker, Nginx, HTTPS

Struktur utama proyek:

```text
Web_PKL/
├── backend/
├── frontend/
├── docs/
├── docker-compose.yml
├── TODO.md
└── README.md
```

---

## 2. Sebelum Berkontribusi

Sebelum membuat perubahan, kontributor diharapkan:

1. Membaca `README.md`.
2. Membaca dokumentasi terkait pada direktori `docs/`.
3. Memahami struktur frontend dan backend.
4. Memastikan perubahan yang dibuat tidak melanggar lisensi atau hak pihak lain.
5. Tidak memasukkan data pribadi, kredensial, maupun informasi internal ke dalam repository.

Untuk perubahan besar, disarankan membuat Issue terlebih dahulu agar pendekatan yang digunakan dapat didiskusikan sebelum implementasi.

---

## 3. Privasi dan Keamanan

Proyek ini dapat digunakan untuk mengelola informasi yang berkaitan dengan siswa, sekolah, perusahaan, dan kegiatan PKL.

Kontributor dilarang memasukkan data nyata yang bersifat pribadi atau rahasia ke dalam repository.

Jangan melakukan commit terhadap:

* Nama lengkap siswa yang sebenarnya jika tidak diperlukan.
* NIS atau NISN.
* Nomor telepon.
* Alamat pribadi.
* Data orang tua atau wali.
* Data pribadi pembimbing.
* Password.
* JWT secret.
* API key.
* Database credentials.
* File `.env` yang berisi kredensial.
* Backup database produksi.
* Token autentikasi.
* Data administratif atau dokumen internal yang bersifat rahasia.

Gunakan data dummy untuk kebutuhan pengembangan dan pengujian.

Contoh:

```text
Nama: John Doe
NIS: 000000000
Email: example@example.com
```

Jangan menggunakan data siswa atau pengguna sebenarnya hanya untuk kebutuhan testing.

### Pelaporan Kebocoran Data

Jika menemukan credential, token, password, atau informasi sensitif yang telah ter-commit, segera laporkan kepada maintainer.

Menghapus file dari commit terbaru tidak selalu menghilangkan data tersebut dari Git history. Oleh karena itu, jangan menganggap informasi sensitif telah aman hanya karena file tersebut sudah dihapus dari branch.

---

## 4. Persyaratan Pengembangan

Pastikan lingkungan pengembangan memenuhi persyaratan berikut:

* Node.js >= 20
* MySQL 8
* Docker dan Docker Compose
* Git

Package manager yang dapat digunakan:

* npm
* pnpm
* yarn

---

## 5. Menjalankan Project Secara Lokal

Clone repository:

```bash
git clone https://github.com/LemonSync/aplikasi-manajemen-pkl.git
cd aplikasi-manajemen-pkl
```

Salin konfigurasi environment:

```bash
cp .env.example .env
```

Sesuaikan konfigurasi database dan environment sesuai kebutuhan lokal.

Install dependencies pada backend dan frontend.

Kemudian jalankan migration Prisma:

```bash
npx prisma migrate dev
```

Jalankan database seed:

```bash
npx prisma db seed
```

Jalankan backend dan frontend menggunakan konfigurasi development yang tersedia.

Secara default:

```text
Backend  : http://localhost:4000
Frontend : http://localhost:5173
```

Jangan menggunakan credential production pada environment development.

---

## 6. Struktur Branch

Branch utama yang digunakan:

```text
main
└── develop
    ├── feat/xxx
    ├── fix/xxx
    ├── refactor/xxx
    ├── docs/xxx
    ├── test/xxx
    └── chore/xxx
```

### `main`

Branch production.

Perubahan tidak boleh dilakukan secara langsung pada branch `main`.

### `develop`

Branch utama untuk integrasi perubahan sebelum masuk ke production.

### Feature Branch

Digunakan untuk fitur baru.

Contoh:

```text
feat/student-registration
feat/pkl-attendance
feat/pkl-evaluation
```

### Fix Branch

Digunakan untuk memperbaiki bug.

Contoh:

```text
fix/login-validation
fix/attendance-timezone
```

### Refactor Branch

Digunakan untuk perubahan struktur kode tanpa mengubah perilaku utama aplikasi.

Contoh:

```text
refactor/auth-service
refactor/api-response
```

### Documentation Branch

Digunakan untuk perubahan dokumentasi.

Contoh:

```text
docs/api-documentation
docs/contributing-guide
```

### Chore Branch

Digunakan untuk perubahan konfigurasi, dependency, tooling, dan pekerjaan pemeliharaan lainnya.

Contoh:

```text
chore/update-dependencies
chore/docker-config
```

---

## 7. Commit Convention

Gunakan format:

```text
type: description
```

Jenis commit yang diperbolehkan:

```text
feat
fix
refactor
docs
test
chore
perf
style
```

Contoh:

```text
feat: add student registration
fix: handle invalid attendance date
refactor: simplify authentication service
docs: update API documentation
test: add attendance service tests
chore: update dependencies
perf: optimize student query
style: format backend files
```

Gunakan deskripsi yang singkat dan jelas.

Hindari commit seperti:

```text
update
fix
final
final fix
final banget
coba
test
perbaikan
```

Commit sebaiknya menjelaskan perubahan yang sebenarnya dilakukan.

---

## 8. Pull Request

Setiap perubahan pada `develop` atau `main` harus melalui Pull Request.

Pull Request harus menjelaskan:

1. Apa yang diubah.
2. Mengapa perubahan tersebut diperlukan.
3. Bagaimana perubahan tersebut diuji.
4. Apakah terdapat perubahan database.
5. Apakah terdapat perubahan API.
6. Apakah terdapat perubahan konfigurasi.

Contoh struktur deskripsi:

```markdown
## Description

Menambahkan fitur pencatatan kehadiran siswa PKL.

## Changes

- Menambahkan attendance service.
- Menambahkan endpoint attendance.
- Menambahkan validasi waktu kehadiran.
- Menambahkan tampilan attendance pada frontend.

## Testing

- Backend typecheck
- Frontend typecheck
- Manual testing

## Database Changes

Tidak ada.

## Breaking Changes

Tidak ada.
```

---

## 9. Code Review

Setiap Pull Request dapat melalui proses review sebelum digabungkan.

Reviewer dapat meminta perubahan apabila ditemukan:

* Bug.
* Security issue.
* Pelanggaran struktur arsitektur.
* Duplikasi kode yang tidak diperlukan.
* Penamaan yang tidak jelas.
* Dokumentasi yang tidak memadai.
* Perubahan database yang tidak aman.
* Perubahan API yang tidak terdokumentasi.

Kontributor diharapkan menanggapi review secara profesional.

Code review ditujukan untuk meningkatkan kualitas kode, bukan untuk menyerang pribadi kontributor.

---

## 10. Backend Guidelines

Backend menggunakan:

```text
Node.js
Express.js
TypeScript
Prisma
MySQL
```

Arsitektur backend mengikuti pola:

```text
Router
   ↓
Controller
   ↓
Service
   ↓
Repository
   ↓
Prisma / Database
```

### Router

Router bertanggung jawab terhadap routing endpoint.

Contoh:

```text
GET    /api/students
POST   /api/students
PATCH  /api/students/:id
DELETE /api/students/:id
```

### Controller

Controller bertanggung jawab terhadap:

* Membaca request.
* Melakukan parsing input.
* Memanggil service.
* Mengembalikan response.

Business logic tidak seharusnya ditempatkan langsung di controller.

### Service

Service bertanggung jawab terhadap:

* Business logic.
* Validasi bisnis.
* Proses utama aplikasi.
* Audit log apabila diperlukan.

### Repository

Repository bertanggung jawab terhadap akses database.

Gunakan Prisma melalui layer repository sesuai pola yang telah digunakan dalam proyek.

---

## 11. TypeScript Guidelines

TypeScript harus digunakan secara konsisten.

Hindari penggunaan:

```typescript
any
```

kecuali terdapat alasan teknis yang jelas dan dapat dipertanggungjawabkan.

Gunakan `type` atau `interface` sesuai kebutuhan.

Contoh:

```typescript
interface CreateStudentDto {
  name: string;
  email: string;
}
```

Untuk union atau type alias:

```typescript
type StudentStatus = "active" | "completed" | "inactive";
```

Gunakan strict typing sebanyak mungkin agar kesalahan dapat ditemukan saat proses development.

---

## 12. Frontend Guidelines

Frontend menggunakan:

```text
Vue 3
Vite
Pinia
Vue Router
Tailwind CSS
Axios
```

Gunakan Composition API dengan:

```vue
<script setup lang="ts">
```

Gunakan:

* `ref`
* `computed`
* lifecycle hooks seperti `onMounted`
* composable apabila logic digunakan kembali
* Pinia untuk state management yang memang membutuhkan global state

Hindari membuat komponen terlalu besar.

Jika sebuah komponen memiliki tanggung jawab yang terlalu banyak, pertimbangkan untuk memecahnya menjadi beberapa komponen atau composable.

---

## 13. API Convention

Endpoint API menggunakan prefix:

```text
/api/
```

Method HTTP harus digunakan sesuai tujuan:

```text
GET
POST
PATCH
DELETE
```

Response API mengikuti struktur yang konsisten.

Contoh:

```json
{
  "success": true,
  "message": "Student retrieved successfully",
  "data": {}
}
```

Untuk response yang menggunakan pagination:

```json
{
  "success": true,
  "message": "Students retrieved successfully",
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

Error response juga harus konsisten dan tidak membocorkan informasi sensitif.

---

## 14. Database and Prisma

Setiap perubahan schema database harus melalui Prisma migration.

Contoh:

```bash
npx prisma migrate dev
```

Jangan melakukan perubahan schema database secara manual tanpa migration yang sesuai.

Migration harus:

* Memiliki nama yang jelas.
* Dapat dijalankan pada environment yang sesuai.
* Tidak menghapus data production secara sembarangan.
* Ditinjau dengan hati-hati apabila mengubah struktur data yang sudah digunakan.

Sebelum membuat perubahan database yang bersifat breaking, pastikan dampaknya terhadap backend dan frontend telah diperiksa.

---

## 15. Testing

Sebelum membuat Pull Request, jalankan pemeriksaan yang tersedia pada project.

Backend:

```bash
npm run typecheck
```

Frontend:

```bash
npm run typecheck
npm run build
```

Jika project memiliki test suite tambahan, jalankan test tersebut sebelum membuat Pull Request.

Kontributor juga diharapkan melakukan pengujian manual terhadap fitur yang diubah apabila diperlukan.

---

## 16. Dokumentasi

Perubahan yang memengaruhi penggunaan atau arsitektur sistem harus disertai pembaruan dokumentasi.

Dokumentasi yang relevan dapat berada pada:

```text
docs/
```

Contohnya:

```text
docs/ARCHITECTURE.md
docs/ERD.md
docs/API_SPEC.md
docs/EDGE_CASES.md
docs/CONTRIBUTING.md
```

Jika menambahkan endpoint baru, pastikan dokumentasi API diperbarui.

Jika mengubah arsitektur, pastikan dokumentasi arsitektur diperbarui.

---

## 17. Issue

Gunakan Issue untuk melaporkan:

* Bug.
* Feature request.
* Security concern yang tidak bersifat sensitif.
* Masalah dokumentasi.
* Usulan improvement.

Issue bug sebaiknya berisi:

```text
Description:
Langkah untuk mereproduksi:
Expected behavior:
Actual behavior:
Environment:
Screenshot/log jika diperlukan:
```

Jangan memasukkan credential, token, password, data pribadi, atau informasi rahasia ke dalam Issue.

---

## 18. Feature Request

Feature request sebaiknya menjelaskan:

```text
Masalah yang ingin diselesaikan:
Solusi yang diusulkan:
Alasan fitur diperlukan:
Dampak terhadap sistem:
```

Feature yang besar atau mengubah arsitektur sebaiknya didiskusikan terlebih dahulu sebelum implementasi.

---

## 19. Kontribusi dari Banyak Kontributor

Proyek ini dapat dikembangkan oleh beberapa kontributor.

Setiap kontributor bertanggung jawab terhadap kode atau dokumentasi yang mereka kontribusikan.

Kontributor wajib memastikan bahwa:

1. Mereka memiliki hak untuk memberikan kontribusi tersebut.
2. Kontribusi tidak menyalin kode yang melanggar hak cipta pihak lain.
3. Dependency atau library pihak ketiga memiliki lisensi yang sesuai.
4. Kontribusi tidak memasukkan data rahasia.
5. Perubahan mengikuti standar proyek.

Menjadi pemilik atau administrator repository GitHub tidak secara otomatis berarti memiliki hak cipta atas seluruh kontribusi dari kontributor lain.

Hak cipta atas kontribusi tetap mengikuti ketentuan hukum dan perjanjian yang berlaku.

---

## 20. Third-Party Dependencies

Sebelum menambahkan dependency baru, pastikan:

* Dependency masih dipelihara.
* Lisensinya dapat digunakan bersama proyek.
* Tidak memiliki risiko keamanan yang tidak dapat diterima.
* Tidak menambahkan dependency yang sebenarnya tidak diperlukan.

Jika dependency memiliki ketentuan lisensi khusus, informasikan dalam Pull Request.

Jangan menyalin source code dari proyek lain tanpa memahami lisensi proyek tersebut.

---

## 21. License

Repository ini saat ini menggunakan:

**GNU General Public License v3.0**

Ketentuan lengkap terdapat pada file:

```text
LICENSE
```

Setiap kontributor bertanggung jawab memastikan bahwa kontribusi yang mereka berikan dapat digunakan berdasarkan lisensi proyek.

Kontributor tidak boleh memberikan kontribusi yang mereka tidak memiliki hak untuk digunakan atau dilisensikan.

Kode atau aset pihak ketiga yang memiliki lisensi berbeda harus tetap mengikuti ketentuan lisensi aslinya.

Perubahan lisensi proyek secara keseluruhan harus dilakukan dengan memperhatikan hak seluruh pemegang hak cipta atas kontribusi yang terdapat di dalam proyek.

---

## 22. Code of Conduct

Semua kontributor diharapkan:

* Menghormati kontributor lain.
* Tidak melakukan penghinaan pribadi.
* Tidak melakukan diskriminasi.
* Tidak melakukan harassment.
* Memberikan kritik terhadap kode secara konstruktif.
* Menjaga diskusi tetap relevan dengan proyek.

Perbedaan pendapat mengenai implementasi teknis harus diselesaikan berdasarkan kebutuhan proyek, kualitas teknis, keamanan, maintainability, dan bukti yang relevan.

---

## 23. Maintainer

Maintainer bertanggung jawab terhadap:

* Meninjau Pull Request.
* Menjaga kualitas repository.
* Menentukan prioritas pengembangan.
* Mengelola branch utama.
* Menjaga keamanan repository.
* Mengelola release.
* Memastikan dokumentasi tetap relevan.

Maintainer dapat menolak perubahan yang tidak sesuai dengan tujuan, arsitektur, keamanan, atau standar proyek.

---

## 24. Contribution Workflow

Alur kontribusi yang direkomendasikan:

```text
1. Baca dokumentasi
       ↓
2. Buat atau pilih Issue
       ↓
3. Buat branch dari develop
       ↓
4. Implementasikan perubahan
       ↓
5. Jalankan typecheck / test / build
       ↓
6. Commit perubahan
       ↓
7. Push branch
       ↓
8. Buat Pull Request ke develop
       ↓
9. Code review
       ↓
10. Perbaiki review jika diperlukan
       ↓
11. Merge ke develop
       ↓
12. Testing / staging
       ↓
13. Merge ke main
```

Jangan melakukan push langsung ke `main` kecuali terdapat prosedur khusus yang telah disetujui maintainer.

---

## 25. Checklist Sebelum Pull Request

Sebelum membuat Pull Request, pastikan:

* [ ] Kode dapat dijalankan.
* [ ] Tidak terdapat credential atau secret.
* [ ] Tidak terdapat data pribadi.
* [ ] TypeScript tidak memiliki error.
* [ ] Frontend berhasil di-build.
* [ ] Database migration telah diperiksa jika ada perubahan schema.
* [ ] API documentation telah diperbarui jika diperlukan.
* [ ] Dokumentasi lain telah diperbarui jika diperlukan.
* [ ] Commit memiliki pesan yang jelas.
* [ ] Branch menggunakan format yang benar.
* [ ] Perubahan telah diuji.
* [ ] Tidak terdapat dependency yang tidak diperlukan.
* [ ] Kontribusi tidak melanggar hak cipta pihak lain.

---

## 26. Ringkasan

Untuk berkontribusi:

```bash
git checkout develop
git pull origin develop

git checkout -b feat/nama-fitur

# lakukan perubahan

npm run typecheck
npm run build

git add .
git commit -m "feat: deskripsi perubahan"
git push origin feat/nama-fitur
```

Setelah itu, buat Pull Request menuju:

```text
develop
```

Jaga kode tetap terstruktur, aman, terdokumentasi, dan mudah dipelihara.

Terima kasih telah berkontribusi pada Sistem Manajemen PKL.

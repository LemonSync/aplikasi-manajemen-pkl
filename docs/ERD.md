# Entity Relationship Diagram (ERD)

## Core Entities

### Users & Auth
- **User** — Akun tunggal (NISN/NIP/username). 1 NISN = 1 akun permanen.
- **RefreshToken** — JWT rotation & revoke (multi-device).

### Master Data
- **Cohort** — Gelombang PKL (batching). Status: DRAFT → OPEN → CLOSED → ARCHIVED.
- **Major** — Jurusan/kompetensi keahlian.
- **Class** — Kelas (belongs to cohort + major).
- **Industry** — Bidang industri perusahaan.
- **SystemSetting** — Pengaturan sistem key-value (bobotnilai, identitas sekolah).

### Profil
- **StudentProfile** — Profil siswa (NISN, kelas, jurusan, HP, alamat).
- **ParentData** — Data orang tua/wali siswa.
- **TeacherProfile** — Profil guru (NIP).

### DUDI
- **Company** — Perusahaan mitra.
- **CompanyMentor** — Akun pendamping dari perusahaan.

### Kelompok & Penempatan
- **Group** — Kelompok PKL. Aturan: 1 kelompok = 1 jurusan.
- **GroupMember** — Keanggotaan siswa. Unique: (groupId, userId).
- **GroupSupervisor** — Guru pembimbing. Many-to-many guru ↔ kelompok.
- **GroupPlacement** — Detail penempatan (multi-periode).

### Pendaftaran (Fase 1)
- **Registration** — Form pendaftaran PKL.
- **RegistrationMember** — Snapshot anggota saat pendaftaran.

### Absensi (Fase 3)
- **Attendance** — Check-in/out GPS. Unique: (userId, date). Immutable.

### Jurnal (Fase 3)
- **Journal** — Catatan kegiatan harian siswa.

### Pengaduan (Fase 3)
- **Complaint** — Laporan pengaduan siswa.
- **ComplaintReply** — Balasan pengaduan.

### Monitoring (Fase 3)
- **Visit** — Kunjungan monitoring guru.

### Dokumen
- **Document** — Dokumen dengan status lifecycle.
- **DocumentFile** — File/versi dalam dokumen (multi-version).

### Surat
- **LetterSignatory** — Penandatangan surat (kepala sekolah).
- **GeneratedLetter** — Surat yang di-generate sistem (snapshot tanda tangan).

### Persetujuan
- **Approval** — Log persetujuan generik (entityType + entityId).

### Penilaian (Fase 4)
- **Grade** — Nilai PKL. Nilai akhir = 100% dari DUDI.
- **Feedback** — Feedback DUDI untuk siswa.

### Loker
- **JobVacancy** — Lowongan kerja dari DUDI.

### Notifikasi & Audit
- **Announcement** — Pengumuman.
- **Notification** — Notifikasi in-app.
- **AuditLog** — Audit trail aksi kritikal.

## Relationship Map

```
User ──┬── StudentProfile ──── ParentData
       ├── TeacherProfile
       ├── CompanyMentor ──── Company ──── Industry
       │                      Company ──── JobVacancy
       ├── GroupMember ────── Group ──── Cohort
       │                      Group ──── Major
       │                      Group ──── Company
       │                      Group ──── Registration
       ├── GroupSupervisor ── Group
       ├── Attendance ─────── Group
       ├── Journal ────────── Group
       ├── Complaint ──────── Group
       │   ComplaintReply ─── Complaint
       ├── Visit ──────────── Group
       ├── Document ───────── Cohort
       │   DocumentFile ───── Document
       ├── GeneratedLetter ── LetterSignatory
       ├── Grade
       ├── Feedback
       ├── Approval
       ├── Announcement ───── Cohort
       ├── Notification
       └── AuditLog
```

## Key Constraints

| Table | Constraint | Type |
|---|---|---|
| users | identifier | UNIQUE |
| users | username | UNIQUE |
| student_profiles | nisn | UNIQUE |
| student_profiles | userId | UNIQUE |
| teacher_profiles | nip | UNIQUE |
| teacher_profiles | userId | UNIQUE |
| group_members | (groupId, userId) | UNIQUE |
| group_supervisors | (groupId, userId) | UNIQUE |
| attendances | (userId, date) | UNIQUE (app-level) |
| classes | (cohortId, name) | UNIQUE |
| groups | code | UNIQUE |
| groups | registrationId | UNIQUE |
| refresh_tokens | tokenHash | UNIQUE |

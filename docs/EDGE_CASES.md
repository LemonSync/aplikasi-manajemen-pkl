# Edge Cases & Keamanan — Sistem Manajemen PKL

## 1. Race Condition Absen Dobel

**Risiko:** Siswa klik check-in 2x sekaligus (double-click, retry).

**Mitigasi:**
- Unique constraint `(userId, date)` di tabel `attendances`
- Validasi server-side: cek apakah sudah ada record untuk tanggal yang sama
- Gunakan transaksi DB untuk atomic check-then-insert

```typescript
// Contoh: transaksi atomic
await prisma.$transaction(async (tx) => {
  const existing = await tx.attendance.findUnique({
    where: { userId_date: { userId, date: today } }
  });
  if (existing) throw new ConflictError('Sudah absen hari ini');
  await tx.attendance.create({ data: { ... } });
});
```

## 2. Manipulasi Waktu Klien

**Risiko:** Siswa mengubah waktu di device untuk absen di hari yang berbeda.

**Mitigasi:**
- Validasi server-side: `date` harus = hari ini (timezone WIB)
- Simpan `createdAt` sebagai server timestamp
- Bandingkan `date` parameter dengan `new Date()` di server (WIB)

```typescript
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
if (dto.date !== today) throw new BadRequestError('Tanggal harus hari ini');
```

## 3. Spoofing GPS

**Risiko:** Siswa mengirim koordinat palsu (mock GPS).

**Mitigasi:**
- Catat raw location dari request
- Deteksi anomali: koordinat (0,0), koordinat ekstrem, akurasi rendah
- Flag `isAnomaly` + catat ke audit log
- Tidak ada radius validasi (sesuai keputusan), tapi log semua anomali

```typescript
const isAnomaly =
  (lat === 0 && long === 0) ||
  Math.abs(lat) > 85 || Math.abs(long) > 180;
```

## 4. IDOR (Insecure Direct Object Reference)

**Risiko:** User mengakses dokumen/nilai user lain via ID prediction.

**Mitigasi:**
- Ownership check di service layer (bukan hanya route)
- Contoh: `getOwned(ownerId, documentId)` — pastikan `doc.ownerId === ownerId`
- Guru hanya akses kelompok yang dibimbing (`assertSupervisor`)
- DUDI hanya akses perusahaan/kelompoknya

## 5. Eskalasi Role

**Risiko:** User biasa mengakses endpoint admin.

**Mitigasi:**
- RBAC ketat di route level (`authorizeRoles(...)`)
- Validasi tambahan di service level (bukan hanya route)
- Contoh: service grade memastikan `giverRole` sesuai `req.user.role`

## 6. Upload File Berbahaya

**Risiko:** Upload file executable (.exe, .sh) atau macro (.docm).

**Mitigasi:**
- Whitelist MIME type: `application/pdf`, `image/jpeg`, `image/png`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- Rename file dengan nama generate (bukan nama asli user)
- Simpan di luar webroot (tidak bisa diakses langsung)
- Validasi ukuran file (max dari env)

## 7. Gelombang Closed

**Risiko:** User mengubah data setelah gelombang ditutup.

**Mitigasi:**
- Middleware `requireCohortActive` — blokir write bila status ≠ OPEN
- Read tetap diizinkan (untuk rekap/laporan)
- Audit log semua percobaan akses

## 8. Guru Pindah/Ganti

**Risiko:** Guru berhenti mengajar, tapi data lama masih terkait.

**Mitigasi:**
- Relasi historis: `GroupSupervisor` punya `assignedAt`
- Soft delete pada `teacher_profiles` (field `isActive`)
- Snapshot nama guru di `generated_letters` (tidak berubah)

## 9. Kepsek Berganti

**Risiko:** Kepala sekolah baru, tapi surat lama menampilkan nama baru.

**Mitigasi:**
- Snapshot nama/NIP kepsek per-surat di `generated_letters`
- `letter_signatories` punya `startDate`/`endDate`
- Surat lama tetap konsisten dengan pejabat saat generate

## 10. Revisi Dokumen Ditolak

**Risiko:** Siswa upload ulang setelah ditolak, tapi status tidak konsisten.

**Mitigasi:**
- Document versioning: `document_files.version` + `isActive`
- Saat upload ulang, status reset ke `MENUNGGU_VERIFIKASI`
- File lama dinonaktifkan (`isActive = false`)
- Catatan penolakan disimpan di `documents.note`

## 11. Transisi Fase Tidak Valid

**Risika:** Siswa loncat fase (misal PRA_PKL → PKL_AKTIF langsung).

**Mitigasi:**
- State machine guard: `ALLOWED_PHASE_TRANSITIONS`
- Validasi di `assertValidPhaseTransition()` sebelum update
- Audit log setiap perubahan fase

## 12. Duplikasi Akun NISN/NIP

**Risiko:** Siswa pindah sekolah, NISN sama tapi gelombang berbeda.

**Mitigasi:**
- `identifier` (NISN) unique global — 1 NISN = 1 akun permanen
- Siswa hanya mengikuti PKL 1 kali
- Partisipasi lintas gelombang ditolak di validasi

## 13. Rate Limit Generate PDF

**Risiko:** User abuse endpoint generate surat (resource exhaustion).

**Mitigasi:**
- Rate limiting global pada API
- Rate limit khusus untuk endpoint generate letter
- Batasi jumlah surat per request

## 14. Data Privacy (Lokasi, Orang Tua)

**Risiko:** Data sensitif (GPS, data orang tua) bocor.

**Mitigasi:**
- GPS hanya disimpan untuk keperluan absensi, tidak dipublikasikan
- Data orang tua hanya diakses oleh admin & untuk surat pernyataan
- Enkripsi at-rest (MySQL encryption) untuk data sensitif
- Akses minim: siswa hanya lihat data sendiri

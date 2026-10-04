const fs = require('fs');
const p = 'prisma/schema.prisma';
let s = fs.readFileSync(p, 'utf8');

function rep(oldStr, newStr) {
  if (!s.includes(oldStr)) throw new Error('PATTERN NOT FOUND:\n' + oldStr.slice(0, 120));
  s = s.split(oldStr).join(newStr);
}

// 1. Registration: website + daftar kontak WA
rep(
`  companyCity     String?

  status        RegistrationStatus @default(DRAFT)`,
`  companyCity     String?
  companyWebsite  String?          @db.VarChar(255)  // alamat web perusahaan (jika ada)
  companyContacts Json?                              // daftar no. kontak (WA) yang bisa dihubungi

  status        RegistrationStatus @default(DRAFT)`
);

// 2. User: relasi verifier absensi
rep(
`  attendances          Attendance[]
  journals             Journal[]`,
`  attendances          Attendance[]
  verifiedAttendances  Attendance[] @relation("AttendanceVerifier")
  journals             Journal[]`
);

// 3. Attendance: activity + verifikasi DUDI
rep(
`  date         DateTime         @db.Date
  status       AttendanceStatus @default(HADIR)

  checkInAt    DateTime?`,
`  date         DateTime         @db.Date
  status       AttendanceStatus @default(HADIR)
  activity     String?          @db.Text   // pelaksanaan kegiatan saat absen

  checkInAt    DateTime?`
);

rep(
`  checkOutNote String?          @db.Text

  isAnomaly    Boolean          @default(false)`,
`  checkOutNote String?          @db.Text

  // Konfirmasi DUDI (guru pembimbing/admin bisa melihat, tapi hanya DUDI yang konfirmasi)
  verifiedById String?
  verifiedBy   User?            @relation("AttendanceVerifier", fields: [verifiedById], references: [id], onDelete: SetNull)
  verifiedAt   DateTime?

  isAnomaly    Boolean          @default(false)`
);

// 4. Model baru: jadwal fase per gelombang
rep(
`/// Anggota kelompok yang diinput pada form pendaftaran (sebelum jadi Group resmi).`,
`/// Jadwal tanggal masa per fase untuk sebuah gelombang.
/// Hanya diatur oleh SUPER_ADMIN & KEPALA_SEKOLAH. Dipakai untuk menentukan fase aktif.
model PhaseSchedule {
  id        String       @id @default(cuid())
  cohortId  String
  cohort    Cohort       @relation(fields: [cohortId], references: [id], onDelete: Cascade)
  phase     StudentPhase
  startDate DateTime?
  endDate   DateTime?

  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  @@unique([cohortId, phase])
  @@index([cohortId])
  @@map("phase_schedules")
}

/// Anggota kelompok yang diinput pada form pendaftaran (sebelum jadi Group resmi).`
);

fs.writeFileSync(p, s);
console.log('schema.prisma patched OK');

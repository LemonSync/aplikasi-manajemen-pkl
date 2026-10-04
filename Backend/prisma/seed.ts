import { PrismaClient, Role, CohortStatus, StudentPhase } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);

async function main(): Promise<void> {
  console.log('🌱 Mulai seeding...');

  // ---------------------------------------------------------------------------
  // 1. Super Admin pertama (untuk membuat akun lain)
  // ---------------------------------------------------------------------------
  const username = process.env.SEED_SUPERADMIN_USERNAME ?? 'superadmin';
  const password = process.env.SEED_SUPERADMIN_PASSWORD ?? 'Admin#12345';

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const superAdmin = await prisma.user.upsert({
    where: { username },
    update: { passwordHash, role: Role.SUPER_ADMIN },
    create: {
      username,
      passwordHash,
      role: Role.SUPER_ADMIN,
      mustChangePassword: true,
    },
  });
  console.log(`✅ Super Admin: ${superAdmin.username} (password: ${password})`);

  // ---------------------------------------------------------------------------
  // 2. Master jurusan
  // ---------------------------------------------------------------------------
  const majors = [
    { code: 'DKV', name: 'Desain Komunikasi Visual' },
    { code: 'RPL', name: 'Rekayasa Perangkat Lunak' },
    { code: 'PSPT', name: 'Produksi Siaran Pertelevisian' },
    { code: 'ANIMASI', name: 'Animasi' },
    { code: 'TKJ', name: 'Teknik Komputer dan Jaringan' },
    { code: 'PEKSOS', name: 'Pekerjaan Sosial' },
  ];
  for (const major of majors) {
    await prisma.major.upsert({
      where: { code: major.code },
      update: { name: major.name },
      create: major,
    });
  }
  console.log(`✅ ${majors.length} jurusan`);

  // ---------------------------------------------------------------------------
  // 3. Master bidang industri
  // ---------------------------------------------------------------------------
  const industries = [
    'Teknologi Informasi',
    'Perbankan & Keuangan',
    'Retail & Perdagangan',
    'Manufaktur',
    'Media & Kreatif',
    'Telekomunikasi',
  ];
  for (const name of industries) {
    await prisma.industry.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`✅ ${industries.length} bidang industri`);

  // ---------------------------------------------------------------------------
  // 4. Pengaturan sistem (bobot nilai, dsb.)
  // ---------------------------------------------------------------------------
  const settings = [
    {
      key: 'grade.weight.dudi',
      value: '100',
      type: 'number',
      description: 'Bobot nilai DUDI terhadap nilai akhir (persen)',
    },
    {
      key: 'grade.weight.guidance',
      value: '0',
      type: 'number',
      description: 'Bobot nilai bimbingan guru (persen) — saat ini 0 (catatan saja)',
    },
    {
      key: 'attendance.require.gps',
      value: 'true',
      type: 'boolean',
      description: 'Wajib menyertakan lokasi GPS saat absen',
    },
    {
      key: 'attendance.allow.late_entry',
      value: 'false',
      type: 'boolean',
      description: 'Izinkan absen susulan (rapel) — sesuai aturan: false',
    },
    {
      key: 'school.name',
      value: 'SMK Negeri 9 Medan',
      type: 'string',
      description: 'Nama sekolah (kop surat)',
    },
    {
      key: 'school.address',
      value: 'Jl. Sei Batanghari No. 9, Medan',
      type: 'string',
      description: 'Alamat sekolah (kop surat)',
    },
    {
      key: 'school.phone',
      value: '(021) 1234567',
      type: 'string',
      description: 'Telepon sekolah (kop surat)',
    },
    {
      key: 'school.email',
      value: 'info@sekolah.sch.id',
      type: 'string',
      description: 'Email sekolah (kop surat)',
    },
    {
      key: 'school.city',
      value: 'Medan',
      type: 'string',
      description: 'Kota untuk blok tanda tangan surat',
    },
  ];
  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value, type: setting.type, description: setting.description },
      create: { ...setting, updatedById: superAdmin.id },
    });
  }
  console.log(`✅ ${settings.length} pengaturan sistem`);

  // ---------------------------------------------------------------------------
  // 5. Contoh gelombang (dapat diubah/dihapus lewat UI)
  // ---------------------------------------------------------------------------
  const cohort = await prisma.cohort.upsert({
    where: { name: 'Gelombang 1 - 2024/2025' },
    update: {},
    create: {
      name: 'Gelombang 1 - 2024/2025',
      academicYear: '2024/2025',
      status: CohortStatus.OPEN,
      description: 'Gelombang contoh hasil seeding',
    },
  });
  console.log(`✅ Cohort contoh: ${cohort.name}`);

  // ---------------------------------------------------------------------------
  // 6. Penandatangan surat default (Kepala Sekolah)
  // ---------------------------------------------------------------------------
  const existingSignatory = await prisma.letterSignatory.findFirst({ where: { isActive: true } });
  if (!existingSignatory) {
    await prisma.letterSignatory.create({
      data: {
        name: 'Dr. Contoh Kepala Sekolah, M.Pd.',
        nip: '197001011990031001',
        position: 'Kepala Sekolah',
        isActive: true,
      },
    });
    console.log('✅ Penandatangan surat default (dapat diganti di UI)');
  }

  console.log('🎉 Seeding selesai.');
  console.log('   Fase enum contoh:', StudentPhase.PRA_PKL, '(digunakan pada profil siswa)');
}

main()
  .catch((err) => {
    console.error('❌ Seeding gagal:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

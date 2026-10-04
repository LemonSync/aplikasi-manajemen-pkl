import { PrismaClient, Role, CohortStatus, StudentPhase, RegistrationStatus, GroupStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

/**
 * Seed data QA untuk testing manual setiap fase.
 * Jalankan: npx ts-node prisma/seed-qa.ts
 */
async function main(): Promise<void> {
  console.log('🌱 Mulai seeding QA data...');

  // Super admin (untuk actorId)
  const superAdmin = await prisma.user.findFirst({ where: { role: Role.SUPER_ADMIN } });
  if (!superAdmin) {
    console.error('❌ Super admin tidak ditemukan. Jalankan seed.ts terlebih dahulu.');
    return;
  }

  // Cari atau buat cohort untuk testing
  const cohort = await prisma.cohort.upsert({
    where: { name: 'Gelombang QA Test - 2026/2027' },
    update: {},
    create: {
      name: 'Gelombang QA Test - 2026/2027',
      academicYear: '2026/2027',
      status: CohortStatus.OPEN,
      description: 'Gelombang untuk testing QA semua fase',
    },
  });
  console.log(`✅ Cohort: ${cohort.name}`);

  // Setup phase schedule (semua fase aktif sekarang untuk testing)
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextMonth = new Date(now);
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  const phases = [
    { phase: StudentPhase.PRA_PKL, start: new Date(now.getTime() - 7 * 86400000), end: nextWeek },
    { phase: StudentPhase.NON_PKL, start: nextWeek, end: nextMonth },
    { phase: StudentPhase.PKL_AKTIF, start: nextMonth, end: new Date(nextMonth.getTime() + 90 * 86400000) },
    { phase: StudentPhase.PKL_SELESAI, start: new Date(nextMonth.getTime() + 91 * 86400000), end: new Date(nextMonth.getTime() + 98 * 86400000) },
  ];

  for (const p of phases) {
    await prisma.phaseSchedule.upsert({
      where: { cohortId_phase: { cohortId: cohort.id, phase: p.phase } },
      update: { startDate: p.start, endDate: p.end },
      create: { cohortId: cohort.id, phase: p.phase, startDate: p.start, endDate: p.end },
    });
  }
  console.log('✅ Phase schedule (semua fase aktif untuk testing)');

  // Cari jurusan RPL
  const rplMajor = await prisma.major.findFirst({ where: { code: 'RPL' } });
  const dkvMajor = await prisma.major.findFirst({ where: { code: 'DKV' } });

  // =========================================================================
  // SISWA FASE 1: PRA_PKL (belum submit registrasi)
  // =========================================================================
  const pwHash = await bcrypt.hash('123456', SALT_ROUNDS);

  const siswa1 = await prisma.user.upsert({
    where: { username: 'siswa_fase1' },
    update: {},
    create: {
      username: 'siswa_fase1',
      passwordHash: pwHash,
      role: Role.SISWA,
      phase: StudentPhase.PRA_PKL,
      cohortId: cohort.id,
    },
  });
  await prisma.studentProfile.upsert({
    where: { userId: siswa1.id },
    update: {},
    create: {
      userId: siswa1.id,
      fullName: 'Ahmad Fase 1',
      nisn: '001001',
      majorId: rplMajor?.id,
    },
  });
  console.log(`✅ Siswa Fase 1 (PRA_PKL): ${siswa1.username}`);

  // =========================================================================
  // SISWA FASE 2: NON_PKL (sudah submit registrasi, menunggu verifikasi)
  // =========================================================================
  const siswa2 = await prisma.user.upsert({
    where: { username: 'siswa_fase2' },
    update: {},
    create: {
      username: 'siswa_fase2',
      passwordHash: pwHash,
      role: Role.SISWA,
      phase: StudentPhase.NON_PKL,
      cohortId: cohort.id,
    },
  });
  await prisma.studentProfile.upsert({
    where: { userId: siswa2.id },
    update: {},
    create: {
      userId: siswa2.id,
      fullName: 'Budi Fase 2',
      nisn: '001002',
      majorId: rplMajor?.id,
    },
  });

  // Buat registrasi DIAJUKAN untuk siswa2
  const reg2 = await prisma.registration.upsert({
    where: { id: 'qa_reg_fase2' },
    update: {},
    create: {
      id: 'qa_reg_fase2',
      code: 'REG-QA-001',
      groupName: 'Kelompok QA Fase 2',
      companyName: 'PT Tech Solutions',
      companyAddress: 'Jl. Sudirman No. 10, Medan',
      companyIndustry: 'Teknologi Informasi',
      status: RegistrationStatus.DIAJUKAN,
      leaderId: siswa2.id,
      cohortId: cohort.id,
      majorId: rplMajor?.id,
    },
  });
  await prisma.registrationMember.create({
    data: {
      registrationId: reg2.id,
      userId: siswa2.id,
      fullName: 'Budi Fase 2',
      nisn: '001002',
      isLeader: true,
    },
  });
  console.log(`✅ Siswa Fase 2 (NON_PKL): ${siswa2.username} + registrasi DIAJUKAN`);

  // =========================================================================
  // SISWA FASE 3: PKL_AKTIF (sudah punya kelompok, sedang PKL)
  // =========================================================================
  const siswa3 = await prisma.user.upsert({
    where: { username: 'siswa_fase3' },
    update: {},
    create: {
      username: 'siswa_fase3',
      passwordHash: pwHash,
      role: Role.SISWA,
      phase: StudentPhase.PKL_AKTIF,
      cohortId: cohort.id,
    },
  });
  await prisma.studentProfile.upsert({
    where: { userId: siswa3.id },
    update: {},
    create: {
      userId: siswa3.id,
      fullName: 'Citra Fase 3',
      nisn: '001003',
      majorId: dkvMajor?.id,
    },
  });

  // Buat perusahaan
  const company = await prisma.company.upsert({
    where: { id: 'qa_company_fase3' },
    update: {},
    create: {
      id: 'qa_company_fase3',
      name: 'PT Digital Kreatif',
      address: 'Jl. Pemuda No. 20, Medan',
      industryId: undefined,
    },
  });

  // Buat registrasi + group untuk siswa3
  const reg3 = await prisma.registration.upsert({
    where: { id: 'qa_reg_fase3' },
    update: {},
    create: {
      id: 'qa_reg_fase3',
      code: 'REG-QA-002',
      groupName: 'Kelompok QA Fase 3',
      companyName: 'PT Digital Kreatif',
      companyAddress: 'Jl. Pemuda No. 20, Medan',
      status: RegistrationStatus.DISETUJUI,
      leaderId: siswa3.id,
      cohortId: cohort.id,
      majorId: dkvMajor?.id,
    },
  });

  const group3 = await prisma.group.upsert({
    where: { id: 'qa_group_fase3' },
    update: {},
    create: {
      id: 'qa_group_fase3',
      code: 'GRP-QA-001',
      name: 'Kelompok QA Fase 3',
      cohortId: cohort.id,
      companyId: company.id,
      registrationId: reg3.id,
      status: GroupStatus.AKTIF,
      startDate: now,
      endDate: nextMonth,
    },
  });

  await prisma.groupMember.upsert({
    where: { groupId_userId: { groupId: group3.id, userId: siswa3.id } },
    update: {},
    create: {
      groupId: group3.id,
      userId: siswa3.id,
      isLeader: true,
    },
  });
  console.log(`✅ Siswa Fase 3 (PKL_AKTIF): ${siswa3.username} + group aktif`);

  // =========================================================================
  // SISWA FASE 4: PKL_SELESAI (sudah selesai PKL)
  // =========================================================================
  const siswa4 = await prisma.user.upsert({
    where: { username: 'siswa_fase4' },
    update: {},
    create: {
      username: 'siswa_fase4',
      passwordHash: pwHash,
      role: Role.SISWA,
      phase: StudentPhase.PKL_SELESAI,
      cohortId: cohort.id,
    },
  });
  await prisma.studentProfile.upsert({
    where: { userId: siswa4.id },
    update: {},
    create: {
      userId: siswa4.id,
      fullName: 'Diana Fase 4',
      nisn: '001004',
      majorId: rplMajor?.id,
    },
  });
  console.log(`✅ Siswa Fase 4 (PKL_SELESAI): ${siswa4.username}`);

  // =========================================================================
  // GURU PEMBIMBING
  // =========================================================================
  const guru = await prisma.user.upsert({
    where: { username: 'guru_pembimbing' },
    update: {},
    create: {
      username: 'guru_pembimbing',
      passwordHash: pwHash,
      role: Role.GURU_PEMBIMBING,
      cohortId: cohort.id,
    },
  });
  await prisma.teacherProfile.upsert({
    where: { userId: guru.id },
    update: {},
    create: {
      userId: guru.id,
      fullName: 'Pak Guru Pembimbing',
      nip: '198501012010011001',
    },
  });
  await prisma.groupSupervisor.upsert({
    where: { groupId_userId: { groupId: group3.id, userId: guru.id } },
    update: {},
    create: {
      groupId: group3.id,
      userId: guru.id,
    },
  });
  console.log(`✅ Guru Pembimbing: ${guru.username}`);

  // =========================================================================
  // DUDI (perusahaan)
  // =========================================================================
  const dudi = await prisma.user.upsert({
    where: { username: 'dudi_mentor' },
    update: {},
    create: {
      username: 'dudi_mentor',
      passwordHash: pwHash,
      role: Role.DUDI,
    },
  });
  await prisma.companyMentor.upsert({
    where: { userId: dudi.id },
    update: {},
    create: {
      userId: dudi.id,
      companyId: company.id,
      fullName: 'Bapak Mentor DUDI',
    },
  });
  console.log(`✅ DUDI Mentor: ${dudi.username}`);

  console.log('\n🎉 Seeding QA selesai! Semua fase sudah ada data contoh.');
  console.log('\n📋 Akun untuk testing:');
  console.log('   Siswa Fase 1 (PRA_PKL):     siswa_fase1 / 123456');
  console.log('   Siswa Fase 2 (NON_PKL):      siswa_fase2 / 123456');
  console.log('   Siswa Fase 3 (PKL_AKTIF):    siswa_fase3 / 123456');
  console.log('   Siswa Fase 4 (PKL_SELESAI):  siswa_fase4 / 123456');
  console.log('   Guru Pembimbing:              guru_pembimbing / 123456');
  console.log('   DUDI Mentor:                  dudi_mentor / 123456');
  console.log('   Super Admin:                  superadmin / Admin#12345');
}

main()
  .catch((err) => {
    console.error('❌ Seeding QA gagal:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

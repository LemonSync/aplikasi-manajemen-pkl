"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const prisma = new client_1.PrismaClient();
const SALT_ROUNDS = 12;
/**
 * Seed data QA untuk testing manual setiap fase.
 * Jalankan: npx ts-node prisma/seed-qa.ts
 */
async function main() {
    console.log('🌱 Mulai seeding QA data...');
    // Super admin (untuk actorId)
    const superAdmin = await prisma.user.findFirst({ where: { role: client_1.Role.SUPER_ADMIN } });
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
            status: client_1.CohortStatus.OPEN,
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
        { phase: client_1.StudentPhase.PRA_PKL, start: new Date(now.getTime() - 7 * 86400000), end: nextWeek },
        { phase: client_1.StudentPhase.NON_PKL, start: nextWeek, end: nextMonth },
        { phase: client_1.StudentPhase.PKL_AKTIF, start: nextMonth, end: new Date(nextMonth.getTime() + 90 * 86400000) },
        { phase: client_1.StudentPhase.PKL_SELESAI, start: new Date(nextMonth.getTime() + 91 * 86400000), end: new Date(nextMonth.getTime() + 98 * 86400000) },
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
    /** Cari atau buat baris Class (mis. "XII RPL 1" dari "XII-RPL-1") — untuk profil siswa QA. */
    const resolveClassId = async (className, majorId) => {
        const name = className.replace(/-/g, ' ').trim().toUpperCase();
        const existing = await prisma.class.findUnique({ where: { cohortId_name: { cohortId: cohort.id, name } } });
        if (existing)
            return existing.id;
        const created = await prisma.class.create({
            data: { name, grade: name.split(' ')[0] ?? null, cohortId: cohort.id, majorId: majorId ?? null },
        });
        return created.id;
    };
    // =========================================================================
    // SISWA FASE 1: PRA_PKL (belum submit registrasi)
    // =========================================================================
    const pwHash = await bcryptjs_1.default.hash('123456', SALT_ROUNDS);
    const siswa1 = await prisma.user.upsert({
        where: { username: 'siswa_fase1' },
        update: {},
        create: {
            username: 'siswa_fase1',
            passwordHash: pwHash,
            role: client_1.Role.SISWA,
            phase: client_1.StudentPhase.PRA_PKL,
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
            classId: await resolveClassId('XII-RPL-1', rplMajor?.id),
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
            role: client_1.Role.SISWA,
            phase: client_1.StudentPhase.NON_PKL,
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
            classId: await resolveClassId('XII-RPL-1', rplMajor?.id),
        },
    });
    // Perusahaan untuk registrasi siswa2
    const company2 = await prisma.company.upsert({
        where: { id: 'qa_company_fase2' },
        update: {},
        create: {
            id: 'qa_company_fase2',
            name: 'PT Tech Solutions',
            address: 'Jl. Sudirman No. 10, Medan',
            industryId: undefined,
        },
    });
    // Registrasi DIAJUKAN milik siswa2
    await prisma.registration.upsert({
        where: { id: 'qa_reg_fase2' },
        update: {},
        create: {
            id: 'qa_reg_fase2',
            code: 'REG-QA-001',
            studentId: siswa2.id,
            companyId: company2.id,
            status: client_1.RegistrationStatus.DIAJUKAN,
            cohortId: cohort.id,
            majorId: rplMajor?.id,
            submittedAt: now,
        },
    });
    console.log(`✅ Siswa Fase 2 (NON_PKL): ${siswa2.username} + registrasi DIAJUKAN`);
    // =========================================================================
    // SISWA FASE 3: PKL_AKTIF (registrasi DISETUJUI, sedang PKL)
    // =========================================================================
    const siswa3 = await prisma.user.upsert({
        where: { username: 'siswa_fase3' },
        update: {},
        create: {
            username: 'siswa_fase3',
            passwordHash: pwHash,
            role: client_1.Role.SISWA,
            phase: client_1.StudentPhase.PKL_AKTIF,
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
            classId: await resolveClassId('XII-DKV-1', dkvMajor?.id),
        },
    });
    // Buat perusahaan
    const company3 = await prisma.company.upsert({
        where: { id: 'qa_company_fase3' },
        update: {},
        create: {
            id: 'qa_company_fase3',
            name: 'PT Digital Kreatif',
            address: 'Jl. Pemuda No. 20, Medan',
            industryId: undefined,
        },
    });
    // Registrasi DISETUJUI milik siswa3
    await prisma.registration.upsert({
        where: { id: 'qa_reg_fase3' },
        update: {},
        create: {
            id: 'qa_reg_fase3',
            code: 'REG-QA-002',
            studentId: siswa3.id,
            companyId: company3.id,
            status: client_1.RegistrationStatus.DISETUJUI,
            cohortId: cohort.id,
            majorId: dkvMajor?.id,
            submittedAt: now,
            reviewedById: superAdmin.id,
            reviewedAt: now,
            permohonanDownloadedAt: now,
        },
    });
    console.log(`✅ Siswa Fase 3 (PKL_AKTIF): ${siswa3.username} + registrasi DISETUJUI`);
    // =========================================================================
    // SISWA FASE 4: PKL_SELESAI (sudah selesai PKL)
    // =========================================================================
    const siswa4 = await prisma.user.upsert({
        where: { username: 'siswa_fase4' },
        update: {},
        create: {
            username: 'siswa_fase4',
            passwordHash: pwHash,
            role: client_1.Role.SISWA,
            phase: client_1.StudentPhase.PKL_SELESAI,
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
            classId: await resolveClassId('XII-RPL-2', rplMajor?.id),
        },
    });
    console.log(`✅ Siswa Fase 4 (PKL_SELESAI): ${siswa4.username}`);
    // =========================================================================
    // GURU PEMBIMBING (+ pembimbingan siswa fase 3 & 4)
    // =========================================================================
    const guru = await prisma.user.upsert({
        where: { username: 'guru_pembimbing' },
        update: {},
        create: {
            username: 'guru_pembimbing',
            passwordHash: pwHash,
            role: client_1.Role.GURU_PEMBIMBING,
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
    // Satu siswa = satu guru (StudentSupervisor)
    for (const studentId of [siswa3.id, siswa4.id]) {
        await prisma.studentSupervisor.upsert({
            where: { studentId },
            update: { supervisorId: guru.id },
            create: {
                studentId,
                supervisorId: guru.id,
                assignedById: superAdmin.id,
            },
        });
    }
    console.log(`✅ Guru Pembimbing: ${guru.username} (membimbing ${2} siswa)`);
    console.log('\n🎉 Seeding QA selesai! Semua fase sudah ada data contoh.');
    console.log('\n📋 Akun untuk testing:');
    console.log('   Siswa Fase 1 (PRA_PKL):     siswa_fase1 / 123456');
    console.log('   Siswa Fase 2 (NON_PKL):      siswa_fase2 / 123456');
    console.log('   Siswa Fase 3 (PKL_AKTIF):    siswa_fase3 / 123456');
    console.log('   Siswa Fase 4 (PKL_SELESAI):  siswa_fase4 / 123456');
    console.log('   Guru Pembimbing:              guru_pembimbing / 123456');
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
//# sourceMappingURL=seed-qa.js.map
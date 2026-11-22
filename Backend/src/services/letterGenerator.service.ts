import { DocumentType, Prisma, Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { letterService, GeneratedLetterResult } from './letter.service';
import { settingService } from './setting.service';
import { LETTER_TEXT } from '../config/letter.config';
import { BadRequestError, NotFoundError } from '../errors/AppError';
import { resolveScope, scopeUserWhere } from './majorScope.service';

/**
 * Service generator surat manual admin:
 * - Surat Permohonan: SELURUH siswa pendaftar satu perusahaan dalam satu surat
 *   (tabel NO / NAMA SISWA / PROGRAM KEAHLIAN — persis surat contoh resmi).
 * - Surat Penugasan: penugasan guru pembimbing, tujuan = daftar perusahaan
 *   siswa bimbingannya (layout Dari/Kepada/Dasar/Isi).
 */
export class LetterGeneratorService {
  /** Surat permohonan PKL untuk satu perusahaan (banyak siswa). */
  async generatePermohonan(params: {
    cohortId: string;
    companyId: string;
    number?: string | null;
    actorId: string;
    actorRole?: Role;
  }): Promise<GeneratedLetterResult & { studentCount: number }> {
    const { cohortId, companyId, number, actorId, actorRole } = params;

    const [cohort, company] = await Promise.all([
      prisma.cohort.findFirst({ where: { id: cohortId, deletedAt: null } }),
      prisma.company.findFirst({ where: { id: companyId, deletedAt: null } }),
    ]);
    if (!cohort) throw new NotFoundError('Gelombang tidak ditemukan');
    if (!company) throw new NotFoundError('Perusahaan tidak ditemukan');

    // Scope jurusan: ADMIN hanya memasukkan siswa dalam jurusan yang diawasi.
    let scopeFilter: Prisma.RegistrationWhereInput = {};
    if (actorRole === Role.ADMIN) {
      const scope = await resolveScope({ id: actorId, role: Role.ADMIN });
      const scoped = scopeUserWhere(scope, 'student');
      if (scoped) scopeFilter = scoped as Prisma.RegistrationWhereInput;
    }

    const registrations = await prisma.registration.findMany({
      where: {
        cohortId,
        companyId,
        deletedAt: null,
        status: { in: ['DIAJUKAN', 'DISETUJUI'] },
        ...scopeFilter,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        student: {
          select: {
            username: true,
            studentProfile: { select: { fullName: true, major: { select: { name: true } } } },
          },
        },
      },
    });
    if (registrations.length === 0) {
      throw new BadRequestError(
        'Belum ada siswa yang mendaftar ke perusahaan ini pada gelombang tersebut'
      );
    }

    const school = await settingService.getSchoolIdentity();
    const rangeText = await letterService.getPklRangeText(cohortId);
    const academicYear = letterService.academicYearFromCohortName(cohort.name);
    const dateClause = rangeText
      ? `mengikuti kegiatan PKL mulai tanggal **${rangeText}**.`
      : 'mengikuti kegiatan PKL pada masa yang ditentukan.';

    const rows = registrations.map((reg, i) => [
      `${i + 1}.`,
      reg.student?.studentProfile?.fullName ?? reg.student?.username ?? 'Siswa',
      reg.student?.studentProfile?.major?.name ?? '-',
    ]);

    const result = await letterService.generateLetter({
      type: DocumentType.SURAT_PERMOHONAN,
      number: number ?? null,
      hal: LETTER_TEXT.application.subject,
      recipientLines: ['Bapak / Ibu Pimpinan', company.name],
      recipientCity: company.city ?? school.city,
      paragraphs: [
        LETTER_TEXT.application.opener +
          LETTER_TEXT.application.body(school.schoolName, academicYear, company.name, dateClause),
        LETTER_TEXT.application.studentIntro,
      ],
      table: {
        preset: 'siswa',
        columns: [...LETTER_TEXT.application.tableHeaders],
        rows,
      },
      closing: LETTER_TEXT.application.closing,
      cohortId,
      createdById: actorId,
      payload: {
        companyId,
        companyName: company.name,
        students: registrations.map((reg) => ({
          name: reg.student?.studentProfile?.fullName ?? reg.student?.username ?? 'Siswa',
        })),
      },
    });

    return { ...result, studentCount: registrations.length };
  }

  /** Surat penugasan pembimbing: tujuan = perusahaan unik siswa bimbingan. */
  async generatePenugasan(params: {
    supervisorId: string;
    number?: string | null;
    dasar?: string | null;
    actorId: string;
  }): Promise<GeneratedLetterResult & { tujuanCount: number }> {
    const { supervisorId, number, dasar, actorId } = params;

    const supervisor = await prisma.user.findFirst({
      where: { id: supervisorId, role: Role.GURU_PEMBIMBING, deletedAt: null },
      select: {
        id: true,
        username: true,
        teacherProfile: { select: { fullName: true, nip: true, phone: true, majorId: true } },
      },
    });
    if (!supervisor) throw new NotFoundError('Guru pembimbing tidak ditemukan');

    const major = supervisor.teacherProfile?.majorId
      ? await prisma.major.findUnique({
          where: { id: supervisor.teacherProfile.majorId },
          select: { code: true },
        })
      : null;

    const links = await prisma.studentSupervisor.findMany({
      where: { supervisorId },
      orderBy: { assignedAt: 'asc' },
      select: {
        student: {
          select: {
            cohortId: true,
            studentRegistrations: {
              where: { deletedAt: null, status: { in: ['DIAJUKAN', 'DISETUJUI'] } },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { company: { select: { id: true, name: true, address: true } } },
            },
          },
        },
      },
    });

    const tujuan = [
      ...new Map(
        links
          .map((l) => l.student.studentRegistrations[0]?.company)
          .filter((c): c is NonNullable<typeof c> => Boolean(c))
          .map((c) => [c.id, { name: c.name, address: c.address ?? '-' }])
      ).values(),
    ];
    if (tujuan.length === 0) {
      throw new BadRequestError('Guru ini belum memiliki siswa bimbingan dengan perusahaan tujuan');
    }

    const school = await settingService.getSchoolIdentity();
    const cohortId = links.find((l) => l.student.cohortId)?.student.cohortId ?? null;
    const rangeText = (await letterService.getPklRangeText(cohortId)) ?? 'masa PKL yang ditentukan';
    const teacherName = supervisor.teacherProfile?.fullName ?? supervisor.username;
    const majorCode = major?.code ?? null;

    const result = await letterService.generatePenugasan({
      number: number ?? null,
      dari: LETTER_TEXT.assignment.from,
      kepada: {
        nama: teacherName,
        nip: supervisor.teacherProfile?.nip ?? null,
        jabatan: majorCode ? `Guru Produktif Keahlian ${majorCode}` : LETTER_TEXT.assignment.defaultPosition,
        unitKerja: school.schoolName,
      },
      dasar: dasar?.trim() || LETTER_TEXT.assignment.basis(school.schoolName),
      isi: LETTER_TEXT.assignment.content(rangeText),
      ketentuan: LETTER_TEXT.assignment.closing,
      tujuan,
      cohortId,
      createdById: actorId,
      payload: { supervisorId, supervisorName: teacherName, companies: tujuan },
    });

    return { ...result, tujuanCount: tujuan.length };
  }
}

export const letterGeneratorService = new LetterGeneratorService();

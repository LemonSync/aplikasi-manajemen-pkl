import { DocumentStatus, DocumentType, StudentPhase } from '@prisma/client';
import { prisma } from '../config/prisma';
import { documentRepository } from '../repositories/document.repository';
import { settingService } from './setting.service';
import { auditService } from './audit.service';
import { saveBuffer } from '../utils/storage';
import { renderPernyataanPdf } from '../templates/pernyataan.template';
import { AUDIT_ACTIONS, ENTITY_TYPES } from '../config/constants';
import { BadRequestError, NotFoundError } from '../errors/AppError';

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function formatLongDate(d: Date): string {
  return `${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}

export interface PernyataanDataInput {
  // Hanya data yang boleh diisi siswa. Nama, kelas/program keahlian, No. HP siswa,
  // dan tempat PKL diambil dari server (master siswa + pendaftaran Fase 1).
  namaOrtu?: string;
  alamatSiswa?: string;
  hpOrtu?: string;
}

export interface PernyataanResult {
  documentId: string;
  fileId: string;
  fileName: string;
}

/**
 * Service Surat Pernyataan Peserta PKL (Fase 2: Pendaftaran Ulang).
 * Generate PDF berisi peraturan, data siswa, blok tanda tangan (siswa + materai, ortu, wali kelas).
 */
export class PernyataanService {
  /**
   * Kumpulkan data Surat Pernyataan.
   * - Nama siswa & kelas/program keahlian → data master siswa (StudentRegistry via NISN), tidak bisa diubah siswa
   * - Tempat PKL & No. HP siswa           → hasil pendaftaran Fase 1 (perusahaan & RegistrationMember.phone), tidak bisa diubah siswa
   * - Nama ortu, alamat, No. HP ortu      → input siswa (boleh diubah)
   */
  private async collectStudentData(userId: string, input: PernyataanDataInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        studentProfile: { include: { class: true, major: true, parentData: true } },
        cohort: true,
      },
    });
    if (!user) throw new NotFoundError('Pengguna tidak ditemukan');

    const profile = user.studentProfile;

    const [membership, regMember, registry] = await Promise.all([
      prisma.groupMember.findFirst({
        where: { userId },
        include: { group: { include: { company: true, cohort: true, registration: true } } },
      }),
      // Baris anggota pada pendaftaran Fase 1 milik siswa ini (No. HP diisi saat Fase 1)
      prisma.registrationMember.findFirst({
        where: { userId },
        include: { registration: { select: { companyName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      // Master siswa (NISN) — sumber nama & kelas/program keahlian
      profile?.nisn
        ? prisma.studentRegistry.findFirst({
            where: {
              nisn: profile.nisn,
              isActive: true,
              ...(user.cohortId ? { cohortId: user.cohortId } : {}),
            },
            include: { major: true },
          })
        : Promise.resolve(null),
    ]);

    const group = membership?.group;
    const cohort = group?.cohort ?? user.cohort;

    // [DIKUNCI] Dari data master siswa
    const namaSiswa = registry?.fullName ?? profile?.fullName ?? user.username;
    const kelasJurusan = registry
      ? [registry.className, registry.major?.name].filter(Boolean).join('/')
      : [profile?.class?.name, profile?.major?.name].filter(Boolean).join('/');

    const parent = profile?.parentData;
    const namaOrtu = input.namaOrtu ?? parent?.fatherName ?? parent?.guardianName ?? '';
    const hpOrtu = input.hpOrtu ?? parent?.fatherPhone ?? parent?.guardianPhone ?? '';
    const alamatSiswa = input.alamatSiswa ?? profile?.address ?? '';
    // [DIKUNCI] Dari pendaftaran Fase 1
    const hpSiswa = regMember?.phone ?? profile?.phone ?? '';
    const tempatPkl = group?.company?.name ?? regMember?.registration?.companyName ?? '';

    let tanggalPkl = '';
    let tahunPelajaran = '';
    if (cohort) {
      if (cohort.startDate && cohort.endDate) {
        tanggalPkl = `${formatLongDate(cohort.startDate)} s.d. ${formatLongDate(cohort.endDate)}`;
      }
      if (cohort.academicYear) {
        tahunPelajaran = cohort.academicYear;
      }
    }

    // Ambil nama wali kelas dari setting atau default
    const waliKelasSetting = await settingService.get('wali_kelas.nama');
    const namaWaliKelas = waliKelasSetting ?? '';

    const school = await settingService.getSchoolIdentity();

    return {
      nama_siswa: namaSiswa,
      kelas_jurusan: kelasJurusan,
      nama_ortu: namaOrtu,
      alamat_siswa: alamatSiswa,
      hp_ortu: hpOrtu,
      hp_siswa: hpSiswa,
      tempat_pkl: tempatPkl,
      tanggal_pkl: tanggalPkl,
      tahun_pelajaran: tahunPelajaran,
      nama_wali_kelas: namaWaliKelas,
      kota: school.city ?? 'Medan',
    };
  }

  async generate(
    userId: string,
    input: PernyataanDataInput,
    ctx: { ipAddress?: string; userAgent?: string }
  ): Promise<PernyataanResult> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('Pengguna tidak ditemukan');
    if (user.role !== 'SISWA' || user.phase !== StudentPhase.NON_PKL) {
      throw new BadRequestError('Surat Pernyataan hanya bisa dibuat pada masa pendaftaran ulang PKL');
    }

    const data = await this.collectStudentData(userId, input);

    if (!data.nama_siswa) throw new BadRequestError('Nama siswa wajib diisi');
    if (!data.tempat_pkl) throw new BadRequestError('Tempat PKL belum diketahui (kelompok belum memiliki perusahaan)');

    // Generate PDF
    const pdfBuffer = await renderPernyataanPdf({
      namaSiswa: data.nama_siswa,
      kelasJurusan: data.kelas_jurusan,
      namaOrtu: data.nama_ortu,
      alamatSiswa: data.alamat_siswa,
      hpOrtu: data.hp_ortu,
      hpSiswa: data.hp_siswa,
      tempatPkl: data.tempat_pkl,
      tanggalPkl: data.tanggal_pkl,
      tahunPelajaran: data.tahun_pelajaran,
      namaWaliKelas: data.nama_wali_kelas,
      kota: data.kota,
      tanggalSurat: formatLongDate(new Date()),
    });

    const fileName = `SURAT-PERNYATAAN-${userId}-${Date.now()}.pdf`;
    const { relativePath } = saveBuffer('documents', fileName, pdfBuffer);

    const existing = await documentRepository.findMany({ ownerId: userId, type: DocumentType.SURAT_PERNYATAAN });
    let document = existing[0];

    if (!document) {
      document = (await documentRepository.create({
        type: DocumentType.SURAT_PERNYATAAN,
        status: DocumentStatus.DRAFT, // PDF sudah dibuat, menunggu siswa download + upload yang sudah ditandatangani
        title: `Surat Pernyataan PKL - ${data.nama_siswa}`,
        owner: { connect: { id: userId } },
        ...(user.cohortId ? { cohort: { connect: { id: user.cohortId } } } : {}),
      })) as never;
    } else {
      // Jika sudah DISETUJUI, tidak boleh generate ulang
      if (document.status === DocumentStatus.DISETUJUI) {
        throw new BadRequestError('Surat Pernyataan sudah disetujui dan tidak dapat dibuat ulang');
      }
      await documentRepository.update(document.id, {
        status: DocumentStatus.DRAFT, // Reset ke DRAFT
        note: null,
        verifiedById: null,
        verifiedAt: null,
      });
      await documentRepository.deactivateFiles(document.id);
    }

    const file = await documentRepository.createFile({
      document: { connect: { id: document.id } },
      uploadedBy: { connect: { id: userId } },
      originalName: fileName,
      storedPath: relativePath,
      mimeType: 'application/pdf',
      sizeBytes: pdfBuffer.length,
      version: 1,
      isActive: true,
    });

    await auditService.record({
      actorId: userId,
      action: AUDIT_ACTIONS.GENERATE_LETTER,
      entityType: ENTITY_TYPES.DOCUMENT,
      entityId: document.id,
      metadata: { type: 'SURAT_PERNYATAAN_PDF', ...data },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return { documentId: document.id, fileId: file.id, fileName };
  }

  async getPrefill(userId: string) {
    const data = await this.collectStudentData(userId, {});

    return {
      namaSiswa: data.nama_siswa,
      kelasJurusan: data.kelas_jurusan,
      namaOrtu: data.nama_ortu,
      alamatSiswa: data.alamat_siswa,
      hpOrtu: data.hp_ortu,
      hpSiswa: data.hp_siswa,
      tempatPkl: data.tempat_pkl,
      tanggalPkl: data.tanggal_pkl,
      tahunPelajaran: data.tahun_pelajaran,
    };
  }
}

export const pernyataanService = new PernyataanService();

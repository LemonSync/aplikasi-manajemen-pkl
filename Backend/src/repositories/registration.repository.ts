import { DocumentStatus, DocumentType, Prisma, Registration } from '@prisma/client';
import { prisma } from '../config/prisma';

const studentInclude = {
  student: {
    select: {
      id: true,
      username: true,
      studentProfile: {
        select: {
          fullName: true,
          nisn: true,
          class: { select: { name: true } },
        },
      },
    },
  },
} as const;

const applicationLetterInclude = {
  // Surat permohonan ronde lama (sebelum siswa ganti perusahaan) ditandai
  // TIDAK_BERLAKU oleh sistem, jadi tidak boleh dianggap sebagai surat aktif.
  where: { type: DocumentType.SURAT_PERMOHONAN, status: { not: DocumentStatus.TIDAK_BERLAKU } },
  orderBy: { createdAt: 'desc' as const },
  include: { files: { where: { isActive: true } } },
} as const;

const baseInclude = {
  ...studentInclude,
  company: { include: { industry: { select: { name: true } } } },
  cohort: true,
  major: true,
  documents: applicationLetterInclude,
} as const;

type RegistrationRaw = Prisma.RegistrationGetPayload<{ include: typeof baseInclude }>;

/**
 * Bentuk respons dipertahankan seperti relasi satu-dokumen yang lama: surat
 * permohonan aktif muncul sebagai `document` (bukan array), supaya konsumen
 * lama tidak perlu berubah.
 */
export type RegistrationWithRelations = Omit<RegistrationRaw, 'documents'> & {
  document: RegistrationRaw['documents'][number] | null;
};

const decorate = (row: RegistrationRaw): RegistrationWithRelations => {
  const { documents, ...rest } = row;
  return { ...rest, document: documents[0] ?? null };
};

/**
 * Repository pendaftaran PKL per siswa (Fase 1).
 */
export class RegistrationRepository {
  async findById(id: string): Promise<RegistrationWithRelations | null> {
    const row = await prisma.registration.findFirst({
      where: { id, deletedAt: null },
      include: baseInclude,
    });
    return row ? decorate(row) : null;
  }

  /**
   * Pendaftaran yang masih "hidup" milik seorang siswa.
   * DITOLAK ikut: siswa harus tetap melihat barisnya beserta `note` (alasan
   * penolakan admin) di Fase 1, bukan form kosong tanpa jejak penolakan.
   */
  async findActiveByStudent(studentId: string): Promise<RegistrationWithRelations | null> {
    const row = await prisma.registration.findFirst({
      where: {
        studentId,
        deletedAt: null,
        status: { in: ['DRAFT', 'DIAJUKAN', 'DISETUJUI', 'DITOLAK'] },
      },
      include: baseInclude,
      orderBy: { createdAt: 'desc' },
    });
    return row ? decorate(row) : null;
  }

  /**
   * Daftar untuk admin, diurutkan FIFO memakai `submittedAt` (tanggal diajukan),
   * BUKAN `createdAt`: satu siswa hanya punya satu baris per gelombang, jadi
   * baris yang ditolak lalu diajukan ulang tetap membawa createdAt & kode lama.
   * Dengan submittedAt, ajuan ulang otomatis pindah ke belakang antrean.
   * Catatan: MySQL menyusun NULL paling depan saat asc, sehingga baris DRAFT
   * (belum pernah diajukan) muncul lebih dulu — tidak masalah, tab default
   * "Belum Ditinjau" hanya berisi DIAJUKAN yang selalu punya submittedAt.
   */
  async paginate(
    where: Prisma.RegistrationWhereInput,
    skip: number,
    take: number
  ): Promise<{ items: RegistrationWithRelations[]; total: number }> {
    const base: Prisma.RegistrationWhereInput = { deletedAt: null, ...where };
    const [items, total] = await Promise.all([
      prisma.registration.findMany({
        where: base,
        skip,
        take,
        orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
        include: baseInclude,
      }),
      prisma.registration.count({ where: base }),
    ]);
    return { items: items.map(decorate), total };
  }

  async create(data: Prisma.RegistrationCreateInput): Promise<Registration> {
    return prisma.registration.create({ data });
  }

  async update(id: string, data: Prisma.RegistrationUpdateInput): Promise<Registration> {
    return prisma.registration.update({ where: { id }, data });
  }

  /** Hitung jumlah registrasi pada tahun tertentu (untuk generate kode). */
  async countByCodePrefix(prefix: string): Promise<number> {
    return prisma.registration.count({ where: { code: { startsWith: prefix } } });
  }
}

export const registrationRepository = new RegistrationRepository();

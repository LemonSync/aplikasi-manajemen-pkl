import { DocumentType, DocumentStatus, RegistrationStatus, StudentPhase, Role } from '@prisma/client';
import { randomInt } from 'crypto';
import { prisma } from '../config/prisma';
import { phaseScheduleRepository } from '../repositories/phaseSchedule.repository';
import { hashPassword, generateRandomPassword } from '../utils/password';
import { decryptCredential, encryptCredential } from '../utils/credentialCipher';
import { NotFoundError } from '../errors/AppError';
import { MESSAGES, PHASE_ORDER, ALLOWED_PHASE_TRANSITIONS } from '../config/constants';
import { autoAssignDudiMentors } from './dudiAssignment.service';

export interface WorkflowPhaseInfo {
  phase: StudentPhase;
  startDate: Date | null;
  endDate: Date | null;
}

export interface StudentWorkflowStatus {
  effectivePhase: StudentPhase | null;
  hasCompleted: boolean;
  currentSchedule: WorkflowPhaseInfo | null;
  nextSchedule: WorkflowPhaseInfo | null;
  registrationStatus: string | null;
  registrationDocumentId: string | null;
  isKetua: boolean;
  groupMembers: Array<{ username: string; fullName: string; temporaryPassword: string }> | null;
  dudiCredential: { fullName: string; username: string } | null;
  hasGroup: boolean;
  /** Kelompok sudah punya akun DUDI (mentor perusahaan) yang ditautkan? */
  dudiConnected: boolean;
  hasParentData: boolean;
  hasSuratPenerimaan: boolean;
  hasSuratPenerimaanPending: boolean;
  suratPenerimaanStatus: string | null;
  suratPenerimaanNote: string | null;
  hasSuratPernyataan: boolean;
  hasLaporanAkhir: boolean;
}

/**
 * Service yang menentukan fase efektif siswa berdasarkan jadwal fase (PhaseSchedule).
 * Fase efektif ditentukan oleh tanggal hari ini vs tanggal mulai/selesai fase pada gelombang siswa.
 * Bukan berdasarkan field User.phase, melainkan berdasarkan schedule.
 */
export class StudentWorkflowService {
  /**
   * Maju bertahap dari `fromPhase` ke `maxPhase` (fase jadwal hari ini).
   * Setiap langkah hanya dilakukan jika fase yang DITINGGALKAN sudah
   * diselesaikan (syarat dokumen), sehingga siswa tidak bisa meloncat
   * melewati tahap yang belum lengkap hanya karena kalender bergeser.
   * Tidak pernah menurunkan fase.
   */
  private async advancePhase(
    userId: string,
    fromPhase: StudentPhase,
    maxPhase: StudentPhase
  ): Promise<StudentPhase> {
    let phase: StudentPhase = fromPhase;
    while ((PHASE_ORDER[phase] ?? 0) < (PHASE_ORDER[maxPhase] ?? 0)) {
      const completed = await this.checkPhaseCompletion(userId, phase);
      if (!completed) break;
      const next = ALLOWED_PHASE_TRANSITIONS[phase]?.[0] as StudentPhase | undefined;
      if (!next) break;
      phase = next;
    }
    return phase;
  }

  /**
   * Sinkronkan fase database siswa dengan jadwal gelombangnya. Dipanggil oleh
   * phase guard agar aksi tidak bergantung pada nilai phase lama di JWT.
   * Fase hanya maju jika syarat dokumen fase sebelumnya terpenuhi.
   */
  async syncScheduledPhase(userId: string): Promise<StudentPhase | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { cohortId: true, phase: true, role: true },
    });
    if (!user || user.role !== Role.SISWA || !user.cohortId) return user?.phase ?? null;

    const currentSchedule = await this.getCurrentSchedule(user.cohortId);
    if (!currentSchedule) return user.phase;

    const startPhase = user.phase ?? StudentPhase.PRA_PKL;
    const target = await this.advancePhase(userId, startPhase, currentSchedule.phase);
    if (target !== user.phase) {
      await prisma.user.update({ where: { id: userId }, data: { phase: target } });
      return target;
    }
    return user.phase;
  }

  /**
   * Menentukan fase aktif sebuah gelombang pada tanggal hari ini.
   * Membandingkan tanggal saja (tanpa jam) menggunakan timezone lokal (WIB).
   * Ini memastikan "17 September" berarti sepanjang hari 17 Sep di WIB.
   */
  private async getCurrentSchedule(cohortId: string): Promise<WorkflowPhaseInfo | null> {
    const schedules = await phaseScheduleRepository.findByCohort(cohortId);
    // Bandingkan tanggal saja (ignore jam) menggunakan timezone lokal
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA'); // YYYY-MM-DD dalam timezone lokal
    for (const s of schedules) {
      if (s.startDate && s.endDate) {
        const startStr = new Date(s.startDate).toLocaleDateString('en-CA');
        const endStr = new Date(s.endDate).toLocaleDateString('en-CA');
        if (todayStr >= startStr && todayStr <= endStr) {
          return { phase: s.phase, startDate: s.startDate, endDate: s.endDate };
        }
      }
    }
    return null;
  }

  /**
   * Mencari jadwal fase berikutnya (setelah fase aktif saat ini).
   */
  private async getNextSchedule(cohortId: string, currentPhase: StudentPhase): Promise<WorkflowPhaseInfo | null> {
    const schedules = await phaseScheduleRepository.findByCohort(cohortId);
    const order: StudentPhase[] = [
      StudentPhase.PRA_PKL,
      StudentPhase.NON_PKL,
      StudentPhase.PKL_AKTIF,
      StudentPhase.PKL_SELESAI,
    ];
    const currentIdx = order.indexOf(currentPhase);

    for (let i = currentIdx + 1; i < order.length; i++) {
      const phase = order[i];
      const schedule = schedules.find((s) => s.phase === phase);
      if (schedule && schedule.startDate) {
        return { phase, startDate: schedule.startDate, endDate: schedule.endDate };
      }
    }
    return null;
  }

  /**
   * Mengecek apakah siswa sudah menyelesaikan persyaratan fase tertentu.
   */
  private async checkPhaseCompletion(userId: string, phase: StudentPhase): Promise<boolean> {
    switch (phase) {
      case StudentPhase.PRA_PKL: {
        // Selesai bila: ketua sudah mengajukan/menyetujui pendaftaran,
        // ATAU user sudah terdaftar sebagai anggota pendaftaran/kelompok.
        const [registration, regMember, groupMember] = await Promise.all([
          prisma.registration.findFirst({
            where: {
              leaderId: userId,
              status: { in: [RegistrationStatus.DIAJUKAN, RegistrationStatus.DISETUJUI] },
            },
            select: { id: true },
          }),
          prisma.registrationMember.findFirst({
            where: { userId },
            select: { id: true },
          }),
          prisma.groupMember.findFirst({
            where: { userId },
            select: { id: true },
          }),
        ]);
        return registration !== null || regMember !== null || groupMember !== null;
      }

      case StudentPhase.NON_PKL: {
        // Selesai jika surat pernyataan sudah disetujui admin
        const suratPernyataan = await prisma.document.findFirst({
          where: {
            ownerId: userId,
            type: DocumentType.SURAT_PERNYATAAN,
            status: DocumentStatus.DISETUJUI,
          },
        });
        return suratPernyataan !== null;
      }

      case StudentPhase.PKL_AKTIF: {
        const group = await prisma.group.findFirst({
          where: {
            deletedAt: null,
            status: { not: 'SELESAI' },
            members: { some: { userId } },
          },
        });
        return group !== null;
      }

      case StudentPhase.PKL_SELESAI: {
        const laporan = await prisma.document.findFirst({
          where: {
            ownerId: userId,
            type: DocumentType.LAPORAN_AKHIR,
            status: { in: [DocumentStatus.DISETUJUI, DocumentStatus.DIUNGGAH, DocumentStatus.MENUNGGU_VERIFIKASI] },
          },
        });
        return laporan !== null;
      }

      default:
        return false;
    }
  }

  /**
   * Mendapatkan status workflow siswa berdasarkan jadwal fase.
   * Ini adalah endpoint utama yang menentukan apa yang harus ditampilkan di UI siswa.
   */
  async getWorkflowStatus(userId: string): Promise<StudentWorkflowStatus> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError(MESSAGES.NOT_FOUND);
    if (!user.cohortId) {
      return {
        effectivePhase: null,
        hasCompleted: false,
        currentSchedule: null,
        nextSchedule: null,
        registrationStatus: null,
        registrationDocumentId: null,
        isKetua: false,
        groupMembers: null,
        dudiCredential: null,
        hasGroup: false,
        dudiConnected: false,
        hasParentData: false,
        hasSuratPenerimaan: false,
        hasSuratPenerimaanPending: false,
        suratPenerimaanStatus: null,
        suratPenerimaanNote: null,
        hasSuratPernyataan: false,
        hasLaporanAkhir: false,
      };
    }

    // Cek apakah user adalah ketua (punya pendaftaran)
    const ketuaRegistration = await prisma.registration.findFirst({
      where: { leaderId: userId, deletedAt: null },
      select: { id: true },
    });
    const isKetua = ketuaRegistration !== null;

    const currentSchedule = await this.getCurrentSchedule(user.cohortId);
    let effectivePhase = currentSchedule?.phase ?? null;

    // Fase efektif = jadwal hari ini, maju BERTAHAP mengikuti kelengkapan
    // dokumen. Siswa yang syaratnya belum lengkap tetap berada pada fase
    // sebelumnya (bahkan kalender sudah bergeser) sehingga tugas fase
    // sebelumnya masih bisa diselesaikan.
    if (effectivePhase) {
      if (user.role === Role.SISWA) {
        const startPhase = user.phase ?? StudentPhase.PRA_PKL;
        const target = await this.advancePhase(userId, startPhase, effectivePhase);
        if (target !== user.phase) {
          await prisma.user.update({ where: { id: userId }, data: { phase: target } });
        }
        effectivePhase = target;
      } else {
        // Akun KETUA sementara tidak punya fase sendiri; selalu mulai dari
        // PRA_PKL dan berhenti di NON_PKL (persyaratan pernyataan hanya milik
        // akun SISWA), sehingga alur ketua tidak pernah kosong.
        effectivePhase = await this.advancePhase(
          userId,
          StudentPhase.PRA_PKL,
          effectivePhase
        );
      }
    }

    // Cek status pendaftaran (termasuk members) — gunakan hasil query di atas
    const registration = isKetua
      ? await prisma.registration.findFirst({
          where: { leaderId: userId, deletedAt: null },
          include: { members: true },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    // Cek dokumen surat permohonan (terkait registrasi)
    let registrationDocumentId: string | null = null;
    if (registration) {
      const suratPermohonan = await prisma.document.findFirst({
        where: { registrationId: registration.id, type: DocumentType.SURAT_PERMOHONAN },
      });
      registrationDocumentId = suratPermohonan?.id ?? null;
    }

    // Cek kelompok — akun ketua sementara bukan anggota kelompok,
    // jadi cari juga lewat pendaftaran yang dipimpinnya.
    const groupWhere = isKetua
      ? { deletedAt: null, OR: [{ members: { some: { userId } } }, { registration: { leaderId: userId } }] }
      : { deletedAt: null, members: { some: { userId } } };
    const group = await prisma.group.findFirst({
      where: groupWhere,
      include: { members: { select: { userId: true } }, dudiMentors: { select: { id: true } } },
    });
    // Kelompok sudah terkoneksi DUDI bila minimal satu mentor perusahaan ditautkan.
    const dudiConnected = (group?.dudiMentors.length ?? 0) > 0;

    // Progres Surat Pernyataan seluruh anggota kelompok (dipakai tampilan ketua)
    let membersCount = 0;
    let membersApproved = 0;
    if (group) {
      const memberIds = group.members
        .map((m) => m.userId)
        .filter((id): id is string => id !== null);
      membersCount = memberIds.length;
      if (membersCount > 0) {
        membersApproved = await prisma.document.count({
          where: {
            ownerId: { in: memberIds },
            type: DocumentType.SURAT_PERNYATAAN,
            status: DocumentStatus.DISETUJUI,
          },
        });
      }
    }

    // Cek data orang tua
    const studentProfile = await prisma.studentProfile.findFirst({
      where: { userId },
      include: { parentData: true },
    });

    // Cek dokumen — surat penerimaan harus DISETUJUI (bukan cuma ada)
    const [suratPenerimaan, suratPenerimaanDoc, suratPernyataan, laporanAkhir] = await Promise.all([
      prisma.document.findFirst({
        where: { ownerId: userId, type: DocumentType.SURAT_PENERIMAAN, status: DocumentStatus.DISETUJUI },
      }),
      prisma.document.findFirst({
        where: { ownerId: userId, type: DocumentType.SURAT_PENERIMAAN, status: { not: DocumentStatus.DISETUJUI } },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.document.findFirst({
        where: {
          ownerId: userId,
          type: DocumentType.SURAT_PERNYATAAN,
          status: { not: DocumentStatus.DITOLAK },
        },
      }),
      prisma.document.findFirst({
        where: {
          ownerId: userId,
          type: DocumentType.LAPORAN_AKHIR,
          status: { not: DocumentStatus.DITOLAK },
        },
      }),
    ]);

    // Semua anggota kelompok sudah disetujui surat pernyataannya?
    const allMembersApproved = membersCount > 0 && membersApproved >= membersCount;

    let hasCompleted = false;
    if (effectivePhase) {
      if (isKetua && effectivePhase === StudentPhase.NON_PKL) {
        // Ketua dinilai dari kelengkapan seluruh anggota kelompoknya,
        // bukan dokumen milik akun ketua sementara.
        hasCompleted = allMembersApproved;
      } else {
        hasCompleted = await this.checkPhaseCompletion(userId, effectivePhase);
      }
    }

    const nextSchedule = effectivePhase
      ? await this.getNextSchedule(user.cohortId, effectivePhase)
      : null;

    // Perbaikan/backfill: provisioning juga membentuk Group dan GroupMember
    // untuk data yang sebelumnya hanya memiliki akun siswa.
    let groupMembers: Array<{ username: string; fullName: string; temporaryPassword: string }> | null = null;
    let dudiCredential: { fullName: string; username: string } | null = null;
    if (isKetua && suratPenerimaan && registration) {
      await this.provisionAfterAcceptance(userId);
      const provisionedRegistration = await prisma.registration.findUnique({
        where: { id: registration.id },
        include: { members: true },
      });
      if (provisionedRegistration) {
        groupMembers = await this.createMemberAccounts(provisionedRegistration, user.cohortId);
      }
      dudiCredential = await this.getDudiCredential(registration.id);
    }

    // Dokumen surat penerimaan yang belum disetujui: sedang menunggu verifikasi
    // (terkunci, tidak boleh diganti) atau sudah ditolak (boleh upload ulang).
    const pendingDoc =
      !suratPenerimaan && suratPenerimaanDoc && (suratPenerimaanDoc.status === DocumentStatus.MENUNGGU_VERIFIKASI || suratPenerimaanDoc.status === DocumentStatus.DIUNGGAH)
        ? suratPenerimaanDoc
        : null;

    return {
      effectivePhase,
      hasCompleted,
      currentSchedule,
      nextSchedule,
      registrationStatus: registration?.status ?? null,
      registrationDocumentId,
      isKetua,
      groupMembers,
      dudiCredential,
      hasGroup: group !== null,
      dudiConnected,
      hasParentData: studentProfile?.parentData !== null && studentProfile?.parentData !== undefined,
      hasSuratPenerimaan: suratPenerimaan !== null,
      hasSuratPenerimaanPending: pendingDoc !== null,
      suratPenerimaanStatus: suratPenerimaanDoc?.status ?? null,
      suratPenerimaanNote: suratPenerimaanDoc?.note ?? null,
      hasSuratPernyataan: isKetua ? allMembersApproved : suratPernyataan !== null,
      hasLaporanAkhir: laporanAkhir !== null,
    };
  }

  /**
   * Membuat akun untuk anggota kelompok yang belum punya akun.
   * Dipanggil saat surat penerimaan disetujui.
   */
  private async createMemberAccounts(
    registration: { id: string; members: Array<{ id: string; userId: string | null; fullName: string; nisn: string | null }> },
    cohortId: string | null
  ): Promise<Array<{ username: string; fullName: string; temporaryPassword: string }>> {
    const results: Array<{ username: string; fullName: string; temporaryPassword: string }> = [];

    for (const member of registration.members) {
      // Cari akun lama lewat userId, atau lewat NISN (username = NISN).
      // Akun yang dinonaktifkan saat gelombang ditutup IKUT ditemukan:
      // NISN adalah identitas permanen, jadi siswa yang sama pada gelombang
      // berikutnya memakai akun yang sama dan dipulihkan otomatis.
      const existingUser = member.userId
        ? await prisma.user.findUnique({
            where: { id: member.userId },
            select: { id: true, username: true, mustChangePassword: true, deletedAt: true, cohortId: true },
          })
        : member.nisn
          ? await prisma.user.findFirst({
              where: { username: member.nisn, role: Role.SISWA },
              select: { id: true, username: true, mustChangePassword: true, deletedAt: true, cohortId: true },
            })
          : null;

      if (existingUser) {
        // Pulihkan bila dinonaktifkan + pindahkan ke gelombang ini.
        if (existingUser.deletedAt || (cohortId && existingUser.cohortId !== cohortId)) {
          await prisma.user.update({
            where: { id: existingUser.id },
            data: { deletedAt: null, ...(cohortId ? { cohortId } : {}) },
          });
        }
        if (!member.userId) {
          await prisma.registrationMember.update({
            where: { id: member.id },
            data: { userId: existingUser.id },
          });
        }

        const credential = await prisma.initialCredential.findUnique({ where: { userId: existingUser.id } });
        let temporaryPassword = '(password telah diubah; hubungi Admin untuk reset)';
        if (credential) {
          temporaryPassword = decryptCredential(credential.encryptedPassword);
        } else if (existingUser.mustChangePassword) {
          // Migrasi mulus untuk akun anggota yang telah dibuat sebelum fitur
          // credential terenkripsi ditambahkan. Aman karena akun masih wajib
          // mengganti password pada login pertama.
          temporaryPassword = generateRandomPassword();
          await prisma.user.update({
            where: { id: existingUser.id },
            data: { passwordHash: await hashPassword(temporaryPassword) },
          });
          await prisma.initialCredential.upsert({
            where: { userId: existingUser.id },
            create: { userId: existingUser.id, encryptedPassword: encryptCredential(temporaryPassword) },
            update: { encryptedPassword: encryptCredential(temporaryPassword) },
          });
        }
        results.push({ username: existingUser.username, fullName: member.fullName, temporaryPassword });
        continue;
      }

      // Buat akun baru
      let nisn = member.nisn || `NISN${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
      while (await prisma.studentProfile.findFirst({ where: { nisn } })) {
        nisn = `NISN${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
      }

      const plainPassword = generateRandomPassword();
      const passwordHash = await hashPassword(plainPassword);

      const newUser = await prisma.user.create({
        data: {
          username: nisn,
          identifier: nisn,
          passwordHash,
          role: Role.SISWA,
          phase: StudentPhase.NON_PKL, // Anggota langsung di NON_PKL (ketua sudah handle PRA_PKL)
          cohortId: cohortId || undefined,
          mustChangePassword: true,
          studentProfile: {
            create: { fullName: member.fullName, nisn },
          },
        },
      });

      await prisma.registrationMember.update({
        where: { id: member.id },
        data: { userId: newUser.id },
      });
      await prisma.initialCredential.upsert({
        where: { userId: newUser.id },
        create: { userId: newUser.id, encryptedPassword: encryptCredential(plainPassword) },
        update: { encryptedPassword: encryptCredential(plainPassword) },
      });

      results.push({ username: nisn, fullName: member.fullName, temporaryPassword: plainPassword });
    }

    return results;
  }

  /**
   * Provisioning Fase 2 yang dipanggil saat surat penerimaan disetujui.
   * Idempoten: aman dipanggil ulang tanpa menggandakan akun anggota/DUDI.
   */
  async provisionAfterAcceptance(leaderId: string): Promise<void> {
    const registration = await prisma.registration.findFirst({
      where: { leaderId, deletedAt: null },
      include: { members: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!registration) return;

    // Jangan pernah menautkan akun KETUA sementara ke RegistrationMember.
    // Baris isLeader di sini adalah *siswa ketua kelompok*, yang harus memiliki
    // akun SISWA terpisah setelah provisioning seperti anggota lainnya.
    await this.createMemberAccounts(registration, registration.cohortId);

    // Perusahaan dipakai ulang lintas gelombang: akun DUDI hanya dibuat sekali
    // (bila perusahaan belum punya mentor), dari akun acak yang dibuat bersamaan
    // dengan akun siswa di Fase 2.
    let company = await prisma.company.findFirst({ where: { name: registration.companyName, deletedAt: null } });
    if (!company) {
      company = await prisma.company.create({
        data: {
          name: registration.companyName,
          address: registration.companyAddress,
          phone: registration.companyPhone,
          city: registration.companyCity,
        },
      });
    }

    // Bentuk kelompok resmi otomatis dari data Fase 1. Tanpa record ini,
    // akun SISWA tidak akan dapat melakukan absensi/jurnal pada Fase 3.
    const existingGroup = await prisma.group.findFirst({
      where: { registrationId: registration.id, deletedAt: null },
    });
    if (existingGroup) {
      await this.ensureDudiAccount(company, existingGroup.id, existingGroup.cohortId);
      return;
    }

    const provisionedMembers = await prisma.registrationMember.findMany({
      where: { registrationId: registration.id, userId: { not: null } },
      select: { userId: true, isLeader: true },
    });
    const studentIds = provisionedMembers
      .map((member) => member.userId)
      .filter((id): id is string => id !== null);
    if (studentIds.length === 0) return;

    const students = await prisma.user.findMany({
      where: { id: { in: studentIds }, role: Role.SISWA },
      select: { id: true },
    });
    if (students.length !== studentIds.length) {
      throw new Error('Provisioning kelompok gagal: anggota harus memiliki akun SISWA');
    }

    const prefix = `GRP-${new Date().getFullYear()}-`;
    const number = (await prisma.group.count({ where: { code: { startsWith: prefix } } })) + 1;
    const code = `${prefix}${String(number).padStart(4, '0')}`;
    const leaderStudentId = provisionedMembers.find((member) => member.isLeader)?.userId ?? studentIds[0];

    const createdGroup = await prisma.group.create({
      data: {
        name: registration.groupName,
        code,
        cohortId: registration.cohortId,
        companyId: company.id,
        majorId: registration.majorId,
        status: 'AKTIF',
        registrationId: registration.id,
        members: {
          create: studentIds.map((userId) => ({ userId, isLeader: userId === leaderStudentId })),
        },
      },
    });

    // Buat akun DUDI (username & password acak) bersamaan dengan akun siswa di
    // Fase 2, lalu tugaskan mentor DUDI perusahaan ke kelompok
    // (tanpa penugasan DUDI tidak melihat siswa: absensi/jurnal/nilai semua mengecek relasi ini)
    await this.ensureDudiAccount(company, createdGroup.id, createdGroup.cohortId);
  }

  /**
   * Auto-generate akun DUDI bersamaan dengan pembuatan akun siswa (Fase 2):
   * username & kata sandi acak — tidak perlu nama/no. HP mentor karena siswa
   * menyerahkan akunnya ke pembimbing perusahaan saat masa PKL dimulai.
   * Lewati pembuatan bila perusahaan sudah punya akun mentor (perusahaan dipakai
   * lintas gelombang). Selalu dorong penugasan mentor ke kelompok.
   */
  private async ensureDudiAccount(
    company: { id: string; name: string },
    groupId: string,
    cohortId: string
  ): Promise<void> {
    const existingMentors = await prisma.companyMentor.count({ where: { companyId: company.id } });
    if (existingMentors === 0) {
      let username = this.generateDudiUsername();
      while (
        await prisma.user.findFirst({
          where: { OR: [{ username }, { identifier: username }] },
          select: { id: true },
        })
      ) {
        username = this.generateDudiUsername();
      }

      const plainPassword = generateRandomPassword();
      const user = await prisma.user.create({
        data: {
          username,
          identifier: username,
          passwordHash: await hashPassword(plainPassword),
          role: Role.DUDI,
          cohortId,
          mustChangePassword: true,
        },
      });
      await prisma.companyMentor.create({
        data: { userId: user.id, companyId: company.id, fullName: `Mentor ${company.name}` },
      });
      await prisma.initialCredential.upsert({
        where: { userId: user.id },
        create: { userId: user.id, encryptedPassword: encryptCredential(plainPassword) },
        update: { encryptedPassword: encryptCredential(plainPassword) },
      });
    }
    await autoAssignDudiMentors(groupId, company.id);
  }

  /** Username acak untuk akun DUDI otomatis, mis. DUDI7K2M9Q (crypto.randomInt). */
  private generateDudiUsername(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars.charAt(randomInt(chars.length));
    return `DUDI${code}`;
  }

  /**
   * Info akun DUDI kelompok untuk ketua (hanya nama + username).
   * Password TIDAK pernah dikirim ke ketua/siswa — kredensial DUDI hanya
   * diakses Admin (GET /groups/:id/credentials atau reset password),
   * agar akun DUDI tidak bisa dipakai anggota kelompok untuk
   * memverifikasi absensi/jurnal atau menilai dirinya sendiri.
   */
  private async getDudiCredential(
    registrationId: string
  ): Promise<{ fullName: string; username: string } | null> {
    const group = await prisma.group.findFirst({
      where: { registrationId, deletedAt: null },
      include: {
        dudiMentors: {
          where: { isPrimary: true },
          include: { dudi: { select: { id: true, username: true } } },
        },
      },
    });
    const dudiUser = group?.dudiMentors[0]?.dudi;
    if (!dudiUser) return null;

    const mentor = await prisma.companyMentor.findUnique({
      where: { userId: dudiUser.id },
      select: { fullName: true },
    });
    return {
      fullName: mentor?.fullName ?? dudiUser.username,
      username: dudiUser.username,
    };
  }

  /**
   * Backfill aman untuk akun siswa lama: bila surat penerimaan kelompoknya telah
   * disetujui tetapi group belum terbentuk (bug versi lama), bentuk saat siswa
   * pertama kali mengakses fitur PKL.
   */
  async ensureGroupForStudent(studentId: string): Promise<void> {
    const member = await prisma.registrationMember.findFirst({
      where: { userId: studentId, registration: { deletedAt: null } },
      select: { registration: { select: { leaderId: true } } },
    });
    if (!member) return;

    const acceptance = await prisma.document.findFirst({
      where: {
        ownerId: member.registration.leaderId,
        type: DocumentType.SURAT_PENERIMAAN,
        status: DocumentStatus.DISETUJUI,
      },
      select: { id: true },
    });
    if (acceptance) await this.provisionAfterAcceptance(member.registration.leaderId);
  }
}

export const studentWorkflowService = new StudentWorkflowService();

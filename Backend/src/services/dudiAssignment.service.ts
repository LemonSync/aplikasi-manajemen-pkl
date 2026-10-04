import { prisma } from '../config/prisma';

/**
 * Penugasan DUDI (GroupDudiMentor) otomatis.
 *
 * Saat kelompok dibuat, seluruh mentor perusahaan (akun DUDI yang ditautkan
 * ke perusahaan kelompok) otomatis ditugaskan — tanpa ini, DUDI tidak melihat
 * siswa mana pun (absensi/jurnal/nilai/feedback semuanya mengecek relasi ini).
 *
 * Bersifat aditif & idempotent: penugasan manual admin tidak pernah dihapus,
 * hanya mentor perusahaan yang belum terdaftar yang ditambahkan.
 * Mentor pertama diangkat sebagai Utama bila kelompok belum punya Utama.
 */
export async function autoAssignDudiMentors(
  groupId: string,
  companyId: string | null | undefined
): Promise<number> {
  if (!companyId) return 0;

  const mentors = await prisma.companyMentor.findMany({
    where: { companyId },
    select: { userId: true },
    orderBy: { createdAt: 'asc' },
  });
  if (mentors.length === 0) return 0;

  // Perusahaan dipakai ulang lintas gelombang: bila akun mentor DUDI pernah
  // dinonaktifkan saat gelombang lama ditutup, pulihkan dulu supaya bisa
  // login & melihat kelompok gelombang baru ini.
  const mentorIds = mentors.map((m) => m.userId);
  const deactivated = await prisma.user.findMany({
    where: { id: { in: mentorIds }, deletedAt: { not: null } },
    select: { id: true },
  });
  if (deactivated.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: deactivated.map((u) => u.id) } },
      data: { deletedAt: null },
    });
  }

  const existing = await prisma.groupDudiMentor.findMany({
    where: { groupId },
    select: { dudiUserId: true, isPrimary: true },
  });
  const assigned = new Set(existing.map((row) => row.dudiUserId));
  const missing = mentors.filter((mentor) => !assigned.has(mentor.userId));
  if (missing.length === 0) return 0;

  const hasPrimary = existing.some((row) => row.isPrimary);
  await prisma.groupDudiMentor.createMany({
    data: missing.map((mentor, index) => ({
      groupId,
      dudiUserId: mentor.userId,
      isPrimary: !hasPrimary && index === 0,
    })),
    skipDuplicates: true,
  });

  return missing.length;
}

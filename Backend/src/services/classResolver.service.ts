import { prisma } from '../config/prisma';

/**
 * Util pemetaan kelas dari Master Siswa (StudentRegistry.className, mis. "XII-RPL-2")
 * ke baris Class (Class.name, mis. "XII RPL 2") + relasi StudentProfile.classId.
 *
 * Sebelum ada util ini, StudentProfile.classId selalu null sehingga halaman
 * Manajemen User, bimbingan guru, dan preview surat tidak menampilkan kelas.
 */

/** Normalisasi "XII-RPL-2" / "xii rpl 2" -> "XII RPL 2"; null bila tidak valid. */
export function normalizeClassName(registryClassName?: string | null): string | null {
  const raw = String(registryClassName ?? '').trim().toUpperCase();
  if (!raw) return null;
  const name = raw.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  // Minimal dua bagian: "XII RPL 2"
  return name.split(' ').length >= 2 ? name : null;
}

/** Cari atau buat baris Class untuk (gelombang, nama kelas). Return classId atau null. */
export async function resolveOrCreateClass(
  cohortId: string,
  registryClassName?: string | null
): Promise<string | null> {
  const name = normalizeClassName(registryClassName);
  if (!name) return null;

  const existing = await prisma.class.findUnique({
    where: { cohortId_name: { cohortId, name } },
  });
  if (existing) return existing.id;

  const parts = name.split(' ');
  const grade = parts[0] ?? null;
  const majorCode = parts[1] ?? null;
  // name sudah uppercase; kode jurusan di DB juga uppercase (RPL, DKV, ...)
  const major = majorCode ? await prisma.major.findFirst({ where: { code: majorCode } }) : null;

  const created = await prisma.class.create({
    data: { name, grade, cohortId, majorId: major?.id ?? null },
  });
  return created.id;
}

/** Peta NISN -> className mentah dari Master Siswa (untuk fallback banyak baris). */
export async function registryClassByNisn(nisns: Array<string | null | undefined>): Promise<Map<string, string>> {
  const valid = Array.from(new Set(nisns.filter((n): n is string => !!n)));
  if (valid.length === 0) return new Map();
  const rows = await prisma.studentRegistry.findMany({
    where: { nisn: { in: valid } },
    select: { nisn: true, className: true },
  });
  return new Map(rows.map((r) => [r.nisn, r.className]));
}

/** className untuk satu profil: preferensi Class.name, fallback ke Master Siswa. */
export async function classNameWithFallback(
  profile: { class?: { name: string } | null; nisn?: string | null } | null | undefined
): Promise<string | null> {
  if (!profile) return null;
  if (profile.class?.name) return profile.class.name;
  if (!profile.nisn) return null;
  const reg = await prisma.studentRegistry.findUnique({
    where: { nisn: profile.nisn },
    select: { className: true },
  });
  return reg?.className ?? null;
}

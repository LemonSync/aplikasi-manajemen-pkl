import { prisma } from '../config/prisma';
import { Role } from '@prisma/client';
import { ForbiddenError } from '../errors/AppError';
import { MESSAGES } from '../config/constants';

/**
 * Cakupan jurusan untuk actor.
 *  - { all: true }              → SUPER_ADMIN & KEPALA_SEKOLAH: semua jurusan.
 *  - { majorIds: string[] }     → ADMIN: hanya jurusan yang diawasi.
 *
 * Untuk ADMIN tanpa jurusan, `majorIds` = [] (tidak ada data yang terlihat).
 */
export type MajorScope = { all: true } | { majorIds: string[] };

/**
 * Resolve cakupan jurusan milik actor.
 * - SUPER_ADMIN / KEPALA_SEKOLAH → semua.
 * - ADMIN → daftar id jurusan yang diawasi (supervisedMajors).
 * - Role lain → dilarang memakai endpoint admin (Forbidden).
 */
export async function resolveScope(actor: { id: string; role: Role }): Promise<MajorScope> {
  if (actor.role === Role.SUPER_ADMIN || actor.role === Role.KEPALA_SEKOLAH) {
    return { all: true };
  }
  if (actor.role === Role.ADMIN) {
    const user = await prisma.user.findUnique({
      where: { id: actor.id },
      include: { supervisedMajors: { select: { id: true } } },
    });
    if (!user) throw new ForbiddenError(MESSAGES.AUTH.FORBIDDEN);
    return { majorIds: user.supervisedMajors.map((m) => m.id) };
  }
  throw new ForbiddenError(MESSAGES.AUTH.FORBIDDEN);
}

/** True bila scope menyertakan satu jurusan tertentu. */
export function scopeIncludes(scope: MajorScope, majorId: string | null | undefined): boolean {
  if (!majorId) return false;
  if ('all' in scope) return true;
  return scope.majorIds.includes(majorId);
}

/**
 * Prisma `where` fragment untuk mem-filter baris yang terhubung ke sebuah User
 * (student) agar hanya mencakup siswa dalam cakupan jurusan.
 *
 * Siswa dianggap dalam cakupan bila StudentProfile.majorId ATAU
 * StudentProfile.class.majorId termasuk `majorIds`.
 *
 * @param scope         hasil resolveScope()
 * @param relationField nama field relasi ke User pada model target
 *                      (mis. "student", "user", "owner", "author").
 * @returns object untuk di-AND-kan ke `where`, atau undefined bila scope=all.
 */
export function scopeUserWhere(
  scope: MajorScope,
  relationField: string
): Record<string, unknown> | undefined {
  if ('all' in scope) return undefined;
  const majorIds = scope.majorIds;
  // Scope kosong → tidak ada siswa yang cocok.
  if (majorIds.length === 0) {
    return { [relationField]: { id: { in: [] } } };
  }
  return {
    [relationField]: {
      studentProfile: {
        OR: [
          { majorId: { in: majorIds } },
          { class: { majorId: { in: majorIds } } },
        ],
      },
    },
  };
}

/**
 * Prisma `where` fragment untuk StudentRegistry (filter langsung kolom majorId).
 * @returns object untuk di-AND-kan ke `where`, atau undefined bila scope=all.
 */
export function scopeRegistryWhere(scope: MajorScope): Record<string, unknown> | undefined {
  if ('all' in scope) return undefined;
  if (scope.majorIds.length === 0) return { majorId: { in: [] } };
  return { majorId: { in: scope.majorIds } };
}

/**
 * And-kan beberapa where fragment (abaikan undefined/null).
 */
export function andWhere(...parts: Array<Record<string, unknown> | undefined>): Record<string, unknown> {
  const list = parts.filter((p): p is Record<string, unknown> => !!p);
  if (list.length === 0) return {};
  if (list.length === 1) return list[0]!;
  return { AND: list };
}

export const majorScopeService = {
  resolveScope,
  scopeIncludes,
  scopeUserWhere,
  scopeRegistryWhere,
  andWhere,
};

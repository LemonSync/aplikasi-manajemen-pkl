import { Role, StudentPhase, User } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { prisma } from '../config/prisma';
import { userRepository } from '../repositories/user.repository';
import { refreshTokenRepository } from '../repositories/refreshToken.repository';
import { comparePassword, hashPassword, isStrongPassword } from '../utils/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { UnauthorizedError, ForbiddenError, BadRequestError } from '../errors/AppError';
import { MESSAGES } from '../config/constants';
import { env } from '../config/env';
import { auditService } from './audit.service';
import { cohortService } from './cohortManage.service';
import { studentWorkflowService } from './studentWorkflow.service';
import { AUDIT_ACTIONS } from '../config/constants';

export interface LoginInput {
  identifier: string; // NISN / NIP / username
  password: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: Role;
  phase: StudentPhase | null;
  cohortId: string | null;
  mustChangePassword: boolean;
  /** Khusus role ADMIN: jurusan yang diawasi (kosong bila tidak ada). */
  supervisedMajors?: Array<{ id: string; code: string; name: string }>;
}

export interface LoginResult {
  user: AuthenticatedUser;
  tokens: AuthTokens;
}

/** Hash refresh token dengan SHA-256 sebelum disimpan ke DB (jangan simpan plain). */
const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Hitung tanggal kedaluwarsa refresh token dari string durasi (mis. "7d"). */
export const durationToDate = (duration: string): Date => {
  const match = /^(\d+)([smhd])$/.exec(duration);
  const now = Date.now();
  if (!match) return new Date(now + 7 * 24 * 60 * 60 * 1000);
  const value = Number(match[1]);
  const unitMs: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return new Date(now + value * unitMs[match[2]]);
};

const toAuthenticatedUser = (
  user: User & { supervisedMajors?: Array<{ id: string; code: string; name: string }> }
): AuthenticatedUser => ({
  id: user.id,
  username: user.username,
  role: user.role,
  phase: user.phase,
  cohortId: user.cohortId,
  mustChangePassword: user.mustChangePassword,
  ...(user.supervisedMajors ? { supervisedMajors: user.supervisedMajors } : {}),
});

/**
 * Service autentikasi: login, refresh (rotation), logout.
 */
export class AuthService {
  /** Membuat sepasang access + refresh token dan menyimpan hash refresh ke DB. */
  private async issueTokens(user: User, ctx: { userAgent?: string | null; ipAddress?: string | null }): Promise<AuthTokens> {
    const jti = randomUUID();
    const refreshToken = signRefreshToken({ sub: user.id, jti });
    const refreshTokenExpiresAt = durationToDate(env.JWT_REFRESH_EXPIRES_IN);

    await refreshTokenRepository.create({
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshTokenExpiresAt,
      userAgent: ctx.userAgent ?? null,
      ipAddress: ctx.ipAddress ?? null,
      user: { connect: { id: user.id } },
    });

    const accessToken = signAccessToken({
      sub: user.id,
      role: user.role,
      phase: user.phase,
      cohortId: user.cohortId,
    });

    return { accessToken, refreshToken, refreshTokenExpiresAt };
  }

  /**
   * Gerbang login/refresh SISWA: fase ditetapkan, gelombang global aktif, dan
   * tanggal hari ini termasuk salah satu jendela fase pada jadwal gelombang.
   * Mengembalikan fase hasil sinkronisasi jadwal (bukan kolom mentah) supaya
   * token dan UI memakai fase yang sama dengan kalender admin.
   */
  private async assertStudentAccess(user: User): Promise<StudentPhase | null> {
    if (user.role !== Role.SISWA) return user.phase;
    const activeCohortId = await cohortService.getActiveCohortId();
    if (!activeCohortId) throw new ForbiddenError(MESSAGES.AUTH.NO_ACTIVE_COHORT);
    if (!user.cohortId || user.cohortId !== activeCohortId) {
      throw new ForbiddenError(MESSAGES.AUTH.COHORT_INACTIVE);
    }

    // Gelombang tanpa jadwal bertanggal dianggap belum diatur (seed tidak
    // membuat PhaseSchedule) — siswa tidak boleh terkunci karenanya.
    const gate = await studentWorkflowService.getCalendarGate(user.cohortId);
    if (gate.hasDatedSchedule && !gate.activeToday) {
      throw new ForbiddenError(MESSAGES.AUTH.NO_ACTIVE_PHASE);
    }

    return studentWorkflowService.syncScheduledPhase(user.id);
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const user = await userRepository.findByIdentifierOrUsername(input.identifier.trim());

    // Selalu jalankan compare (meski user tak ada) untuk mengurangi timing attack.
    const valid = user ? await comparePassword(input.password, user.passwordHash) : false;

    if (!user || !valid || user.deletedAt) {
      throw new UnauthorizedError(MESSAGES.AUTH.INVALID_CREDENTIALS);
    }
    if (!user.isActive) {
      throw new ForbiddenError(MESSAGES.AUTH.ACCOUNT_INACTIVE);
    }

    // Gerbang login SISWA: gelombang aktif + jendela fase hari ini + fase tersinkron.
    const phase = await this.assertStudentAccess(user);

    const tokens = await this.issueTokens({ ...user, phase }, { userAgent: input.userAgent, ipAddress: input.ipAddress });
    await userRepository.updateLastLogin(user.id);
    await auditService.record({
      actorId: user.id,
      action: AUDIT_ACTIONS.LOGIN,
      entityType: 'USER',
      entityId: user.id,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return { user: toAuthenticatedUser({ ...user, phase }), tokens };
  }

  /** Refresh token rotation: token lama dicabut, token baru diterbitkan. */
  async refresh(oldRefreshToken: string, ctx: { userAgent?: string | null; ipAddress?: string | null }): Promise<LoginResult> {
    let payload;
    try {
      payload = verifyRefreshToken(oldRefreshToken);
    } catch {
      throw new UnauthorizedError(MESSAGES.AUTH.REFRESH_INVALID);
    }

    const hash = hashToken(oldRefreshToken);
    const stored = await refreshTokenRepository.findActiveByHash(hash);
    if (!stored) {
      // Deteksi reuse token yang sudah dicabut -> revoke semua sesi user (indikasi pencurian token).
      await refreshTokenRepository.revokeAllForUser(payload.sub);
      throw new UnauthorizedError(MESSAGES.AUTH.REFRESH_INVALID);
    }

    const user = await userRepository.findById(payload.sub);
    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedError(MESSAGES.AUTH.REFRESH_INVALID);
    }
    let phase: StudentPhase | null = user.phase;
    try {
      phase = await this.assertStudentAccess(user);
    } catch {
      await refreshTokenRepository.revoke(stored.id);
      throw new UnauthorizedError(MESSAGES.AUTH.REFRESH_INVALID);
    }

    await refreshTokenRepository.revoke(stored.id);
    const tokens = await this.issueTokens({ ...user, phase }, ctx);

    return { user: toAuthenticatedUser({ ...user, phase }), tokens };
  }

  async logout(refreshToken: string | undefined, actorId?: string): Promise<void> {
    if (refreshToken) {
      const stored = await refreshTokenRepository.findActiveByHash(hashToken(refreshToken));
      if (stored) await refreshTokenRepository.revoke(stored.id);
    }
    if (actorId) {
      await auditService.record({ actorId, action: AUDIT_ACTIONS.LOGOUT, entityType: 'USER', entityId: actorId });
    }
  }

  async me(userId: string): Promise<AuthenticatedUser> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { supervisedMajors: { select: { id: true, code: true, name: true } } },
    });
    if (!user) throw new BadRequestError(MESSAGES.NOT_FOUND);
    // Fase dikembalikan sesuai kalender gelombang, bukan kolom mentah, supaya
    // sidebar siswa berubah begitu admin menggeser jadwal.
    const phase =
      user.role === Role.SISWA ? await studentWorkflowService.syncScheduledPhase(user.id) : user.phase;
    return toAuthenticatedUser({ ...user, phase });
  }

  /**
   * Ganti password akun sendiri (wajib saat password sementara / reset admin).
   * Verifikasi password lama, wajib kuat, dan bersihkan flag mustChangePassword.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ctx: { userAgent?: string | null; ipAddress?: string | null }
  ): Promise<AuthenticatedUser> {
    const user = await userRepository.findById(userId);
    if (!user || user.deletedAt) throw new BadRequestError(MESSAGES.NOT_FOUND);

    const valid = await comparePassword(currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestError('Password lama salah');

    if (currentPassword === newPassword) {
      throw new BadRequestError('Password baru tidak boleh sama dengan password lama');
    }
    if (!isStrongPassword(newPassword)) {
      throw new BadRequestError('Password baru minimal 8 karakter dan harus mengandung huruf serta angka');
    }

    await userRepository.updatePassword(userId, await hashPassword(newPassword));
    // Password awal tidak berlaku lagi — hapus agar tidak bisa dibaca ulang.
    await userRepository.clearInitialCredential(userId);
    await auditService.record({
      actorId: userId,
      action: AUDIT_ACTIONS.UPDATE_USER,
      entityType: 'USER',
      entityId: userId,
      metadata: { action: 'CHANGE_PASSWORD' },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      phase: user.phase,
      cohortId: user.cohortId,
      mustChangePassword: false,
    };
  }
}

export const authService = new AuthService();

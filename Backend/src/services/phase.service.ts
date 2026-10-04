import { StudentPhase } from '@prisma/client';
import { prisma } from '../config/prisma';
import { auditService } from './audit.service';
import { ALLOWED_PHASE_TRANSITIONS } from '../config/constants';
import { BadRequestError, NotFoundError } from '../errors/AppError';
import { AUDIT_ACTIONS, ENTITY_TYPES, MESSAGES } from '../config/constants';

/**
 * State machine fase siswa.
 * Memvalidasi bahwa perpindahan fase hanya mengikuti alur yang diizinkan:
 * PRA_PKL -> NON_PKL -> PKL_AKTIF -> PKL_SELESAI
 */
export const assertValidPhaseTransition = (from: StudentPhase | null, to: StudentPhase): void => {
  if (!from) return;
  const allowed = ALLOWED_PHASE_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new BadRequestError(
      `${MESSAGES.PHASE_TRANSITION}: ${from} -> ${to}`,
      { from, to, allowed }
    );
  }
};

/** Peta urutan fase untuk kebutuhan tampilan/urutan. */
export const nextPhase = (from: StudentPhase | null): StudentPhase | null => {
  if (!from) return StudentPhase.PRA_PKL;
  const allowed = ALLOWED_PHASE_TRANSITIONS[from] ?? [];
  return (allowed[0] as StudentPhase) ?? null;
};

interface PhaseChangeContext {
  ipAddress?: string;
  userAgent?: string;
  /** Pihak yang memicu perubahan (admin), bila bukan siswa itu sendiri. */
  actorId?: string;
}

/**
 * Service perubahan fase siswa (state machine + audit).
 */
export class PhaseService {
  /** Melakukan transisi fase siswa dengan validasi state machine. */
  async transition(userId: string, to: StudentPhase, ctx: PhaseChangeContext = {}): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError(MESSAGES.NOT_FOUND);
    if (user.phase === to) return;
    assertValidPhaseTransition(user.phase, to);
    await prisma.user.update({ where: { id: userId }, data: { phase: to } });
    await auditService.record({
      actorId: ctx.actorId ?? userId,
      action: AUDIT_ACTIONS.PHASE_CHANGE,
      entityType: ENTITY_TYPES.USER,
      entityId: userId,
      metadata: { from: user.phase, to, triggeredBy: ctx.actorId ?? userId },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }

  /**
   * Memastikan siswa berada pada fase target (idempotent).
   * Bila fase saat ini belum mencapai target dan transisinya valid, lakukan transisi.
   */
  async ensurePhase(userId: string, target: StudentPhase, ctx: PhaseChangeContext = {}): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError(MESSAGES.NOT_FOUND);
    if (user.phase === target) return;
    const allowed = ALLOWED_PHASE_TRANSITIONS[user.phase ?? StudentPhase.PRA_PKL] ?? [];
    if (allowed.includes(target)) {
      await this.transition(userId, target, ctx);
    }
  }
}

export const phaseService = new PhaseService();

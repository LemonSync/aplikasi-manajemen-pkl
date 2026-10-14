import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { AUDIT_ACTIONS, ENTITY_TYPES, HTTP_STATUS, MESSAGES } from '../config/constants';
import { auditService } from '../services/audit.service';
import { getRequestContext } from '../utils/request';
import { logger } from '../config/logger';

/**
 * Deteksi intrusi / honeypot.
 *
 * Tujuan: merekam percobaan bypass / pemindaian (scanner) secara diam-diam.
 * Penyerang TIDAK diberi tahu apa pun — respons tetap 404 generik yang sama
 * dengan route tak dikenal, sehingga tidak ada informasi yang bocor dan
 * fingerprint server tetap seragam. Temuan dicatat ke audit log
 * (action SECURITY_ALERT) untuk ditindaklanjuti admin.
 *
 * Ruang pemindaian dipisah agar tidak salah-menuduh konten pengguna biasa:
 * - Frasa umpan (bait)  : dipindai dari URL + query + User-Agent + body.
 * - Pola serangan       : HANYA dari URL + query + User-Agent (probe struktural),
 *                         bukan isi body, supaya tulisan pengaduan siswa
 *                         yang kebetulan memuat kata teknis tidak ikut diblok.
 */

/** Frasa umpan khusus (bait) — string yang tidak wajar muncul dari pemakaian normal. */
const BAIT_PHRASES = ['halo polici', 'hemker amatiran'];

/** Decode URL-encoding agar frasa umpan di query tetap terdeteksi. */
const decodeSafe = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** Pola serangan umum pada URL/query/User-Agent. */
const ATTACK_SIGNATURES: RegExp[] = [
  /\.\.[/\\]/, // path traversal
  /(^|[/\\])\.(env|git|ssh)([/\\]|$)/i, // berkas sensitif
  /(union[\s/*]+select|information_schema|sleep\s*\(|benchmark\s*\()/i, // SQLi
  /(<script|onerror\s*=|javascript:)/i, // XSS
  /(etc\/passwd|boot\.ini|win\.ini)/i,
  /(wp-admin|wp-login|phpmyadmin|xmlrpc\.php|\.php)/i, // pemindai umum
  /(%2e%2e|%00|%2fetc)/i, // traversal/encoded
  /(curl\/|python-requests|nikto|sqlmap|nmap|masscan)/i, // scanner tooling
];

/** Kumpulkan bagian struktural (URL/query/UA) — untuk pola serangan. */
const collectStructuralParts = (req: Request): string[] => {
  const parts: string[] = [decodeSafe(req.originalUrl), decodeSafe(req.path)];
  const ua = req.headers['user-agent'];
  if (typeof ua === 'string') parts.push(ua);
  try {
    parts.push(JSON.stringify(req.query ?? {}));
  } catch {
    /* abaikan */
  }
  return parts;
};

/** Teks penuh (termasuk body) — untuk frasa umpan. */
const collectFullText = (req: Request): string => {
  const parts = [...collectStructuralParts(req), decodeSafe(req.originalUrl)];
  try {
    parts.push(JSON.stringify(req.body ?? {}));
  } catch {
    /* body tak bisa diserialkan — abaikan */
  }
  return parts.join(' ').toLowerCase();
};

/** Catat temuan keamanan (non-blocking). */
const recordIntrusion = (req: Request, reason: string, matched: string): void => {
  const ctx = getRequestContext(req);
  const requestId =
    (req as Request & { requestId?: string }).requestId ?? req.headers['x-request-id'] ?? randomUUID();

  logger.warn('SECURITY_ALERT: percobaan akses mencurigakan', {
    reason,
    matched,
    method: req.method,
    path: req.path,
    ip: ctx.ipAddress,
    requestId,
  });

  void auditService.record({
    action: AUDIT_ACTIONS.SECURITY_ALERT,
    entityType: ENTITY_TYPES.SECURITY,
    entityId: requestId.toString(),
    metadata: {
      reason,
      matched: matched.slice(0, 120),
      method: req.method,
      path: req.path,
      query: JSON.stringify(req.query),
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
};

/**
 * Middleware pemindai global. Bila menemukan indikasi serangan/umpan,
 * catat lalu balas 404 generik (stealth). Selainnya lanjut ke router.
 */
export const intrusionDetect = (req: Request, res: Response, next: NextFunction): void => {
  let reason: string | null = null;
  let matched = '';

  const full = collectFullText(req);
  for (const phrase of BAIT_PHRASES) {
    if (full.includes(phrase)) {
      reason = 'BAIT_PHRASE';
      matched = phrase;
      break;
    }
  }

  if (!reason) {
    const structuralParts = collectStructuralParts(req).map((p) => p.toLowerCase());
    outer: for (const part of structuralParts) {
      for (const sig of ATTACK_SIGNATURES) {
        const m = part.match(sig);
        if (m) {
          reason = 'ATTACK_SIGNATURE';
          matched = m[0];
          break outer;
        }
      }
    }
  }

  if (reason) {
    recordIntrusion(req, reason, matched);
    res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: MESSAGES.NOT_FOUND,
      data: null,
    });
    return;
  }

  next();
};

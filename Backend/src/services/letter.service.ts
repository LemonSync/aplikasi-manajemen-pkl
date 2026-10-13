import { DocumentType } from '@prisma/client';
import {
  renderFormalLetterPdf,
  renderPenugasanLetterPdf,
  LetterTable,
  PembimbingBlock,
  SchoolHeader,
  SignerBlock,
} from '../templates/letter.template';
import { saveBuffer } from '../utils/storage';
import { settingService } from './setting.service';
import { letterSignatoryRepository, generatedLetterRepository } from '../repositories/letter.repository';
import { prisma } from '../config/prisma';
import { formatDate } from '../utils/date';

export interface GenerateLetterInput {
  type: DocumentType;
  number?: string | null;
  hal?: string;
  /** Tanggal pada blok Nomor (default hari ini). */
  date?: Date;
  lampiran?: string;
  recipientLines?: string[];
  recipientCity?: string;
  paragraphs: string[];
  table?: LetterTable | null;
  pembimbing?: PembimbingBlock | null;
  closing?: string;
  cohortId?: string | null;
  createdById?: string | null;
  payload?: Record<string, unknown>;
}

export interface GeneratePenugasanInput {
  number?: string | null;
  dari: string;
  kepada: { nama: string; nip?: string | null; jabatan: string; unitKerja: string };
  dasar: string;
  isi: string;
  ketentuan: string;
  tujuan: Array<{ name: string; address: string }>;
  date?: Date;
  cohortId?: string | null;
  createdById?: string | null;
  payload?: Record<string, unknown>;
}

export interface GeneratedLetterResult {
  letterId: string;
  relativePath: string;
  signerName: string;
  signerNip: string | null;
}

/**
 * Service generasi surat PDF.
 * Mengambil penandatangan AKTIF lalu menyimpan snapshot nama/NIP ke surat,
 * sehingga perubahan pejabat di masa depan tidak mengubah surat lama.
 */
export class LetterService {
  private async resolveHeaderAndSigner(): Promise<{
    header: SchoolHeader;
    signer: SignerBlock;
    signatoryId: string;
  }> {
    const school = await settingService.getSchoolIdentity();
    // Surat otomatis harus tetap bisa terbit setelah database reset/deploy baru.
    // Admin tetap dapat mengganti pejabat ini lewat konfigurasi penandatangan.
    const signatory = await letterSignatoryRepository.findActive() ?? await prisma.letterSignatory.create({
      data: {
        name: 'Kepala Sekolah',
        nip: null,
        position: 'Kepala Sekolah',
        isActive: true,
      },
    });
    return {
      header: {
        government: school.government,
        dinas: school.dinas,
        schoolName: school.schoolName,
        programKeahlian: school.programKeahlian,
        address: school.schoolAddress,
        website: school.website,
        email: school.schoolEmail,
        npsn: school.npsn,
      },
      signer: {
        name: signatory.name,
        nip: signatory.nip,
        position: signatory.position,
        signaturePath: signatory.signaturePath,
      },
      signatoryId: signatory.id,
    };
  }

  private async persist(params: {
    type: DocumentType;
    number?: string | null;
    subject: string;
    signerName: string;
    signerNip: string | null;
    signatoryId: string;
    pdfBuffer: Buffer;
    cohortId?: string | null;
    createdById?: string | null;
    payload?: Record<string, unknown>;
  }): Promise<GeneratedLetterResult> {
    const filename = `${params.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
    const { relativePath } = saveBuffer('letters', filename, params.pdfBuffer);

    const letter = await generatedLetterRepository.create({
      type: params.type,
      number: params.number ?? null,
      subject: params.subject,
      signerName: params.signerName,
      signerNip: params.signerNip,
      pdfPath: relativePath,
      payload: (params.payload ?? {}) as never,
      ...(params.createdById ? { createdBy: { connect: { id: params.createdById } } } : {}),
      ...(params.cohortId ? { cohort: { connect: { id: params.cohortId } } } : {}),
      ...(params.signatoryId ? { signatory: { connect: { id: params.signatoryId } } } : {}),
    });

    return {
      letterId: letter.id,
      relativePath,
      signerName: params.signerName,
      signerNip: params.signerNip,
    };
  }

  /** Surat formal (permohonan/pengantar/monitoring/penjemputan) — layout resmi sekolah. */
  async generateLetter(input: GenerateLetterInput): Promise<GeneratedLetterResult> {
    const { header, signer, signatoryId } = await this.resolveHeaderAndSigner();
    const school = await settingService.getSchoolIdentity();

    const pdfBuffer = await renderFormalLetterPdf(header, {
      number: input.number ?? undefined,
      date: input.date,
      city: school.city,
      lampiran: input.lampiran,
      hal: input.hal,
      recipientLines: input.recipientLines,
      recipientCity: input.recipientCity,
      paragraphs: input.paragraphs,
      table: input.table ?? undefined,
      pembimbing: input.pembimbing ?? undefined,
      closing: input.closing,
      signer,
    });

    return this.persist({
      type: input.type,
      number: input.number ?? null,
      subject: input.hal ?? input.type,
      signerName: signer.name,
      signerNip: signer.nip ?? null,
      signatoryId,
      pdfBuffer,
      cohortId: input.cohortId ?? null,
      createdById: input.createdById ?? null,
      payload: input.payload,
    });
  }

  /** Surat penugasan pembimbing — layout Dari/Kepada/Dasar/Isi khusus. */
  async generatePenugasan(input: GeneratePenugasanInput): Promise<GeneratedLetterResult> {
    const { header, signer, signatoryId } = await this.resolveHeaderAndSigner();
    const school = await settingService.getSchoolIdentity();

    const pdfBuffer = await renderPenugasanLetterPdf(header, {
      number: input.number ?? undefined,
      dari: input.dari,
      kepada: input.kepada,
      dasar: input.dasar,
      isi: input.isi,
      ketentuan: input.ketentuan,
      tujuan: input.tujuan,
      date: input.date,
      kota: school.city,
      signer,
    });

    return this.persist({
      type: DocumentType.SURAT_PENUGASAN,
      number: input.number ?? null,
      subject: 'Surat Penugasan Pembimbing PKL',
      signerName: signer.name,
      signerNip: signer.nip ?? null,
      signatoryId,
      pdfBuffer,
      cohortId: input.cohortId ?? null,
      createdById: input.createdById ?? null,
      payload: input.payload,
    });
  }


  /**
   * Rentang tanggal masa PKL suatu gelombang dari PhaseSchedule
   * (PKL_AKTIF → PKL_SELESAI), diformat "13 Juli 2026 s.d 7 November 2026".
   * null bila jadwal belum diatur.
   */
  async getPklRangeText(cohortId: string | null): Promise<string | null> {
    if (!cohortId) return null;
    const [start, end] = await Promise.all([
      prisma.phaseSchedule.findUnique({
        where: { cohortId_phase: { cohortId, phase: 'PKL_AKTIF' } },
        select: { startDate: true },
      }),
      prisma.phaseSchedule.findUnique({
        where: { cohortId_phase: { cohortId, phase: 'PKL_SELESAI' } },
        select: { endDate: true },
      }),
    ]);
    const startText = start?.startDate ? formatDate(start.startDate) : null;
    const endText = end?.endDate ? formatDate(end.endDate) : null;
    if (startText && endText) return `${startText} s.d ${endText}`;
    if (startText) return `mulai ${startText}`;
    return null;
  }

  /** Tahun pelajaran dari nama gelombang (mis. "Gelombang 1 2026/2027" → "2026/2027"). */
  academicYearFromCohortName(cohortName: string | null | undefined): string | null {
    const match = cohortName?.match(/\d{4}\s*\/\s*\d{4}/);
    return match ? match[0].replace(/\s+/g, '') : null;
  }
}

export const letterService = new LetterService();

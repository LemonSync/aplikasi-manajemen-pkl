import { DocumentType } from '@prisma/client';
import { renderLetterPdf, LetterContent } from '../templates/letter.template';
import { saveBuffer } from '../utils/storage';
import { settingService } from './setting.service';
import { letterSignatoryRepository, generatedLetterRepository } from '../repositories/letter.repository';
import { NotFoundError } from '../errors/AppError';

export interface GenerateLetterInput {
  type: DocumentType;
  number?: string | null;
  title: string;
  recipientLines: string[];
  bodyParagraphs: string[];
  closing?: string;
  cohortId?: string | null;
  relatedGroupId?: string | null;
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
  async generateLetter(input: GenerateLetterInput): Promise<GeneratedLetterResult> {
    // 1. Penandatangan aktif (snapshot)
    const signatory = await letterSignatoryRepository.findActive();
    if (!signatory) {
      throw new NotFoundError('Penandatangan surat belum dikonfigurasi');
    }

    // 2. Identitas sekolah untuk kop surat
    const school = await settingService.getSchoolIdentity();

    const now = new Date();
    const content: LetterContent = {
      header: {
        schoolName: school.schoolName,
        schoolAddress: school.schoolAddress,
        schoolPhone: school.schoolPhone,
        schoolEmail: school.schoolEmail,
      },
      title: input.title,
      number: input.number ?? undefined,
      recipientLines: input.recipientLines,
      bodyParagraphs: input.bodyParagraphs,
      closing: input.closing,
      signer: {
        name: signatory.name,
        nip: signatory.nip,
        position: signatory.position,
        city: school.city,
        date: now,
      },
    };

    // 3. Render PDF -> buffer
    const pdfBuffer = await renderLetterPdf(content);

    // 4. Simpan ke storage
    const filename = `${input.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
    const { relativePath } = saveBuffer('letters', filename, pdfBuffer);

    // 5. Simpan record surat dengan snapshot tanda tangan
    const letter = await generatedLetterRepository.create({
      type: input.type,
      number: input.number ?? null,
      subject: input.title,
      signerName: signatory.name,
      signerNip: signatory.nip,
      pdfPath: relativePath,
      relatedGroupId: input.relatedGroupId ?? null,
      payload: (input.payload ?? {}) as never,
      ...(input.cohortId ? { cohort: { connect: { id: input.cohortId } } } : {}),
      ...(signatory.id ? { signatory: { connect: { id: signatory.id } } } : {}),
    });

    return {
      letterId: letter.id,
      relativePath,
      signerName: signatory.name,
      signerNip: signatory.nip,
    };
  }
}

export const letterService = new LetterService();

import PDFDocument from 'pdfkit';
import { formatDate } from '../utils/date';

/**
 * Template surat resmi berbasis PDFKit.
 * Semua surat memiliki kop surat sekolah + blok tanda tangan dinamis
 * (nama & NIP kepala sekolah snapshot per surat).
 *
 * Desain dibuat generik agar mudah disesuaikan dengan template resmi sekolah.
 */

export interface SchoolHeader {
  schoolName: string;
  schoolAddress: string;
  schoolPhone?: string;
  schoolEmail?: string;
  logoPath?: string | null;
}

export interface SignerBlock {
  name: string;
  nip?: string | null;
  position: string;
  city: string;
  date: Date;
}

export interface LetterContent {
  header: SchoolHeader;
  title: string;               // mis. "SURAT PERMOHONAN PRAKTIK KERJA LAPANGAN"
  number?: string;
  recipientLines: string[];    // tujuan surat
  bodyParagraphs: string[];    // isi surat (paragraf)
  closing?: string;
  signer: SignerBlock;
}

const MARGIN = 56;
const FONT = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';

/**
 * Menggambar kop surat (nama + alamat sekolah).
 */
const drawHeader = (doc: PDFKit.PDFDocument, header: SchoolHeader): void => {
  if (header.logoPath) {
    try {
      doc.image(header.logoPath, MARGIN, 40, { width: 60 });
    } catch {
      // abaikan bila logo gagal dimuat
    }
  }

  doc.font(FONT_BOLD).fontSize(16).text(header.schoolName.toUpperCase(), MARGIN, 48, {
    align: 'center',
  });
  doc.font(FONT).fontSize(10);
  doc.text(header.schoolAddress, { align: 'center' });
  const contact = [header.schoolPhone, header.schoolEmail].filter(Boolean).join(' | ');
  if (contact) doc.text(contact, { align: 'center' });

  // Garis pemisah kop
  const y = doc.y + 6;
  doc.moveTo(MARGIN, y).lineTo(doc.page.width - MARGIN, y).lineWidth(1.5).stroke();
  doc.moveTo(MARGIN, y + 3).lineTo(doc.page.width - MARGIN, y + 3).lineWidth(0.5).stroke();
  doc.y = y + 16;
};

/**
 * Menghasilkan Buffer PDF dari konten surat.
 */
export const renderLetterPdf = (content: LetterContent): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      drawHeader(doc, content.header);

      // Judul + nomor surat
      doc.font(FONT_BOLD).fontSize(13).text(content.title.toUpperCase(), { align: 'center' });
      if (content.number) {
        doc.font(FONT).fontSize(11).text(`Nomor: ${content.number}`, { align: 'center' });
      }
      doc.moveDown(1.5);

      // Tujuan surat (recipient)
      doc.font(FONT).fontSize(11);
      content.recipientLines.forEach((line, i) => {
        doc.text(i === 0 ? line : line, { indent: 0 });
      });
      doc.moveDown(1);

      // Isi surat
      content.bodyParagraphs.forEach((paragraph) => {
        doc.text(paragraph, { align: 'justify', lineGap: 4 });
        doc.moveDown(0.6);
      });

      if (content.closing) {
        doc.moveDown(0.4);
        doc.text(content.closing, { align: 'justify', lineGap: 4 });
      }

      // Blok tanda tangan
      doc.moveDown(2);
      const signX = doc.page.width - MARGIN - 220;
      doc.text(`${content.signer.city}, ${formatDate(content.signer.date)}`, signX, doc.y, {
        width: 220,
        align: 'left',
      });
      doc.moveDown(0.4);
      doc.text(content.signer.position, signX, doc.y, { width: 220 });
      doc.moveDown(3);
      doc.font(FONT_BOLD).text(content.signer.name, signX, doc.y, { width: 220 });
      doc.font(FONT);
      if (content.signer.nip) {
        doc.text(`NIP. ${content.signer.nip}`, signX, doc.y, { width: 220 });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

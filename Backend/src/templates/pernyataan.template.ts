import PDFDocument from 'pdfkit';
import { PERNYATAAN_LAYOUT as P, PERNYATAAN_TEXT as T } from '../config/pernyataan.config';
import { createPdfLayout, PDFDocType } from './pdf-layout';

/**
 * Surat Pernyataan Peserta PKL (Fase 2 — pendaftaran ulang).
 *
 * Meniru `Backend/surat_pkl/surat pernyataan pkl.pdf` — formulir kosong dari
 * sekolah — persis: Times 11 pt, baris nilai berujung garis titik-titik, butir
 * bernomor tanpa hanging indent, dan blok tanda tangan tiga kolom bertanggal di
 * kolom kanan. Semua angkanya ada di `config/pernyataan.config.ts`.
 * Formulir aslinya memang tidak punya kop surat.
 */

export interface PernyataanPdfData {
  namaSiswa: string;
  kelasJurusan: string;
  namaOrtu: string;
  alamatSiswa: string;
  hpOrtu: string;
  hpSiswa: string;
  tempatPkl: string;
  tanggalPkl: string;
  tahunPelajaran: string;
  namaSekolah: string;
  namaWaliKelas: string;
  kota: string;
  tanggalSurat: string;
}

/**
 * Garis nilai formulir: `[1] 0 d` + `1 w` di PDF asli = titik 1 pt, jarak 1 pt.
 * `dash(1, { space: 1 })` menghasilkan array dash yang sama.
 */
const valueRule = (doc: PDFDocType, baseline: number): void => {
  doc
    .lineWidth(P.stroke.rule)
    .lineCap('butt')
    .strokeColor('black')
    .dash(1, { space: 1 })
    .moveTo(P.x.ruleLeft, baseline)
    .lineTo(P.x.right, baseline)
    .stroke();
  doc.undash();
};

const rule = (
  doc: PDFDocType,
  x0: number,
  x1: number,
  y: number,
  width: number
): void => {
  doc.lineWidth(width).strokeColor('black').moveTo(x0, y).lineTo(x1, y).stroke();
};

export const renderPernyataanPdf = (data: PernyataanPdfData): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: {
          top: P.page.marginX,
          bottom: P.page.marginBottom,
          left: P.page.marginX,
          right: P.page.marginX,
        },
        info: { Title: 'Surat Pernyataan Peserta PKL' },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const { measure, putLine, putParagraph, ensureRoom } = createPdfLayout({
        fonts: { regular: 'Times-Roman', bold: 'Times-Bold', italic: 'Times-Italic' },
        ascender: P.metrics.ascender,
        defaultX: P.x.left,
        defaultPitch: P.pitch.line,
        contentBottom: P.contentBottom,
        continuationTop: P.continuationTop,
      });

      const size = P.size.body;
      const style = { size };
      const bodyWidth = P.x.right - P.x.left;
      let b: number = P.firstBaseline;

      // --- Judul: tebal 12 pt, rata tengah, garis bawah sepanjang teksnya ---
      const titleStyle = { size: P.size.title, bold: true };
      const titleWidth = measure(doc, T.title, titleStyle);
      const titleX = P.x.centerX - titleWidth / 2;
      putLine(doc, T.title, b, { center: P.x.centerX }, titleStyle);
      rule(doc, titleX, titleX + titleWidth, b + 0.8, P.stroke.title);
      b += P.gap.afterTitle;

      // --- Pembuka ---
      b = putParagraph(doc, T.intro, P.x.left, b, { width: bodyWidth, size, align: 'left' });

      // --- Blok data: label, titik dua, nilai di atas garis titik-titik ---
      b += P.gap.beforeRows;
      const rows: Array<[string, string]> = [
        [T.labels.namaSiswa, data.namaSiswa],
        [T.labels.kelasJurusan, data.kelasJurusan],
        [T.labels.namaOrtu, data.namaOrtu],
        [T.labels.alamatSiswa, data.alamatSiswa],
        [T.labels.hpOrtu, data.hpOrtu],
        [T.labels.hpSiswa, data.hpSiswa],
        [T.labels.tempatPkl, data.tempatPkl],
      ];
      let lastRule = b;
      for (const [label, value] of rows) {
        putLine(doc, label, b, { x: P.x.left }, style);
        putLine(doc, ':', b, { x: P.x.colon }, style);
        // Garis nilai ada di bawah BARIS TERAKHIR nilai — sama seperti
        // border-bottom pada sel tabel, nilai panjang boleh turun ke baris 2.
        const last = putParagraph(doc, value, P.x.value, b, {
          width: P.x.right - P.x.value,
          size,
          align: 'left',
        });
        lastRule = last + P.gap.ruleOffset;
        valueRule(doc, lastRule);
        b = lastRule + P.gap.afterRule;
      }

      // --- Kutipan regulasi & kalimat pernyataan ---
      b = lastRule + P.gap.afterData;
      b = putParagraph(doc, T.regulation, P.x.left, b, { width: bodyWidth, size });
      b += P.gap.paragraph;
      b = putParagraph(
        doc,
        T.declaration(data.namaSekolah, data.tanggalPkl, data.tahunPelajaran),
        P.x.left,
        b,
        { width: bodyWidth, size }
      );

      // --- Butir pernyataan: "1. teks" satu blok, tanpa hanging indent ---
      b += P.gap.paragraph;
      T.items.forEach((item, i) => {
        b = putParagraph(doc, `${i + 1}. ${item}`, P.x.itemLeft, b, {
          width: P.x.right - P.x.itemLeft,
          size,
        });
        if (i < T.items.length - 1) b += P.gap.betweenItems;
      });

      // --- Penutup ---
      b += P.gap.afterItems;
      b = putParagraph(doc, T.closing, P.x.left, b, { width: bodyWidth, size });

      // --- Blok tanda tangan ---
      const top = ensureRoom(doc, b + P.gap.afterClosing, P.signatureBlockHeight);
      const [col1, col2, col3] = P.x.sigColumns;
      putLine(doc, T.signature.knowing, top, { x: col1 }, style);
      putLine(doc, `${data.kota},`, top, { x: col3 }, style);
      putLine(doc, data.tanggalSurat, top, { x: P.x.dateValue }, style);

      const roles = top + P.pitch.line;
      putLine(doc, T.signature.homeroom, roles, { x: col1 }, style);
      putLine(doc, T.signature.parent, roles, { x: col2 }, style);
      putLine(doc, T.signature.declarant, roles, { x: col3 }, style);

      const student = roles + P.pitch.line;
      putLine(doc, T.signature.student, student, { x: col3 }, style);

      const box = P.x.materaiBox;
      const boxTop = student + box.gapAbove;
      doc
        .lineWidth(0.75)
        .strokeColor('black')
        .rect(col3, boxTop, box.width, box.height)
        .stroke();
      const materaiStyle = { size: P.size.materai };
      const boxCenter = col3 + box.width / 2;
      T.signature.materai.forEach((line, i) => {
        putLine(doc, line, boxTop + box.textTop + i * box.textPitch, { center: boxCenter }, materaiStyle);
      });

      const dotsParent = roles + P.gap.toDots;
      const dotsStudent = student + P.gap.toDots;
      putLine(doc, T.signature.dots, dotsParent, { x: col1 }, style);
      putLine(doc, T.signature.dots, dotsParent, { x: col2 }, style);
      putLine(doc, T.signature.dots, dotsStudent, { x: col3 }, style);

      // Nama di bawah garis — tidak ada di formulir kosong, tapi surat hasil
      // sistem harus bisa diidentifikasi. Nama panjang dibungkus, tidak keluar
      // halaman.
      let namesBottom = dotsStudent + P.gap.afterDots;
      const nameAt = (column: number, baseline: number, text: string): void => {
        if (!text.trim()) return;
        const center = P.x.sigColumns[column] + P.x.dotWidth / 2;
        const x = Math.min(
          Math.max(center - P.x.nameWidth / 2, P.page.marginX),
          P.x.right - P.x.nameWidth
        );
        namesBottom = Math.max(
          namesBottom,
          putParagraph(doc, text, x, baseline, {
            width: P.x.nameWidth,
            size,
            align: 'center',
          })
        );
      };
      nameAt(0, dotsParent + P.gap.afterDots, data.namaWaliKelas);
      nameAt(1, dotsParent + P.gap.afterDots, data.namaOrtu && `(${data.namaOrtu})`);
      nameAt(2, dotsStudent + P.gap.afterDots, data.namaSiswa && `(${data.namaSiswa})`);

      putLine(doc, T.signature.note, namesBottom + P.gap.afterNames, { x: P.x.left }, {
        size: P.size.note,
        italic: true,
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

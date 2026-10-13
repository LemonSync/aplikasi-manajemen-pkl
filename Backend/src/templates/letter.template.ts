import PDFDocument from 'pdfkit';
import path from 'path';
import { formatDate } from '../utils/date';
import { readStoredFile } from '../utils/storage';
import { LETTER_LAYOUT, LETTER_TEXT } from '../config/letter.config';

type PDFDocType = InstanceType<typeof PDFDocument>;

/**
 * Template surat resmi SMKN 9 Medan — reproduksi persis surat contoh resmi:
 * kop (logo Pemprov Sumut + blok instansi + garis double), font Times,
 * blok Nomor/Lampiran/Hal, tabel berkepala abu-abu, blok tanda tangan,
 * footer nomor halaman.
 */

export interface SchoolHeader {
  government: string;
  dinas: string;
  schoolName: string;
  programKeahlian: string;
  address: string;
  website: string;
  email: string;
  npsn: string;
}

export interface SignerBlock {
  name: string;
  nip?: string | null;
  position: string;
  signaturePath?: string | null;
}

export interface LetterTable {
  columns: string[];
  rows: string[][];
  /** Lebar kolom opsional (dalam pt). Bila diisi sebagian, sisa dibagi rata. */
  widths?: number[];
  /** Rata kolom (default: kolom pertama center, sisanya left). */
  aligns?: Array<'left' | 'center' | 'right'>;
}

export interface PembimbingBlock {
  nama: string;
  nip?: string | null;
  alamat?: string | null;
  telp?: string | null;
}

/** Surat formal (permohonan / pengantar / monitoring / penjemputan). */
export interface FormalLetterInput {
  number?: string;
  /** Tanggal pada blok Nomor (default: hari ini). */
  date?: Date;
  /** Kota pada baris tanggal (default "Medan"). */
  city?: string;
  lampiran?: string;
  hal?: string;
  recipientLines?: string[];
  /** Kota setelah "Di-" (default: ikut city). */
  recipientCity?: string;
  paragraphs: string[];
  table?: LetterTable;
  pembimbing?: PembimbingBlock;
  closing?: string;
  signer: SignerBlock;
}

/** Surat penugasan pembimbing (layout khusus: Dari/Kepada/Dasar/Isi). */
export interface PenugasanLetterInput {
  number?: string;
  dari: string;
  kepada: { nama: string; nip?: string | null; jabatan: string; unitKerja: string };
  dasar: string;
  isi: string;
  ketentuan: string;
  tujuan: Array<{ name: string; address: string }>;
  /** Tanggal pada blok "Dikeluarkan di" (default: hari ini). */
  date?: Date;
  kota?: string;
  signer: SignerBlock;
}

const MARGIN = LETTER_LAYOUT.page.margin;
const FONT = 'Times-Roman';
const FONT_BOLD = 'Times-Bold';
const PAGE_BOTTOM = LETTER_LAYOUT.page.contentBottom; // batas konten sebelum footer
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo-sumut.png');

const pageWidth = (doc: PDFDocType): number => doc.page.width - MARGIN;

/** Gambar teks dengan dukungan **bold** inline. Mengembalikan y setelahnya. */
const drawRich = (
  doc: PDFDocType,
  text: string,
  x: number,
  y: number,
  opts: { width: number; align?: 'left' | 'center' | 'right' | 'justify'; size?: number; lineGap?: number } = {
    width: 100,
  }
): number => {
  const parts = text.split('**');
  const size = opts.size ?? LETTER_LAYOUT.fonts.body;
  const lineGap = opts.lineGap ?? 2.5;
  parts.forEach((part, i) => {
    const bold = i % 2 === 1;
    doc.font(bold ? FONT_BOLD : FONT).fontSize(size);
    const isLast = i === parts.length - 1;
    const textOpts: Parameters<PDFDocType['text']>[1] = {
      width: opts.width,
      lineGap,
      ...(opts.align && opts.align !== 'left' ? { align: opts.align } : {}),
      ...(!isLast ? { continued: true } : {}),
    };
    if (i === 0) doc.text(part, x, y, textOpts);
    else doc.text(part, textOpts);
  });
  return doc.y;
};

/** Kop surat persis surat contoh: logo + 4 baris instansi + garis double. */
const drawKop = (doc: PDFDocType, header: SchoolHeader): void => {
  const right = pageWidth(doc);
  const logoW = 72;
  const textX = MARGIN + 82;
  const textW = right - textX;

  try {
    doc.image(LOGO_PATH, MARGIN + 4, 30, { width: logoW });
  } catch {
    // logo opsional — bila gagal dimuat, kop tetap digambar
  }

  const y = 36;
  doc.font(FONT_BOLD).fontSize(LETTER_LAYOUT.fonts.header.government).text(header.government.toUpperCase(), textX, y, {
    width: textW,
    align: 'center',
    lineGap: 1,
  });
  doc.font(FONT_BOLD).fontSize(LETTER_LAYOUT.fonts.header.department).text(header.dinas.toUpperCase(), textX, doc.y, {
    width: textW,
    align: 'center',
    lineGap: 1,
  });
  doc.font(FONT_BOLD).fontSize(LETTER_LAYOUT.fonts.header.schoolName).text(header.schoolName.toUpperCase(), textX, doc.y + 1, {
    width: textW,
    align: 'center',
    lineGap: 2,
  });
  doc.font(FONT_BOLD).fontSize(LETTER_LAYOUT.fonts.header.program).text(header.programKeahlian, textX, doc.y + 1, {
    width: textW,
    align: 'center',
    lineGap: 1.5,
  });
  doc.font(FONT).fontSize(8).text(header.address, textX, doc.y, { width: textW, align: 'center', lineGap: 1 });

  // Baris website + email (biru + underline, persis contoh) + NPSN di kanan
  const npsnText = `NPSN : ${header.npsn}`;
  doc.font(FONT_BOLD).fontSize(8);
  const npsnW = doc.widthOfString(npsnText);
  const webY = doc.y + 1;
  const webW = textW - npsnW - 18;
  doc.fillColor('black').font(FONT).fontSize(8).text('Website:', textX, webY, { width: webW, continued: true });
  doc.text(`${header.website} `, { continued: true });
  doc.fillColor('#1155cc').text('Email: ', { continued: true, link: `mailto:${header.email}`, underline: false });
  doc.text(header.email, { link: `mailto:${header.email}`, underline: true });
  doc.fillColor('black').font(FONT_BOLD).fontSize(8).text(npsnText, right - npsnW, webY, { width: npsnW + 2 });
  doc.x = MARGIN;

  // Garis double pemisah kop
  const ruleY = Math.max(doc.y, webY + 12) + 6;
  doc
    .moveTo(MARGIN - 8, ruleY)
    .lineTo(right + 8, ruleY)
    .lineWidth(2.2)
    .strokeColor('black')
    .stroke();
  doc.moveTo(MARGIN - 8, ruleY + 3.2).lineTo(right + 8, ruleY + 3.2).lineWidth(0.8).stroke();
  doc.y = ruleY + 16;
  doc.x = MARGIN;
};

/** Tabel resmi: kepala abu-abu tebal center, border tipis, header ulang saat pindah halaman. */
const drawTable = (
  doc: PDFDocType,
  table: LetterTable,
  x: number,
  right: number,
  fontSize = 10
): void => {
  const padX = 5;
  const padY = 4;
  const total = right - x;
  const cols = table.columns.length;
  const widths = (() => {
    if (table.widths && table.widths.length === cols) {
      const given = table.widths.reduce((a, b) => a + b, 0);
      if (given <= total) {
        const rest = total - given;
        return table.widths.map((w) => w + rest / cols);
      }
    }
    return Array.from({ length: cols }, () => total / cols);
  })();
  const aligns = table.aligns ?? table.columns.map((_, i) => (i === 0 ? 'center' : ('left' as const)));

  const drawRow = (cells: string[], isHeader: boolean): void => {
    doc.font(isHeader ? FONT_BOLD : FONT).fontSize(fontSize);
    const heights = cells.map((cell, i) =>
      doc.heightOfString(String(cell ?? ''), { width: widths[i] - padX * 2, lineGap: 1 })
    );
    const rowH = Math.max(...heights, fontSize + 4) + padY * 2;

    if (doc.y + rowH > PAGE_BOTTOM) {
      doc.addPage();
      if (!isHeader) drawRow(table.columns, true);
    }

    const y0 = doc.y;
    let cx = x;
    cells.forEach((cell, i) => {
      if (isHeader) doc.fillColor('#e8e8e8').rect(cx, y0, widths[i], rowH).fill();
      doc.lineWidth(0.6).strokeColor('black').rect(cx, y0, widths[i], rowH).stroke();
      doc.font(isHeader ? FONT_BOLD : FONT).fontSize(fontSize).fillColor('black');
      doc.text(String(cell ?? ''), cx + padX, y0 + padY, {
        width: widths[i] - padX * 2,
        align: isHeader ? 'center' : aligns[i],
        lineGap: 1,
      });
      cx += widths[i];
    });
    doc.y = y0 + rowH;
    doc.x = x;
  };

  drawRow(table.columns, true);
  for (const row of table.rows) drawRow(row, false);
};

/** Blok "Dengan Pembimbing Sekolah" (surat pengantar). */
const drawPembimbing = (doc: PDFDocType, block: PembimbingBlock, x: number, right: number): void => {
  doc.font(FONT).fontSize(LETTER_LAYOUT.fonts.body);
  doc.text('Dengan Pembimbing Sekolah :', x, doc.y, { width: right - x });
  doc.moveDown(0.3);
  const fields: Array<[string, string]> = [
    ['N a m a', block.nama],
    ['N I P', block.nip ?? ''],
    ['Alamat', block.alamat ?? ''],
    ['No. Telp', block.telp ?? ''],
  ];
  for (const [label, value] of fields) {
    const y0 = doc.y;
      doc.font(FONT).fontSize(LETTER_LAYOUT.fonts.body).text(label, x, y0, { width: 60 });
    doc.text(':', x + 60, y0, { width: 10 });
    doc.text(value, x + 74, y0, { width: right - x - 74 });
    doc.y = Math.max(doc.y, y0 + 14);
  }
  doc.x = MARGIN;
};

/** Blok tanda tangan surat formal: jabatan center, jeda, nama tebal + NIP (tanpa baris tanggal). */
const drawSignFormal = (doc: PDFDocType, signer: SignerBlock): void => {
  // Blok tanda tangan tidak boleh terpotong antar halaman (butuh ~95pt).
  if (doc.y > 700) doc.addPage();
  const blockW = LETTER_LAYOUT.signature.formal.blockWidth;
  const x = pageWidth(doc) - blockW;
  doc.font(FONT).fontSize(LETTER_LAYOUT.fonts.body).text(signer.position, x, doc.y, { width: blockW, align: 'center' });
  doc.moveDown(0.5);
  // Jarak tanda tangan dibuat lebih rapat agar blok tidak terlalu turun.
  const nameY = doc.y + LETTER_LAYOUT.signature.formal.nameOffsetY;
  const signature = signer.signaturePath ? readStoredFile(signer.signaturePath) : null;
  if (signature) {
    // PNG canvas biasanya memiliki ruang kosong di sekeliling tinta; ukuran
    // diperbesar dan dinaikkan agar tanda tangan tampak jelas di atas nama.
  try {
    const image = LETTER_LAYOUT.signature.formal.image;
    doc.image(signature, x + image.offsetX, nameY + image.offsetY, { width: image.width, height: image.height });
  } catch { /* tanda tangan opsional */ }
  }
  doc.font(FONT_BOLD).fontSize(LETTER_LAYOUT.fonts.body).text(signer.name, x, nameY, { width: blockW, align: 'center' });
  doc.font(FONT).fontSize(LETTER_LAYOUT.fonts.body);
  if (signer.nip) doc.text(`NIP. ${signer.nip}`, x, doc.y, { width: blockW, align: 'center' });
  doc.x = MARGIN;
};

/** Footer nomor halaman "-- n of m --" (dipanggil setelah semua halaman terbentuk). */
const drawFooters = (doc: PDFDocType): void => {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc
      .font(FONT)
    .fontSize(LETTER_LAYOUT.fonts.footer)
      .fillColor('black')
      .text(`-- ${i + 1} of ${range.count} --`, 0, doc.page.height - 52, {
        width: doc.page.width,
        align: 'center',
        lineBreak: false,
      });
  }
};

/**
 * Render surat formal (permohonan/pengantar/monitoring/penjemputan).
 * Body mengikuti contoh resmi: blok Nomor kiri + tanggal kanan, recipient,
 * paragraf justify (di-indent ke kolom nilai), tabel, closing, tanda tangan.
 */
export const renderFormalLetterPdf = (
  header: SchoolHeader,
  input: FormalLetterInput
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: MARGIN, bottom: 40, left: MARGIN, right: MARGIN },
        bufferPages: true,
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

       drawKop(doc, header);

      const right = pageWidth(doc);
      const valueX = MARGIN + 84;
      const valueW = right - valueX;
      const city = input.city ?? 'Medan';
      const dateText = `${city}, ${formatDate(input.date ?? new Date())}`;

      // Blok Nomor / Lampiran / Hal + tanggal di kanan baris pertama
      doc.font(FONT).fontSize(11);
      const nomorY = doc.y;
    doc.text(LETTER_TEXT.labels.number, MARGIN, nomorY, { width: 64 });
      doc.text(':', MARGIN + 64, nomorY, { width: 12 });
      doc.text(input.number ?? '', valueX, nomorY, { width: valueW - 170 });
      doc.text(dateText, right - 170, nomorY, { width: 170, align: 'right' });
      let y = nomorY + 16;
    doc.text(LETTER_TEXT.labels.attachment, MARGIN, y, { width: 64 });
      doc.text(':', MARGIN + 64, y, { width: 12 });
      doc.text(input.lampiran ?? '-', valueX, y, { width: valueW });
      y += 16;
    doc.text(LETTER_TEXT.labels.subject, MARGIN, y, { width: 64 });
      doc.text(':', MARGIN + 64, y, { width: 12 });
      doc.text(input.hal ?? '', valueX, y, { width: valueW });
      doc.y = y + 24;

      // Kepada Yth + Di- (kota)
      if (input.recipientLines?.length) {
        doc.font(FONT).fontSize(11);
        const kY = doc.y;
    doc.text(LETTER_TEXT.labels.recipient, MARGIN, kY, { width: 64 });
        doc.text(':', MARGIN + 64, kY, { width: 12 });
        let ry = kY;
        input.recipientLines.forEach((line) => {
          if (!line) return;
          doc.text(line, valueX, ry, { width: valueW });
          ry = doc.y;
        });
        doc.y = ry + 6;
    doc.text(LETTER_TEXT.labels.place, MARGIN, doc.y, { width: 64 });
        doc.text(input.recipientCity ?? city, valueX + 12, doc.y, { width: valueW });
        doc.y += 20;
      }

      // Paragraf isi (justify, indent kolom nilai)
      for (const paragraph of input.paragraphs) {
         drawRich(doc, paragraph, valueX, doc.y, { width: valueW, align: 'justify', size: LETTER_LAYOUT.fonts.body, lineGap: 3 });
        doc.y += 8;
      }

      // Tabel daftar siswa
      if (input.table && input.table.rows.length > 0) {
        doc.y += 2;
        drawTable(doc, input.table, valueX, right);
        doc.y += 10;
      }

      // Blok pembimbing (surat pengantar)
      if (input.pembimbing) {
        drawPembimbing(doc, input.pembimbing, valueX, right);
        doc.y += 12;
      }

      if (input.closing) {
         drawRich(doc, input.closing, valueX, doc.y, { width: valueW, align: 'justify', size: LETTER_LAYOUT.fonts.body, lineGap: 3 });
        doc.y += 10;
      }

      // Tanda tangan
      doc.y += 16;
       drawSignFormal(doc, input.signer);

      drawFooters(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

/** Render surat penugasan pembimbing — layout persis contoh resmi. */
export const renderPenugasanLetterPdf = (
  header: SchoolHeader,
  input: PenugasanLetterInput
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: MARGIN, bottom: 40, left: MARGIN, right: MARGIN },
        bufferPages: true,
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

       drawKop(doc, header);

      const right = pageWidth(doc);

      // Judul + nomor (center)
      doc.y += 6;
      doc.font(FONT_BOLD).fontSize(14).text('SURAT PENUGASAN', MARGIN, doc.y, {
        width: right - MARGIN,
        align: 'center',
        underline: true,
      });
      doc.y += 6;
  doc.font(FONT).fontSize(LETTER_LAYOUT.fonts.body).text(`Nomor : ${input.number ?? ''}`, MARGIN, doc.y, {
        width: right - MARGIN,
        align: 'center',
      });
      doc.y += 22;

      // Blok info: label kolom lebar + nilai
      const labelX = MARGIN;
      const colonX = MARGIN + 110;
      const valX = MARGIN + 122;
      const valW = right - valX;

      doc.font(FONT).fontSize(11);
      let y0 = doc.y;
      doc.text(LETTER_TEXT.labels.from, labelX, y0, { width: 100 });
      doc.text(':', colonX, y0, { width: 12 });
      doc.text(input.dari, valX, y0, { width: valW });
      doc.y = Math.max(doc.y, y0 + 14);

      y0 = doc.y;
      doc.text(LETTER_TEXT.labels.to, labelX, y0, { width: 100 });
      doc.text(':', colonX, y0, { width: 12 });
      const nestedX = MARGIN + 168;
      let ny = y0;
      const nested: Array<[string, string]> = [
        ['N a m a', input.kepada.nama],
        ['N I P', input.kepada.nip ?? ''],
        ['Jabatan', input.kepada.jabatan],
        ['Unit Kerja', input.kepada.unitKerja],
      ];
      for (const [label, value] of nested) {
        doc.font(FONT).fontSize(11).text(label, nestedX, ny, { width: 76 });
        doc.text(':', nestedX + 76, ny, { width: 12 });
        doc.text(value, nestedX + 92, ny, { width: right - nestedX - 92 });
        ny = doc.y;
      }
      doc.y = ny + 14;

      doc.font(FONT).fontSize(11);
      y0 = doc.y;
      doc.text(LETTER_TEXT.labels.basis, labelX, y0, { width: 100 });
      doc.text(':', colonX, y0, { width: 12 });
      doc.y = drawRich(doc, input.dasar, valX, y0, { width: valW, align: 'justify', size: 11, lineGap: 2.5 });
      doc.y += 14;

      doc.font(FONT).fontSize(11);
      y0 = doc.y;
      doc.text(LETTER_TEXT.labels.content, labelX, y0, { width: 100 });
      doc.text(':', colonX, y0, { width: 12 });
      doc.y = drawRich(doc, input.isi, valX, y0, { width: valW, align: 'justify', size: 11, lineGap: 2.5 });
      doc.y += 14;

      // Tabel tujuan (full width)
      if (input.tujuan.length > 0) {
        drawTable(
          doc,
          {
            columns: ['No.', 'Tujuan', 'Alamat'],
            rows: input.tujuan.map((t, i) => [`${i + 1}.`, t.name, t.address]),
            widths: [40, 190],
            aligns: ['center', 'left', 'left'],
          },
          MARGIN,
          right
        );
        doc.y += 14;
      }

      doc.font(FONT).fontSize(11);
      y0 = doc.y;
      doc.text(LETTER_TEXT.labels.otherTerms, labelX, y0, { width: 100 });
      doc.text(':', colonX, y0, { width: 12 });
      doc.y = drawRich(doc, input.ketentuan, valX, y0, { width: valW, size: 11, lineGap: 2.5 });
      doc.y += 20;

      // Blok keluar + tanda tangan (kanan) — jangan sampai terpotong halaman (butuh ~130pt)
      if (doc.y > 650) doc.addPage();
       const signX = right - LETTER_LAYOUT.signature.penugasan.rightOffset;
       const signW = LETTER_LAYOUT.signature.penugasan.blockWidth;
      doc.font(FONT).fontSize(11);
      const kota = input.kota ?? 'Medan';
      const tgl = formatDate(input.date ?? new Date());
      let sy = doc.y;
       doc.text(LETTER_TEXT.labels.issuedAt, signX, sy, { width: 100 });
      doc.text(':', signX + 100, sy, { width: 12 });
      doc.text(kota, signX + 116, sy, { width: signW - 116 });
      sy = Math.max(doc.y, sy + 14);
       doc.text(LETTER_TEXT.labels.date, signX, sy, { width: 100 });
      doc.text(':', signX + 100, sy, { width: 12 });
      doc.text(tgl, signX + 116, sy, { width: signW - 116 });
      sy = Math.max(doc.y, sy + 14);
       const positionOffsetX = LETTER_LAYOUT.signature.penugasan.positionOffsetX;
       doc.text(input.signer.position, signX + positionOffsetX, sy, { width: signW - positionOffsetX, align: 'center' });
       const signature = input.signer.signaturePath ? readStoredFile(input.signer.signaturePath) : null;
       if (signature) {
         try {
           const image = LETTER_LAYOUT.signature.penugasan.image;
           doc.image(signature, signX + image.offsetX, sy + image.offsetY, { width: image.width, height: image.height });
       } catch { /* tanda tangan opsional */ }
       }
       doc.y = sy + (signature ? LETTER_LAYOUT.signature.penugasan.afterImageSpacing : LETTER_LAYOUT.signature.penugasan.withoutImageSpacing);
      doc.font(FONT_BOLD).text(input.signer.name, signX, doc.y, { width: signW, align: 'center' });
      doc.font(FONT);
      if (input.signer.nip) doc.text(`NIP. ${input.signer.nip}`, signX, doc.y, { width: signW, align: 'center' });

      drawFooters(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

import PDFDocument from 'pdfkit';
import path from 'path';
import { formatDate } from '../utils/date';
import { readStoredFile } from '../utils/storage';
import { LETTER_LAYOUT, LETTER_TEXT, LetterTablePreset } from '../config/letter.config';
import { createPdfLayout, PDFDocType, Align } from './pdf-layout';

const L = LETTER_LAYOUT;
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo-sumut.png');

/**
 * Surat dinas memakai Times (metric surat asli); ascender reguler & bold sama
 * sehingga bold inline tidak menggeser baseline.
 */
const { measure, putLine, putUnderline, ensureRoom, typeset, putParagraph } = createPdfLayout({
  fonts: { regular: 'Times-Roman', bold: 'Times-Bold' },
  ascender: L.metrics.ascender,
  defaultX: L.page.margin,
  defaultPitch: L.body.pitch,
  contentBottom: L.page.contentBottom,
  continuationTop: L.page.continuationTop,
});

/* ------------------------------------------------------------------ *
 * Tipe publik — dipakai letter.service.ts
 * ------------------------------------------------------------------ */

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
  /** Preset terukur; x/widths/aligns tetap boleh mengoverridenya. */
  preset?: LetterTablePreset;
  x?: number;
  widths?: number[];
  aligns?: Align[];
  size?: number;
  headerHeight?: number;
  rowHeight?: number;
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

/* ------------------------------------------------------------------ *
 * Kop surat
 * ------------------------------------------------------------------ */

const drawKop = (doc: PDFDocType, header: SchoolHeader): void => {
  const k = L.kop;
  try {
    doc.image(LOGO_PATH, k.logo.x, k.logo.top, { width: k.logo.width, height: k.logo.height });
  } catch {
    // logo opsional — kop tetap digambar bila file tidak ada
  }

  const centered = (
    text: string,
    line: { baseline: number; size: number; bold: boolean }
  ): void => {
    putLine(doc, text, line.baseline, { center: k.centerX }, { size: line.size, bold: line.bold });
  };
  centered(header.government.toUpperCase(), k.lines.government);
  centered(header.dinas.toUpperCase(), k.lines.department);
  centered(header.schoolName.toUpperCase(), k.lines.schoolName);
  centered(header.programKeahlian, k.lines.program);
  centered(header.address, k.lines.address);

  // Website + Email (email biru bergaris bawah); NPSN sebaris, di-anchor kanan.
  const size = k.lines.contact.size;
  const lead = `Website:${header.website} Email: `;
  const leadW = measure(doc, lead, { size });
  const emailW = measure(doc, header.email, { size });
  const startX = k.centerX - (leadW + emailW) / 2;
  const baseline = k.lines.contact.baseline;
  putLine(doc, lead, baseline, { x: startX }, { size });
  putLine(doc, header.email, baseline, { x: startX + leadW }, {
    size,
    color: k.contact.emailColor,
    link: `mailto:${header.email}`,
  });
  putUnderline(doc, header.email, baseline, startX + leadW, { size, color: k.contact.emailColor });
  putLine(doc, `NPSN : ${header.npsn}`, baseline, { right: k.contact.npsnRight }, {
    size,
    bold: true,
  });

  doc.lineWidth(k.rule.upperWidth).strokeColor('black');
  doc.moveTo(k.rule.x1, k.rule.upperY).lineTo(k.rule.x2, k.rule.upperY).stroke();
  doc.lineWidth(k.rule.lowerWidth);
  doc.moveTo(k.rule.x1, k.rule.lowerY).lineTo(k.rule.x2, k.rule.lowerY).stroke();
};

/* ------------------------------------------------------------------ *
 * Blok label : nilai
 * ------------------------------------------------------------------ */

const putLabelRow = (
  doc: PDFDocType,
  label: string,
  value: string | null | undefined,
  baseline: number,
  geometry: { x: number; colonX: number; valueX: number; size: number }
): void => {
  const style = { size: geometry.size };
  putLine(doc, label, baseline, { x: geometry.x }, style);
  putLine(doc, ':', baseline, { x: geometry.colonX }, style);
  putLine(doc, value, baseline, { x: geometry.valueX }, style);
};

/* ------------------------------------------------------------------ *
 * Tabel
 * ------------------------------------------------------------------ */

const resolveColumns = (
  table: LetterTable,
  preset: (typeof L.table.presets)[LetterTablePreset] | undefined,
  x: number
): { widths: number[]; right: number } => {
  const given = table.widths ?? preset?.widths;
  if (given && given.length === table.columns.length) {
    return { widths: given.map((w) => w), right: x + given.reduce((a, b) => a + b, 0) };
  }
  const width = (L.page.contentRight - x) / table.columns.length;
  return {
    widths: Array.from({ length: table.columns.length }, () => width),
    right: L.page.contentRight,
  };
};

interface TableModel {
  x: number;
  right: number;
  widths: number[];
  aligns: Align[];
  size: number;
  padX: number;
  rows: Array<{
    header: boolean;
    height: number;
    cells: Array<Array<{ text: string; width: number }>>;
  }>;
}

/**
 * Model tabel: tiap sel dibungkus sendiri; tinggi baris = tinggi baris dasar
 * + pitch untuk setiap baris tambahan (persis perilaku surat asli).
 */
const buildTable = (doc: PDFDocType, table: LetterTable): TableModel => {
  const preset = table.preset ? L.table.presets[table.preset] : undefined;
  const x = table.x ?? preset?.x ?? L.body.x;
  const { widths, right } = resolveColumns(table, preset, x);
  const size = table.size ?? L.table.size;
  const padX = preset?.padX ?? L.table.padX;
  const headerHeight = table.headerHeight ?? preset?.headerHeight ?? 27.75;
  const baseHeight = table.rowHeight ?? preset?.rowHeight ?? 27;
  const aligns: Align[] =
    table.aligns ??
    preset?.aligns ??
    Array.from({ length: table.columns.length }, (_, i) => (i === 0 ? 'center' : 'left'));

  const source = [
    { cells: table.columns, header: true },
    ...table.rows.map((cells) => ({ cells, header: false })),
  ];

  const rows = source.map(({ cells, header }) => {
    let lines = 1;
    const sel = widths.map((width, i) => {
      const text = cells[i] == null ? '' : String(cells[i]);
      const wrapped = text ? typeset(doc, text, size, width - padX * 2).lines : [];
      lines = Math.max(lines, wrapped.length);
      return wrapped.map((words) => ({
        text: words.map((w) => w.text).join(' '),
        width: measure(doc, words.map((w) => w.text).join(' '), { size, bold: header }),
      }));
    });
    const base = header ? headerHeight : baseHeight;
    return { header, cells: sel, height: Math.max(base, base + (lines - 1) * L.table.pitch) };
  });

  return { x, right, widths, aligns, size, padX, rows };
};

/**
 * Gambar tabel: kepala abu-abu bold center, border digambar SEKALI per segmen
 * (satu garis tiap batas baris + tiap batas kolom), header berulang saat tabel
 * lanjut ke halaman berikutnya. `top` = tepi atas header → tepi bawah tabel.
 */
const drawTable = (doc: PDFDocType, table: LetterTable, top: number): number => {
  const model = buildTable(doc, table);
  const { x, right, widths, aligns, size, padX, rows } = model;
  const firstBaseline = (rowTop: number): number =>
    rowTop + L.metrics.ascender * size + L.table.textPad;

  const drawRow = (row: TableModel['rows'][number], rowTop: number): void => {
    if (row.header) {
      doc.rect(x, rowTop, right - x, row.height).fill(L.table.headerFill);
      doc.fillColor('black');
    }
    const start = firstBaseline(rowTop);
    row.cells.forEach((cell, i) => {
      const left = x + widths.slice(0, i).reduce((a, b) => a + b, 0);
      cell.forEach((line, li) => {
        let tx = left + padX;
        if (row.header || aligns[i] === 'center') tx = left + (widths[i] - line.width) / 2;
        else if (aligns[i] === 'right') tx = left + widths[i] - padX - line.width;
        putLine(doc, line.text, start + li * L.table.pitch, { x: tx }, {
          size,
          bold: row.header,
        });
      });
    });
  };

  let y = top;
  let bounds: number[] = [y];
  const strokeGrid = (bottom: number): void => {
    doc.lineWidth(L.table.borderWidth).strokeColor('black');
    for (const yy of bounds) doc.moveTo(x, yy).lineTo(right, yy);
    doc.moveTo(x, bottom).lineTo(right, bottom);
    let cx = x;
    for (let i = 0; i <= widths.length; i++) {
      doc.moveTo(cx, bounds[0]).lineTo(cx, bottom);
      cx += widths[i] ?? 0;
    }
    doc.stroke();
  };

  for (const row of rows) {
    if (y + row.height > L.page.contentBottom) {
      strokeGrid(y);
      doc.addPage();
      y = L.page.continuationTop;
      bounds = [y];
      if (!row.header) {
        drawRow(rows[0], y);
        y += rows[0].height;
        bounds.push(y);
      }
    }
    drawRow(row, y);
    y += row.height;
    bounds.push(y);
  }
  strokeGrid(y);
  return y;
};

/* ------------------------------------------------------------------ *
 * Blok "Dengan Pembimbing Sekolah" (surat pengantar)
 * ------------------------------------------------------------------ */

const drawPembimbing = (doc: PDFDocType, block: PembimbingBlock, baseline: number): number => {
  const p = L.pembimbing;
  const size = L.body.size;
  putLine(doc, 'Dengan Pembimbing Sekolah :', baseline, { x: p.x }, { size });
  const rows: Array<[string, string | null | undefined]> = [
    ['N a m a', block.nama],
    ['N I P', block.nip],
    ['Alamat', block.alamat],
    ['No. Telp', block.telp],
  ];
  let b = baseline + p.pitch;
  for (const [label, value] of rows) {
    putLine(doc, label, b, { x: p.x }, { size });
    putLine(doc, ':', b, { x: p.colonX }, { size });
    putLine(doc, value, b, { x: p.colonX + 14 }, { size });
    b += p.pitch;
  }
  return b - p.pitch;
};

/* ------------------------------------------------------------------ *
 * Blok tanda tangan — rata kiri di x=344.7 pada ketiga surat asli
 * ------------------------------------------------------------------ */

const drawSignature = (doc: PDFDocType, signer: SignerBlock, positionBaseline: number): void => {
  const s = L.signature;
  putLine(doc, signer.position, positionBaseline, { x: s.x }, { size: s.size });
  const nameBaseline = positionBaseline + s.nameGap;

  const buffer = signer.signaturePath ? readStoredFile(signer.signaturePath) : null;
  if (buffer) {
    try {
      // openImage tidak ada di @types/pdfkit, tapi tersedia saat runtime.
      const image = (
        doc as unknown as { openImage(src: Buffer): { width: number; height: number } }
      ).openImage(buffer);
      const scale = Math.min(s.image.maxWidth / image.width, (s.nameGap - 14) / image.height);
      doc.image(buffer, s.x + s.image.offsetX, positionBaseline + s.image.offsetY, {
        width: image.width * scale,
      });
    } catch {
      // tanda tangan opsional
    }
  }

  putLine(doc, signer.name, nameBaseline, { x: s.x }, { size: s.size, bold: true });
  if (signer.nip) {
    putLine(doc, `${LETTER_TEXT.labels.nipPrefix} ${signer.nip}`, nameBaseline + s.nipPitch, {
      x: s.x,
    }, { size: s.size });
  }
};

const newLetterDoc = (): PDFDocType =>
  new PDFDocument({
    size: 'A4',
    margins: {
      top: L.page.margin,
      bottom: L.page.margin,
      left: L.page.margin,
      right: L.page.width - L.page.contentRight,
    },
  });

/* ------------------------------------------------------------------ *
 * Surat formal (permohonan / pengantar / monitoring / penjemputan)
 * ------------------------------------------------------------------ */

export const renderFormalLetterPdf = (
  header: SchoolHeader,
  input: FormalLetterInput
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = newLetterDoc();
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      drawKop(doc, header);

      const city = input.city ?? 'Medan';
      let b: number = L.kop.firstBaseline;

      // Nomor / Lampiran / Hal — tanggal rata kanan pada baris pertama.
      putLabelRow(doc, LETTER_TEXT.labels.number, input.number, b, L.label);
      putLine(doc, `${city}, ${formatDate(input.date ?? new Date())}`, b, {
        right: L.label.dateRight,
      }, { size: L.label.size });
      b += L.label.pitch;
      putLabelRow(doc, LETTER_TEXT.labels.attachment, input.lampiran ?? '-', b, L.label);
      b += L.label.pitch;
      putLabelRow(doc, LETTER_TEXT.labels.subject, input.hal, b, L.label);

      // Kepada Yth, lalu "Di-" pada baris sendiri dan kotanya satu baris di bawah
      // (persis surat asli — keduanya memang tidak sebaris).
      if (input.recipientLines?.length) {
        b += L.label.gapToRecipient;
        putLine(doc, LETTER_TEXT.labels.recipient, b, { x: L.label.x }, { size: L.label.size });
        putLine(doc, ':', b, { x: L.label.colonX }, { size: L.label.size });
        let row = b;
        for (const line of input.recipientLines) {
          if (!line) continue;
          putLine(doc, line, row, { x: L.label.valueX }, { size: L.label.size });
          row += L.label.pitch;
        }
        b = row;
        putLine(doc, LETTER_TEXT.labels.place, b, { x: L.recipient.placeX }, {
          size: L.label.size,
        });
        const place = input.recipientCity ?? city;
        if (place) {
          b += L.recipient.cityPitch;
          putLine(doc, place, b, { x: L.recipient.cityX }, { size: L.label.size });
        }
      }

      // Paragraf isi
      b += L.body.afterRecipient;
      let lastBody = b;
      for (const paragraph of input.paragraphs) {
        lastBody = putParagraph(doc, paragraph, L.body.x, b, {
          width: L.body.right - L.body.x,
          size: L.body.size,
        });
        b = lastBody + L.body.pitch + L.body.paragraphGap;
      }

      // Tabel daftar siswa
      if (input.table && input.table.rows.length > 0) {
        const bottom = drawTable(doc, input.table, lastBody + L.body.beforeTable);
        b = bottom + L.body.afterTable;
      }

      // Blok pembimbing (surat pengantar)
      if (input.pembimbing) {
        b = drawPembimbing(doc, input.pembimbing, b) + L.pembimbing.after;
      }

      // Penutup + tanda tangan
      let lastClosing = b;
      if (input.closing) {
        lastClosing = putParagraph(doc, input.closing, L.body.x, b, {
          width: L.body.right - L.body.x,
          size: L.body.size,
        });
      }
      drawSignature(
        doc,
        input.signer,
        ensureRoom(doc, lastClosing + L.body.beforeClosingSign, L.signature.blockHeight)
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

/* ------------------------------------------------------------------ *
 * Surat penugasan pembimbing
 * ------------------------------------------------------------------ */

export const renderPenugasanLetterPdf = (
  header: SchoolHeader,
  input: PenugasanLetterInput
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = newLetterDoc();
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      drawKop(doc, header);

      const p = L.penugasan;
      const style = { size: p.label.size };
      const width = L.page.contentRight - p.label.valueX;

      // Judul & nomor: rata tengah pada sumbu blok 304.7 (bukan tengah halaman)
      const title = LETTER_TEXT.assignment.title;
      const titleStyle = { size: p.title.size, bold: true };
      const titleWidth = measure(doc, title, titleStyle);
      putLine(doc, title, p.title.baseline, { center: p.title.centerX }, titleStyle);
      putUnderline(doc, title, p.title.baseline, p.title.centerX - titleWidth / 2, titleStyle);
      putLine(doc, `${LETTER_TEXT.labels.number} : ${input.number ?? ''}`, p.nomor.baseline, {
        center: p.title.centerX,
      }, style);

      let b = p.nomor.baseline + p.blockGap;
      putLabelRow(doc, LETTER_TEXT.labels.from, input.dari, b, p.label);

      // Kepada → blok nested Nama/NIP/Jabatan/Unit Kerja
      b += p.blockGap;
      putLine(doc, LETTER_TEXT.labels.to, b, { x: p.label.x }, style);
      putLine(doc, ':', b, { x: p.label.colonX }, style);
      const nested: Array<[string, string | null | undefined]> = [
        ['N a m a', input.kepada.nama],
        ['N I P', input.kepada.nip],
        ['Jabatan', input.kepada.jabatan],
        ['Unit Kerja', input.kepada.unitKerja],
      ];
      nested.forEach(([label, value], i) => {
        const y = b + i * p.nested.pitch;
        putLine(doc, label, y, { x: p.nested.x }, style);
        putLine(doc, ':', y, { x: p.nested.colonX }, style);
        putLine(doc, value, y, { x: p.nested.colonX + 14 }, style);
      });
      b += (nested.length - 1) * p.nested.pitch;

      // Dasar & Isi — titik dua hanya di baris pertama, nilai indent rata kiri
      b += p.blockGap;
      putLine(doc, LETTER_TEXT.labels.basis, b, { x: p.label.x }, style);
      putLine(doc, ':', b, { x: p.label.colonX }, style);
      b = putParagraph(doc, input.dasar, p.label.valueX, b, { width, size: p.label.size });

      b += p.blockGap;
      putLine(doc, LETTER_TEXT.labels.content, b, { x: p.label.x }, style);
      putLine(doc, ':', b, { x: p.label.colonX }, style);
      b = putParagraph(doc, input.isi, p.label.valueX, b, { width, size: p.label.size });

      // Tabel tujuan pembimbing
      const bottom = drawTable(
        doc,
        {
          preset: 'penugasan',
          columns: ['No.', 'Tujuan', 'Alamat'],
          rows: input.tujuan.map((t, i) => [`${i + 1}.`, t.name, t.address]),
        },
        b + p.beforeTable
      );
      b = bottom + p.afterTable;

      putLine(doc, LETTER_TEXT.labels.otherTerms, b, { x: p.label.x }, style);
      putLine(doc, ':', b, { x: p.label.colonX }, style);
      b = putParagraph(doc, input.ketentuan, p.label.valueX, b, {
        width,
        size: p.label.size,
        align: 'left',
      });

      // Blok keluar + tanda tangan
      const issued = ensureRoom(doc, b + p.beforeSign, L.signature.blockHeight + 2 * p.issued.pitch);
      putLine(doc, LETTER_TEXT.labels.issuedAt, issued, { x: L.signature.x }, style);
      putLine(doc, ':', issued, { x: p.issued.colonX }, style);
      putLine(doc, input.kota ?? 'Medan', issued, { x: p.issued.valueX }, style);
      const dateY = issued + p.issued.pitch;
      putLine(doc, LETTER_TEXT.labels.date, dateY, { x: L.signature.x }, style);
      putLine(doc, ':', dateY, { x: p.issued.colonX }, style);
      putLine(doc, formatDate(input.date ?? new Date()), dateY, { x: p.issued.valueX }, style);

      drawSignature(doc, input.signer, dateY + p.issued.pitch);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

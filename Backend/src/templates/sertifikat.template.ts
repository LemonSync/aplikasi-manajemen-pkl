import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import {
  PENILAIAN_SHEET,
  SERTIFIKAT_FLOW,
  SERTIFIKAT_FONTS,
  SERTIFIKAT_LAYOUT,
  SERTIFIKAT_PAGE,
  SERTIFIKAT_TEXT,
  SERTIFIKAT_X,
} from '../config/sertifikat.config';
import {
  PENILAIAN_FOOTNOTE,
  PENILAIAN_GROUPS,
  PENILAIAN_LEGEND,
  PENILAIAN_SCALE,
  predicateLabel,
} from '../config/penilaian.config';
import { createPdfLayout, PDFDocType, Word } from './pdf-layout';

/**
 * Renderer Sertifikat PKL 2 halaman (sertifikat + LEMBARAN PENILAIAN).
 *
 * Semua angka di berkas ini berasal dari Backend/surat_pkl/sertifikat.docx dan
 * tinggal dibaca ulang di sertifikat.config.ts. Sengaja tidak memakai alur
 * letter.template.ts: sertifikat punya grid kolom tetap (tanpa justify) sehingga
 * metrik surat dinas tidak bisa dipakai apa adanya.
 */

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const SANS_REGULAR_NAME = 'PklSans';
const SANS_ITALIC_NAME = 'PklSansItalic';

/** Nama font + ascender yang benar-benar terpakai (TTF bisa tidak ada di build). */
type SansFont = { regular: string; italic: string; ascender: number };

const registerSansFonts = (doc: PDFDocType): SansFont => {
  const regularPath = path.join(ASSETS_DIR, 'fonts', SERTIFIKAT_FONTS.sans.regularFile);
  const italicPath = path.join(ASSETS_DIR, 'fonts', SERTIFIKAT_FONTS.sans.italicFile);
  try {
    if (!fs.existsSync(regularPath) || !fs.existsSync(italicPath)) throw new Error('font tidak tersedia');
    doc.registerFont(SANS_REGULAR_NAME, regularPath);
    doc.registerFont(SANS_ITALIC_NAME, italicPath);
    return {
      regular: SANS_REGULAR_NAME,
      italic: SANS_ITALIC_NAME,
      ascender: SERTIFIKAT_FONTS.sans.ascender,
    };
  } catch {
    // Helvetica = sepupu metrik Arial; tata letak kolom tidak berubah.
    return { regular: 'Helvetica', italic: 'Helvetica-Oblique', ascender: 0.718 };
  }
};

const serifLayout = (): ReturnType<typeof createPdfLayout> =>
  createPdfLayout({
    fonts: { regular: 'Times-Roman', bold: 'Times-Bold', italic: 'Times-Italic' },
    ascender: SERTIFIKAT_FONTS.serif.ascender,
    defaultX: SERTIFIKAT_X.left,
    defaultPitch: 12 * SERTIFIKAT_FONTS.serif.pitch,
    contentBottom: SERTIFIKAT_X.contentBottom,
    continuationTop: SERTIFIKAT_LAYOUT.firstBaseline,
  });

const sansLayout = (font: SansFont): ReturnType<typeof createPdfLayout> =>
  createPdfLayout({
    fonts: { regular: font.regular, bold: font.regular, italic: font.italic },
    ascender: font.ascender,
    defaultX: SERTIFIKAT_X.left,
    defaultPitch: 12 * SERTIFIKAT_FONTS.sans.pitch,
    contentBottom: SERTIFIKAT_X.contentBottom,
    continuationTop: SERTIFIKAT_LAYOUT.firstBaseline,
  });

export interface SertifikatScoreRow {
  groupCode: string;
  code: string;
  label: string;
  score: number;
}

export interface SertifikatPdfData {
  /** Nomor sertifikat, mis. "400.10.5.4/001/SMKN9/X/2026". */
  number: string;
  /** Tanggal terbit yang sudah diformat lokal, mis. "17 November 2026". */
  issuedDateText: string;
  schoolName: string;
  companyName: string;
  studentName: string;
  className: string | null;
  majorName: string | null;
  nisn: string | null;
  birthLabel: string | null;
  pklRange: string | null;
  predicate: string | null;
  finalScore: number | null;
  rataRata: number | null;
  reportScore: number | null;
  rows: SertifikatScoreRow[];
  mentorName: string | null;
  guruName: string | null;
  guruNip: string | null;
  kepalaName: string | null;
  kepalaNip: string | null;
  /** Nama "Kepala Bagian Teknik dan Pengelolaan" — diketik siswa, boleh kosong. */
  kepalaBagianName: string | null;
  signatureBuffer?: Buffer | null;
  companyLogoBuffer?: Buffer | null;
  qrBuffer?: Buffer | null;
}

const scoreText = (value: number | null | undefined): string =>
  value === null || value === undefined ? '' : String(Math.round(value * 100) / 100);

const identityValue = (value: string | null | undefined): string => value?.trim() || '-';

/** Nomor kelas/kompetensi halaman 2 digabung dari data yang ada. */
const competencyText = (data: SertifikatPdfData): string => {
  if (!data.majorName) return '-';
  return data.majorName;
};

/* ------------------------------------------------------------------ *
 * Halaman 1 — sertifikat
 * ------------------------------------------------------------------ */

const drawLogos = (doc: PDFDocType, data: SertifikatPdfData): void => {
  if (!data.companyLogoBuffer) return;
  const { size, top } = SERTIFIKAT_LAYOUT.logo;
  try {
    // openImage tidak ada di @types/pdfkit, tapi tersedia saat runtime — dipakai
    // supaya logo non-persegi tetap jatuh tepat di tengah sumbu X halaman.
    const image = (doc as unknown as { openImage(src: Buffer): { width: number; height: number } }).openImage(
      data.companyLogoBuffer
    );
    const scale = Math.min(size / image.width, size / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    doc.image(data.companyLogoBuffer, SERTIFIKAT_X.center - width / 2, top + (size - height) / 2, { width });
  } catch {
    // logo perusahaan tidak terbaca → ruang kosong, tidak membatalkan terbit
  }
};

/** "Dengan Hasil :  [x] A  [ ] B  [ ] C  [ ] D" pada satu baseline terpusat. */
const drawResultLine = (
  doc: PDFDocType,
  serif: ReturnType<typeof createPdfLayout>,
  baseline: number,
  predicate: string | null
): void => {
  const { size: box, gapAfter } = SERTIFIKAT_LAYOUT.checkBox;
  const head = SERTIFIKAT_TEXT.withResult;
  const headStyle = { size: 14 };
  const headWidth = serif.measure(doc, head, headStyle);
  const gap = serif.measure(doc, '    ', headStyle);
  const letters = PENILAIAN_SCALE.map((s) => s.letter);
  const letterWidths = letters.map((l) => serif.measure(doc, l, headStyle));
  const groupWidths = letterWidths.map((w) => box + gapAfter + w);
  const total =
    headWidth + gap + groupWidths.reduce((a, b) => a + b, 0) + gap * (letters.length - 1);

  doc.fillColor('black');
  let x = SERTIFIKAT_X.center - total / 2;
  serif.putLine(doc, head, baseline, { x }, headStyle);
  x += headWidth + gap;
  letters.forEach((letter, i) => {
    drawCheckBox(doc, x, baseline, box, letter === predicate);
    x += box + gapAfter;
    serif.putLine(doc, letter, baseline, { x }, headStyle);
    x += letterWidths[i] + gap;
  });
};

const drawCheckBox = (doc: PDFDocType, x: number, baseline: number, size: number, checked: boolean): void => {
  const top = baseline - size * 0.72;
  doc.lineWidth(0.75).strokeColor('black').rect(x, top, size, size).stroke();
  if (!checked) return;
  doc
    .lineWidth(1.2)
    .moveTo(x + size * 0.2, top + size * 0.55)
    .lineTo(x + size * 0.43, top + size * 0.78)
    .lineTo(x + size * 0.84, top + size * 0.22)
    .stroke();
};

const drawCover = (
  doc: PDFDocType,
  data: SertifikatPdfData,
  serif: ReturnType<typeof createPdfLayout>,
  sans: ReturnType<typeof createPdfLayout>
): void => {
  const texts: Record<string, string> = {
    nomor: `${SERTIFIKAT_TEXT.number}  ${data.number}`,
    schoolName: data.schoolName.toUpperCase(),
    cooperation: SERTIFIKAT_TEXT.cooperation,
    companyName: identityValue(data.companyName),
    spacer: '',
    grantedTo: SERTIFIKAT_TEXT.grantedTo,
    grantedToEn: SERTIFIKAT_TEXT.grantedToEn,
    studentName: data.studentName.toUpperCase(),
    classLabel: SERTIFIKAT_TEXT.classLabel,
    classValue: `( ${[data.className, data.majorName].filter(Boolean).join(' / ')} )`,
    completed: SERTIFIKAT_TEXT.completed,
    completedEn: SERTIFIKAT_TEXT.completedEn,
    withResult: SERTIFIKAT_TEXT.withResult,
    predicate: (predicateLabel(data.predicate) || '-').toUpperCase(),
  };

  let baseline = SERTIFIKAT_LAYOUT.firstBaseline;
  let qrTop = 0;
  const contentWidth = SERTIFIKAT_X.right - SERTIFIKAT_X.left;

  for (const line of SERTIFIKAT_FLOW) {
    const layout = line.family === 'serif' ? serif : sans;
    const size = line.size;
    const pitch = size * (line.family === 'serif' ? SERTIFIKAT_FONTS.serif.pitch : SERTIFIKAT_FONTS.sans.pitch);

    // Paragraf kosong di template: hanya menyumbang tinggi baris.
    if (line.key === 'spacer') {
      baseline += pitch;
      continue;
    }
    if (line.key === 'qrAnchor') {
      // Bingkai QR menempel 7,6 pt di bawah puncak baris kosong ini.
      qrTop = layout.boxTop(baseline, size) + SERTIFIKAT_LAYOUT.qr.anchorTop;
      baseline += pitch;
      continue;
    }
    if (line.key === 'withResult') {
      drawResultLine(doc, serif, baseline, data.predicate);
      baseline += pitch;
      continue;
    }

    const text = texts[line.key];
    const width = layout.measure(doc, text, { size, bold: line.bold, italic: line.italic });
    if (width > contentWidth) {
      // Nama perusahaan/nama panjang: turun baris, tetap rata tengah seperti aslinya.
      // putParagraph mengembalikan baseline BARIS TERAKHIR, jadi satu pitch tambahan
      // wajib dihitung di sini — kalau tidak, baris berikutnya menimpa baris ke-2.
      const marked = line.bold ? `**${text}**` : text;
      const lastBaseline = layout.putParagraph(doc, marked, SERTIFIKAT_X.left, baseline, {
        width: contentWidth,
        size,
        pitch,
        align: 'center',
      });
      baseline = lastBaseline + pitch + (line.after ?? 0);
      continue;
    }
    const x = SERTIFIKAT_X.center - width / 2;
    layout.putLine(doc, text, baseline, { x }, {
      size,
      bold: line.bold,
      italic: line.italic,
      color: line.color,
    });
    if (line.underline) {
      layout.putUnderline(doc, text, baseline, x, { size, bold: line.bold, italic: line.italic });
    }
    baseline += pitch + (line.after ?? 0);
  }

  drawQr(doc, data, qrTop);
};

const drawQr = (doc: PDFDocType, data: SertifikatPdfData, top: number): void => {
  const { size, x } = SERTIFIKAT_LAYOUT.qr;
  if (!data.qrBuffer || !top) return;
  try {
    doc.image(data.qrBuffer, x, top, { fit: [size, size] });
  } catch {
    // QR gagal → sertifikat tetap terbit tanpa QR
  }
};

/* ------------------------------------------------------------------ *
 * Blok tanda tangan (dipakai kedua halaman)
 * ------------------------------------------------------------------ */

interface SignColumn {
  title: string;
  name: string | null;
  nip: string | null;
  signatureBuffer?: Buffer | null;
}

const drawSignatureBlock = (
  doc: PDFDocType,
  serif: ReturnType<typeof createPdfLayout>,
  dateText: string,
  left: SignColumn,
  right: SignColumn,
  geometry: {
    col1: number;
    col2: number;
    dateBaseline: number;
    titleBaseline: number;
    gapHeight: number;
    nameBaseline: number;
    nipBaseline: number;
    /** Batas kanan kolom kiri — halaman 2 mempersempitnya untuk bingkai pas foto. */
    limitLeft?: number;
  }
): void => {
  const style = { size: 12 };
  const { rightLimit, colGap } = SERTIFIKAT_LAYOUT.signature;
  const nipGap = geometry.nipBaseline - geometry.nameBaseline;
  serif.putLine(doc, dateText, geometry.dateBaseline, { x: geometry.col2 }, style);

  const column = (col: SignColumn, x: number, limit: number): void => {
    serif.putLine(doc, col.title, geometry.titleBaseline, { x }, style);
    if (col.signatureBuffer) {
      const width = SERTIFIKAT_LAYOUT.signature.signatureWidth;
      try {
        doc.image(col.signatureBuffer, x + 40, geometry.titleBaseline + 6, {
          fit: [width, geometry.gapHeight - 6],
        });
      } catch {
        // tanda tangan gagal dibaca → blok tetap digambar
      }
    }
    const nipText = col.nip ? `${SERTIFIKAT_TEXT.nip} ${col.nip}` : '';
    // Nama penandatangan diketik bebas dan bisa lebih panjang daripada kolomnya —
    // dipecah pada batas kolom (kolom kiri berhenti di depan kolom kanan / bingkai
    // pas foto) lalu baris sisanya mendorong posisi NIP ke bawah.
    const room = limit - x + 1;
    let nameBottom = geometry.nameBaseline;
    if (col.name) {
      nameBottom = serif.putParagraph(doc, col.name, x, geometry.nameBaseline, {
        width: room,
        size: style.size,
        align: 'left',
      });
    }
    if (nipText) {
      serif.putLine(doc, nipText, Math.max(geometry.nipBaseline, nameBottom + nipGap), { x }, style);
    }
  };
  column(left, geometry.col1, geometry.limitLeft ?? geometry.col2 - colGap);
  column(right, geometry.col2, rightLimit);
};

/* ------------------------------------------------------------------ *
 * Halaman 2 — LEMBARAN PENILAIAN
 * ------------------------------------------------------------------ */

const drawIdentity = (
  doc: PDFDocType,
  serif: ReturnType<typeof createPdfLayout>,
  data: SertifikatPdfData
): number => {
  const g = PENILAIAN_SHEET.identity;
  const rows: Array<{ label: string; value: string; bold?: boolean }> = [
    { label: SERTIFIKAT_TEXT.identityLabels.nama, value: identityValue(data.studentName), bold: true },
    {
      label: SERTIFIKAT_TEXT.identityLabels.nisnKelas,
      value: `${identityValue(data.nisn)} / ${identityValue(data.className)}`,
    },
    { label: SERTIFIKAT_TEXT.identityLabels.lahir, value: identityValue(data.birthLabel) },
    { label: SERTIFIKAT_TEXT.identityLabels.kompetensi, value: competencyText(data) },
    { label: SERTIFIKAT_TEXT.identityLabels.tempat, value: identityValue(data.companyName) },
    { label: SERTIFIKAT_TEXT.identityLabels.tanggal, value: identityValue(data.pklRange) },
  ];
  const style = { size: 12 };
  const pitch = 12 * SERTIFIKAT_FONTS.serif.pitch;
  const valueWidth = SERTIFIKAT_X.right - g.valueX;
  let baseline = g.firstBaseline;

  for (const row of rows) {
    const labelStyle = { size: 12, bold: row.bold };
    serif.putLine(doc, `${row.label} :`, baseline, { x: SERTIFIKAT_X.left }, labelStyle);
    const lines = Math.max(
      1,
      Math.ceil(serif.measure(doc, row.value, labelStyle) / valueWidth)
    );
    if (lines > 1) {
      serif.putParagraph(doc, row.bold ? `**${row.value}**` : row.value, g.valueX, baseline, {
        width: valueWidth,
        size: style.size,
        pitch,
        align: 'left',
      });
    } else {
      serif.putLine(doc, row.value, baseline, { x: g.valueX }, labelStyle);
    }
    baseline += Math.max(g.pitch, lines * pitch);
  }
  return baseline;
};

const cellBaseline = (top: number, height: number, size: number, ascender: number): number =>
  top + height / 2 + (size * ascender) / 2;

/** Baris tabel; label membungkus bila lebih lebar dari sel (w:trHeight hRule="atLeast"). */
interface SheetRow {
  no: string;
  score: string;
  /** 'group' = judul kelompok, 'item' = butir a..f, 'total' = baris rekap. */
  kind: 'group' | 'item' | 'total';
  /** Baris rekap berlabel lebar ganda (menggabungkan kolom No + Komponen). */
  span?: boolean;
  keterangan?: string;
  bold?: boolean;
  /** Ukuran cetak nilai & predikat pada baris "Nilai Akhir". */
  valueSize?: number;
  /** Penanda butir ('a. ') digambar terpisah supaya takuk hanging indentpresisi. */
  marker?: string;
  text: string;
  words: Word[][];
  height: number;
}

/** Menggambar tabel; mengembalikan baseline terbawah tabel. */
const drawTable = (
  doc: PDFDocType,
  serif: ReturnType<typeof createPdfLayout>,
  data: SertifikatPdfData,
  top: number
): number => {
  const t = PENILAIAN_SHEET.table;
  const colX = t.columns.map((_, i) => t.x + t.columns.slice(0, i).reduce((a, b) => a + b, 0));
  const asc = SERTIFIKAT_FONTS.serif.ascender;
  const pitch = t.fontSize * SERTIFIKAT_FONTS.serif.pitch;
  const pad = t.cellPadding;

  const labelWidth = t.columns[1] - pad * 2;
  const itemWidth = labelWidth - t.itemIndent;
  const spanWidth = t.columns[0] + t.columns[1] - pad * 2;

  const build = (
    row: Omit<SheetRow, 'words' | 'height'>,
    width: number
  ): SheetRow => {
    const words = serif.typeset(doc, row.text, t.fontSize, width, !!row.bold).lines;
    const min = row.kind === 'total' && row.valueSize ? t.totalHeight : t.rowHeight;
    return { ...row, words, height: Math.max(min, words.length * pitch) };
  };

  const rows: SheetRow[] = [];
  for (const group of PENILAIAN_GROUPS) {
    rows.push(build({ no: group.no, text: group.title, score: '', kind: 'group', bold: true }, labelWidth));
    for (const item of group.items) {
      const found = data.rows.find((r) => r.groupCode === group.no && r.code === item.code);
      rows.push(
        build(
          {
            no: '',
            marker: `${item.code}. `,
            text: item.label,
            score: scoreText(found?.score),
            kind: 'item',
          },
          itemWidth
        )
      );
    }
  }
  rows.push(
    build(
      { no: '', text: SERTIFIKAT_TEXT.averageRow, score: scoreText(data.rataRata), kind: 'total', span: true, bold: true },
      spanWidth
    )
  );
  rows.push(
    build(
      { no: '', text: SERTIFIKAT_TEXT.reportRow, score: scoreText(data.reportScore), kind: 'total', bold: true },
      labelWidth
    )
  );
  rows.push(
    build(
      {
        no: '',
        text: SERTIFIKAT_TEXT.finalRow,
        score: scoreText(data.finalScore),
        keterangan: (predicateLabel(data.predicate) || '').toUpperCase(),
        kind: 'total',
        span: true,
        bold: true,
        valueSize: t.finalValueSize,
      },
      spanWidth
    )
  );

  // Header — semua sel rata tengah & tebal.
  const tableWidth = t.columns.reduce((a, b) => a + b, 0);
  doc.rect(t.x, top, tableWidth, t.headerHeight).fill(t.headerFill);
  doc.fillColor('black');
  const headerStyle = { size: t.fontSize, bold: true };
  const headerBaseline = cellBaseline(top, t.headerHeight, t.fontSize, asc);
  [
    SERTIFIKAT_TEXT.numberHeader,
    SERTIFIKAT_TEXT.componentHeader,
    SERTIFIKAT_TEXT.scoreHeader,
    SERTIFIKAT_TEXT.noteHeader,
  ].forEach((text, i) => {
    const w = serif.measure(doc, text, headerStyle);
    serif.putLine(doc, text, headerBaseline, { x: colX[i] + (t.columns[i] - w) / 2 }, headerStyle);
  });

  let cursor = top + t.headerHeight;
  const mergedTop = cursor;
  const boxes = rows.map((row) => {
    const box = { row, top: cursor };
    cursor += row.height;
    return box;
  });
  const tableBottom = cursor;
  /** Sel "Keterangan" menyatu (vMerge) dari baris kelompok pertama s.d. baris laporan. */
  const mergedBottom = boxes[boxes.length - 1].top;

  boxes.forEach(({ row, top }) => {
    const bodyStyle = { size: t.fontSize, bold: row.bold };
    const rowBaseline = cellBaseline(top, row.height, t.fontSize, asc);

    if (row.no) {
      const w = serif.measure(doc, row.no, bodyStyle);
      serif.putLine(doc, row.no, rowBaseline, { x: colX[0] + (t.columns[0] - w) / 2 }, bodyStyle);
    }

    const labelX = (row.span ? colX[0] : colX[1]) + pad;
    const firstBaseline = rowBaseline - ((row.words.length - 1) * pitch) / 2;
    row.words.forEach((words, i) => {
      const b = firstBaseline + i * pitch;
      let x = row.marker ? labelX + t.itemIndent : labelX;
      if (i === 0 && row.marker) {
        const mw = serif.measure(doc, row.marker, bodyStyle);
        serif.putLine(doc, row.marker, b, { x: labelX }, bodyStyle);
        x = Math.max(labelX + mw, labelX + t.itemIndent);
      }
      drawWords(doc, serif, words, x, b, bodyStyle);
    });

    if (row.score) {
      const valueStyle = { size: row.valueSize ?? t.fontSize, bold: row.bold };
      const w = serif.measure(doc, row.score, valueStyle);
      serif.putLine(
        doc,
        row.score,
        cellBaseline(top, row.height, valueStyle.size, asc),
        { x: colX[2] + (t.columns[2] - w) / 2 },
        valueStyle
      );
    }
    if (row.keterangan) {
      const noteStyle = { size: row.valueSize ?? t.fontSize, bold: row.bold };
      const w = serif.measure(doc, row.keterangan, noteStyle);
      serif.putLine(
        doc,
        row.keterangan,
        cellBaseline(top, row.height, noteStyle.size, asc),
        { x: colX[3] + (t.columns[3] - w) / 2 },
        noteStyle
      );
    }
  });

  // Legenda predikat di dalam sel "Keterangan" yang menyatu — rata atas seperti aslinya.
  let legendBaseline = mergedTop + t.legendSize * SERTIFIKAT_FONTS.serif.pitch;
  const legendStyle = { size: t.legendSize };
  const legendPitch = t.legendSize * SERTIFIKAT_FONTS.serif.pitch;
  for (const line of PENILAIAN_LEGEND) {
    for (const words of serif.typeset(doc, line, t.legendSize, t.columns[3] - pad * 2).lines) {
      drawWords(doc, serif, words, colX[3] + pad, legendBaseline, legendStyle);
      legendBaseline += legendPitch;
    }
    legendBaseline += 2;
  }

  drawGrid(doc, t, colX, boxes, tableWidth, tableBottom, mergedBottom, top);
  return tableBottom;
};

/** Kata-kata satu baris hasil typeset(), digambar dengan spasi natural. */
const drawWords = (
  doc: PDFDocType,
  layout: ReturnType<typeof createPdfLayout>,
  words: Word[],
  x: number,
  baseline: number,
  style: { size: number; bold?: boolean }
): void => {
  const space = layout.measure(doc, ' ', style);
  let cx = x;
  for (const word of words) {
    layout.putLine(doc, word.text, baseline, { x: cx }, style);
    cx += word.width + space;
  }
};

/**
 * Garis kisi tabel. Dalam blok "Keterangan" yang menyatu, garis horizontal
 * berhenti di tepi kolom skor (kecuali pada penutup blok); baris berlabel lebar
 * ganda tidak punya garis vertikal di antara kolom No dan Komponen.
 */
const drawGrid = (
  doc: PDFDocType,
  t: typeof PENILAIAN_SHEET.table,
  colX: number[],
  boxes: Array<{ row: { span?: boolean; kind: string; height: number }; top: number }>,
  tableWidth: number,
  tableBottom: number,
  mergedBottom: number,
  top: number
): void => {
  doc.lineWidth(t.borderWidth).strokeColor('black');
  doc.rect(t.x, top, tableWidth, tableBottom - top).stroke();
  doc
    .moveTo(t.x, top + t.headerHeight)
    .lineTo(t.x + tableWidth, top + t.headerHeight)
    .stroke();

  boxes.forEach(({ row, top }) => {
    const y = top + row.height;
    if (y >= tableBottom) return;
    const stop = y < mergedBottom ? colX[3] : t.x + tableWidth;
    doc.moveTo(t.x, y).lineTo(stop, y).stroke();
    if (!row.span) {
      doc.moveTo(colX[1], top).lineTo(colX[1], y).stroke();
    }
  });

  doc.moveTo(colX[2], top).lineTo(colX[2], tableBottom).stroke();
  doc.moveTo(colX[3], top).lineTo(colX[3], tableBottom).stroke();
};

const drawAssessmentSheet = (
  doc: PDFDocType,
  data: SertifikatPdfData,
  serif: ReturnType<typeof createPdfLayout>
): void => {
  const style = { size: 14, bold: true };
  const width = serif.measure(doc, SERTIFIKAT_TEXT.sheetTitle, style);
  serif.putLine(doc, SERTIFIKAT_TEXT.sheetTitle, PENILAIAN_SHEET.titleBaseline, {
    x: SERTIFIKAT_X.center - width / 2,
  }, style);

  const identityBottom = drawIdentity(doc, serif, data);
  const tableTop = Math.max(PENILAIAN_SHEET.table.top, identityBottom + 8);
  const tableBottom = drawTable(doc, serif, data, tableTop);

  const footnoteBaseline = tableBottom + PENILAIAN_SHEET.footnoteGap + 11;
  serif.putLine(doc, PENILAIAN_FOOTNOTE, footnoteBaseline, { x: SERTIFIKAT_X.left }, { size: 11 });

  /**
   * Blok tanda tangan & bingkai photo menempel di bawah footnote bila isinya
   * panjang; selama muat, keduanya tetap di posisi template.
   */
  const g = PENILAIAN_SHEET.signature;
  const shift = Math.max(
    0,
    Math.min(
      footnoteBaseline + g.clearance - g.dateBaseline,
      SERTIFIKAT_X.contentBottom - g.nipBaseline
    )
  );
  drawPhotoFrame(doc, serif, g.dateBaseline + shift);
  drawSignatureBlock(
    doc,
    serif,
    `${SERTIFIKAT_TEXT.city}, ${data.issuedDateText}`,
    {
      title: SERTIFIKAT_TEXT.guruPembimbing,
      name: data.guruName,
      nip: data.guruNip,
    },
    {
      title: SERTIFIKAT_TEXT.pembimbingPkl,
      name: data.mentorName,
      nip: null,
    },
    {
      col1: g.col1,
      col2: g.col2,
      dateBaseline: g.dateBaseline + shift,
      titleBaseline: g.titleBaseline + shift,
      gapHeight: g.gapHeight,
      nameBaseline: g.nameBaseline + shift,
      nipBaseline: g.nipBaseline + shift,
      // Nama guru pembimbing tidak boleh menimpa bingkai pas foto di tengah.
      limitLeft: PENILAIAN_SHEET.photo.x - SERTIFIKAT_LAYOUT.signature.colGap,
    }
  );
};

/** Bingkai "Pas Photo 3 x 4" — di template berupa shape kosong di antara dua kolom. */
const drawPhotoFrame = (doc: PDFDocType, serif: ReturnType<typeof createPdfLayout>, dateBaseline: number): void => {
  const p = PENILAIAN_SHEET.photo;
  const top = p.top + (dateBaseline - PENILAIAN_SHEET.signature.dateBaseline);
  doc.lineWidth(0.5).strokeColor('#808080').rect(p.x, top, p.width, p.height).stroke();
  doc.strokeColor('black');
  const style = { size: p.label, italic: true, color: '#808080' };
  const centerX = p.x + p.width / 2;
  const baseTop = top + p.height / 2 - p.label * 1.2;
  SERTIFIKAT_TEXT.photoFrame.forEach((text, i) => {
    const w = serif.measure(doc, text, style);
    serif.putLine(doc, text, baseTop + i * p.label * 1.3, { x: centerX - w / 2 }, style);
  });
};

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

export const renderSertifikatPdf = (data: SertifikatPdfData): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [SERTIFIKAT_PAGE.width, SERTIFIKAT_PAGE.height],
        margins: {
          top: SERTIFIKAT_PAGE.marginTop,
          bottom: SERTIFIKAT_PAGE.marginBottom,
          left: SERTIFIKAT_PAGE.marginX,
          right: SERTIFIKAT_PAGE.marginX,
        },
        info: {
          Title: `Sertifikat PKL - ${data.studentName}`,
          Author: data.schoolName,
          Subject: `Sertifikat dan Lembaran Penilaian PKL Nomor ${data.number}`,
        },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const sansFont = registerSansFonts(doc);
      const serif = serifLayout();
      const sans = sansLayout(sansFont);

      // Halaman 1
      drawLogos(doc, data);
      drawCover(doc, data, serif, sans);
      const coverSign = SERTIFIKAT_LAYOUT.signature;
      drawSignatureBlock(
        doc,
        serif,
        `${SERTIFIKAT_TEXT.city}, ${data.issuedDateText}`,
        {
          title: `${SERTIFIKAT_TEXT.headSchoolPrefix}${data.schoolName}`,
          name: data.kepalaName,
          nip: data.kepalaNip,
          signatureBuffer: data.signatureBuffer ?? null,
        },
        { title: SERTIFIKAT_TEXT.headSecondTitle, name: data.kepalaBagianName, nip: null },
        {
          col1: coverSign.col1,
          col2: coverSign.col2,
          dateBaseline: coverSign.dateBaseline,
          titleBaseline: coverSign.titleBaseline,
          gapHeight: coverSign.gapHeight,
          nameBaseline: coverSign.nameBaseline,
          nipBaseline: coverSign.nipBaseline,
        }
      );

      // Halaman 2
      doc.addPage();
      drawAssessmentSheet(doc, data, serif);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

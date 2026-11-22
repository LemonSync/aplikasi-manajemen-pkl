import PDFDocument from 'pdfkit';

/**
 * Primitif tata letak PDF untuk semua surat.
 *
 * Semua posisi adalah BASELINE dari tepi atas halaman — satuan yang sama dengan
 * angka hasil pengukuran surat asli di file config. `doc.y` pdfkit tidak pernah
 * dipakai sebagai sumber posisi; kursor layout dipegang pemanggil.
 *
 * Dibuat lewat factory karena keluarga surat bisa berbeda metrik: semuanya
 * memakai Times (ascender 683) sama seperti surat dinas asli. Regular, bold
 * dan italic satu keluarga punya ascender yang sama, jadi gaya inline tidak
 * menggeser baseline.
 */

export type PDFDocType = InstanceType<typeof PDFDocument>;
export type Align = 'left' | 'center' | 'right';

export interface TextStyle {
  size: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  link?: string;
}

export interface Anchor {
  x?: number;
  center?: number;
  right?: number;
}

export interface LayoutOptions {
  fonts: { regular: string; bold: string; italic?: string };
  /** Metrik font ÷ 1000: Times 0.683, Helvetica 0.718. */
  ascender: number;
  /** x default bila anchor tidak diberikan. */
  defaultX: number;
  /** Pitch default paragraf (satu baris ukuran body). */
  defaultPitch: number;
  /** Baseline terakhir yang masih boleh dipakai. */
  contentBottom: number;
  /** Baseline pertama di halaman sambungan. */
  continuationTop: number;
}

/**
 * Satu kata bisa terdiri dari beberapa potongan gaya: "berlaku." ditulis
 * `__berlaku__.` dan tetap SATU kata — batas marker tidak boleh menambah spasi.
 */
export interface WordSeg {
  text: string;
  bold: boolean;
  ul: boolean;
  width: number;
}

export interface Word {
  text: string;
  width: number;
  segs: WordSeg[];
}

export interface PdfLayout {
  boxTop: (baseline: number, size: number) => number;
  measure: (doc: PDFDocType, text: string, style: TextStyle) => number;
  putLine: (
    doc: PDFDocType,
    text: string | null | undefined,
    baseline: number,
    anchor: Anchor,
    style: TextStyle
  ) => number;
  putUnderline: (
    doc: PDFDocType,
    text: string,
    baseline: number,
    x: number,
    style: TextStyle
  ) => void;
  ensureRoom: (doc: PDFDocType, baseline: number, height: number) => number;
  /**
   * Pecah teks jadi baris kata. `bold` harus sama dengan gaya yang dipakai
   * menggambar hasilnya: metrik Times-Bold lebih lebar dari Times-Roman, jadi
   * mengukur dengan font regular lalu menggambar bold membuat jarak antar-kata
   * menyempit dan kata-kata saling menimpa.
   */
  typeset: (
    doc: PDFDocType,
    text: string,
    size: number,
    width: number,
    bold?: boolean
  ) => { lines: Word[][]; space: number };
  /** Menggambar paragraf; mengembalikan baseline baris TERAKHIR. */
  putParagraph: (
    doc: PDFDocType,
    text: string,
    x: number,
    baseline: number,
    opts: { width: number; size: number; align?: Align; pitch?: number }
  ) => number;
}

/**
 * Bold inline ditulis `**teks**`, garis bawah ditulis `__teks__` (tanpa tebal —
 * sama seperti `text-decoration` di template asli sekolah). pdfkit 0.15.2
 * memancarkan event `lastLine` pada SETIAP panggilan wrap(), jadi menyerahkan
 * inline-style ke `doc.text({continued})` membuat baris penutup segmen tidak
 * ikut di-justify. Pemecahan baris karena itu dilakukan sendiri.
 */
const runsOf = (text: string): Array<{ text: string; bold: boolean; ul: boolean }> => {
  const runs: Array<{ text: string; bold: boolean; ul: boolean }> = [];
  let bold = false;
  let ul = false;
  let buffer = '';
  const flush = (): void => {
    if (buffer) runs.push({ text: buffer, bold, ul });
    buffer = '';
  };
  for (let i = 0; i < text.length; i++) {
    const marker = text.slice(i, i + 2);
    if (marker === '**') {
      flush();
      bold = !bold;
      i += 1;
    } else if (marker === '__') {
      flush();
      ul = !ul;
      i += 1;
    } else {
      buffer += text[i];
    }
  }
  flush();
  return runs;
};

/** Garis bawah satu rentang [x0,x1] — dipakai untuk `__teks__` lintas kata. */
const strokeSpan = (
  doc: PDFDocType,
  baseline: number,
  x0: number,
  x1: number,
  size: number
): void => {
  if (x1 <= x0) return;
  // Tebal & offset ditiru dari template asli: 0.716 pt pada 11 pt, +1.0 pt
  // di bawah baseline.
  doc
    .lineWidth(Math.max(0.5, size * 0.065))
    .strokeColor('black')
    .moveTo(x0, baseline + size * 0.09)
    .lineTo(x1, baseline + size * 0.09)
    .stroke();
};

export const createPdfLayout = (o: LayoutOptions): PdfLayout => {
  const boxTop = (baseline: number, size: number): number => baseline - o.ascender * size;

  const fontOf = (style: TextStyle): string =>
    style.italic && o.fonts.italic ? o.fonts.italic : style.bold ? o.fonts.bold : o.fonts.regular;

  const measure = (doc: PDFDocType, text: string, style: TextStyle): number => {
    doc.font(fontOf(style)).fontSize(style.size);
    return doc.widthOfString(text);
  };

  /**
   * Satu baris teks pada baseline absolut; tidak menyentuh doc.y.
   * `lineBreak: false` TANPA `width` membuat pdfkit melewati LineWrapper sama
   * sekali: tanpa word-wrap dan tanpa page-break diam-diam.
   */
  const putLine = (
    doc: PDFDocType,
    text: string | null | undefined,
    baseline: number,
    anchor: Anchor,
    style: TextStyle
  ): number => {
    const value = text == null ? '' : String(text);
    if (!value) return 0;
    const width = measure(doc, value, style);
    const x =
      anchor.center !== undefined
        ? anchor.center - width / 2
        : anchor.right !== undefined
          ? anchor.right - width
          : (anchor.x ?? o.defaultX);
    doc
      .font(fontOf(style))
      .fontSize(style.size)
      .fillColor(style.color ?? 'black');
    const top = boxTop(baseline, style.size);
    // `link` TIDAK diteruskan ke doc.text: di jalur tanpa LineWrapper, pdfkit
    // menghitung lebar anotasi dari options.textWidth yang tak pernah terisi → NaN.
    doc.text(value, x, top, { lineBreak: false });
    if (style.link) doc.link(x, top, width, style.size * 1.15, style.link);
    doc.fillColor('black');
    return width;
  };

  /** Garis bawah manual — warna & offsetnya tidak bisa diserahkan ke pdfkit. */
  const putUnderline = (
    doc: PDFDocType,
    text: string,
    baseline: number,
    x: number,
    style: TextStyle
  ): void => {
    const width = measure(doc, text, style);
    const y = baseline + style.size * 0.1;
    doc
      .lineWidth(style.size < 10 ? 0.5 : 1)
      .strokeColor(style.color ?? 'black')
      .moveTo(x, y)
      .lineTo(x + width, y)
      .stroke();
  };

  /** Pindah halaman bila blok setinggi `height` di bawah `baseline` tidak muat. */
  const ensureRoom = (doc: PDFDocType, baseline: number, height: number): number => {
    if (baseline + height <= o.contentBottom) return baseline;
    doc.addPage();
    return o.continuationTop;
  };

  /** Pecah teks menjadi baris-baris kata yang muat `width` (greedy fill). */
  const typeset = (
    doc: PDFDocType,
    text: string,
    size: number,
    width: number,
    baseBold = false
  ): { lines: Word[][]; space: number } => {
    const words: Word[] = [];
    let space = 0;
    const pushWord = (value: string, bold: boolean, ul: boolean, glue: boolean): void => {
      const width = doc.widthOfString(value);
      const seg: WordSeg = { text: value, bold, ul, width };
      const prev = words[words.length - 1];
      if (glue && prev) {
        prev.text += value;
        prev.width += width;
        prev.segs.push(seg);
      } else {
        words.push({ text: value, width, segs: [seg] });
      }
    };
    let glue = false;
    for (const run of runsOf(text)) {
      doc.font(run.bold || baseBold ? o.fonts.bold : o.fonts.regular).fontSize(size);
      if (!space) space = doc.widthOfString(' ');
      for (const chunk of run.text.split(/(\s+)/)) {
        if (!chunk) continue;
        if (/^\s/.test(chunk)) {
          glue = false;
          continue;
        }
        pushWord(chunk, run.bold, run.ul, glue);
        glue = true;
      }
    }
    const lines: Word[][] = [];
    let current: Word[] = [];
    let used = 0;
    for (const word of words) {
      const needed = current.length ? used + space + word.width : word.width;
      if (current.length && needed > width) {
        lines.push(current);
        current = [word];
        used = word.width;
      } else {
        current.push(word);
        used = needed;
      }
    }
    if (current.length) lines.push(current);
    return { lines, space: space || size * 0.25 };
  };

  const putParagraph: PdfLayout['putParagraph'] = (doc, text, x, baseline, opts) => {
    const pitch = opts.pitch ?? o.defaultPitch;
    const align = opts.align ?? 'justify';
    const { lines, space } = typeset(doc, text, opts.size, opts.width);
    if (lines.length === 0) return baseline;

    const right = x + opts.width;
    const style = { size: opts.size };
    let shift = 0;
    lines.forEach((line, i) => {
      let b = baseline + i * pitch + shift;
      if (b > o.contentBottom) {
        doc.addPage();
        shift = o.continuationTop - b;
        b += shift;
      }
      const glyphs = line.reduce((sum, w) => sum + w.width, 0);
      const gaps = line.length - 1;
      let cx = x;
      let gap = space;
      if (align === 'justify' && i < lines.length - 1 && gaps > 0) {
        gap = (right - x - glyphs) / gaps;
      } else if (align === 'center') {
        cx = x + (opts.width - (glyphs + space * gaps)) / 2;
      }
      let ulStart: number | null = null;
      let ulEnd = 0;
      for (const word of line) {
        let sx = cx;
        for (const seg of word.segs) {
          putLine(doc, seg.text, b, { x: sx }, { ...style, bold: seg.bold });
          if (seg.ul) {
            if (ulStart === null) ulStart = sx;
            ulEnd = sx + seg.width;
          } else if (ulStart !== null) {
            strokeSpan(doc, b, ulStart, ulEnd, opts.size);
            ulStart = null;
          }
          sx += seg.width;
        }
        cx += word.width + gap;
      }
      if (ulStart !== null) strokeSpan(doc, b, ulStart, ulEnd, opts.size);
    });
    return baseline + (lines.length - 1) * pitch + shift;
  };

  return { boxTop, measure, putLine, putUnderline, ensureRoom, typeset, putParagraph };
};

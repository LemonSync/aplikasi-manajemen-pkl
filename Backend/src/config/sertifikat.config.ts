/**
 * Geometri & teks Sertifikat PKL — diukur dari Backend/surat_pkl/sertifikat.docx
 * (hasil bongkar OOXML: w:pgSz/w:pgMar, w:sz, w:ind, w:tblGrid, w:trHeight,
 * w:tcBorders, dan posisi w:wp:anchor tiap gambar).
 *
 * Satuan: point (pt), 1/72 inci. Angka twips sudah dibagi 20, half-point dibagi 2,
 * dan EMU dikali 72/914400.
 */

export const SERTIFIKAT_PAGE = {
  /** 11906 x 16838 twips. */
  width: 595.3,
  height: 841.9,
  /** 720 / 567 / 1418 twips. */
  marginTop: 36,
  marginBottom: 28.35,
  marginX: 70.9,
};

/** Tepi kanan teks & titik tengah kolom (turunan dari margin). */
export const SERTIFIKAT_X = {
  left: SERTIFIKAT_PAGE.marginX,
  right: SERTIFIKAT_PAGE.width - SERTIFIKAT_PAGE.marginX,
  center: SERTIFIKAT_PAGE.width / 2,
  contentBottom: SERTIFIKAT_PAGE.height - SERTIFIKAT_PAGE.marginBottom,
  /** Kolom tanda tangan kiri/kanan. */
  signLeft: 184,
  signRight: 411,
};

/** Keluarga font: serif = Times (pengganti Cambria), sans = Quattrocento Sans asli template. */
export const SERTIFIKAT_FONTS = {
  serif: { regular: 'Times-Roman', bold: 'Times-Bold', italic: 'Times-Italic', ascender: 0.683, pitch: 1.16 },
  sans: {
    /** Berkas TTF disalin dari word/fonts/ sertifikat.docx (lisensi SIL OFL). */
    regularFile: 'QuattrocentoSans-regular.ttf',
    italicFile: 'QuattrocentoSans-italic.ttf',
    /** Bold tidak dipakai di template — gaya tebal ditiru dari keluarga serif. */
    boldFile: 'QuattrocentoSans-regular.ttf',
    /** ascent 848 / descent -260 per em (upem 1000), diukur dengan fontkit. */
    ascender: 0.848,
    pitch: 1.108,
  },
};

/** Satu baris teks terpusat pada halaman 1; `after` = jarak paragraf sesudahnya. */
export interface SertifikatLine {
  key: string;
  family: 'serif' | 'sans';
  size: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  after?: number;
}

/**
 * Urutan paragraf halaman 1, persis seperti daftar <w:p> template sekolah —
 * termasuk paragraf kosong yang hanya mengatur jarak (key 'spacer').
 * `after` = w:spacing w:after ÷ 20 (default dokumen = 160 → 8 pt).
 */
export const SERTIFIKAT_FLOW: SertifikatLine[] = [
  { key: 'nomor', family: 'serif', size: 12, after: 8 },
  { key: 'spacer', family: 'serif', size: 12, after: 8 },
  { key: 'schoolName', family: 'serif', size: 16, bold: true, after: 8 },
  { key: 'cooperation', family: 'serif', size: 12, italic: true, after: 8 },
  { key: 'companyName', family: 'serif', size: 12, bold: true },
  { key: 'spacer', family: 'sans', size: 6 },
  { key: 'grantedTo', family: 'serif', size: 14, bold: true, italic: true },
  { key: 'grantedToEn', family: 'sans', size: 11, italic: true },
  { key: 'spacer', family: 'serif', size: 5 },
  { key: 'studentName', family: 'serif', size: 23, bold: true, color: '#538135', after: 4 },
  { key: 'classLabel', family: 'sans', size: 11, italic: true },
  { key: 'classValue', family: 'sans', size: 12, italic: true },
  { key: 'spacer', family: 'serif', size: 14 },
  { key: 'completed', family: 'serif', size: 14, bold: true },
  { key: 'completedEn', family: 'serif', size: 13, bold: true, italic: true, after: 6 },
  { key: 'spacer', family: 'serif', size: 15 },
  { key: 'spacer', family: 'sans', size: 11, after: 8 },
  { key: 'spacer', family: 'sans', size: 8 },
  /** Baris kosong tempat bingkai QR anchor menempel (y = 7,6 pt di bawah puncaknya). */
  { key: 'qrAnchor', family: 'sans', size: 12 },
  { key: 'withResult', family: 'serif', size: 14 },
  { key: 'spacer', family: 'serif', size: 18 },
  { key: 'predicate', family: 'serif', size: 16, bold: true, italic: true, underline: true },
];
export const SERTIFIKAT_LAYOUT = {
  /** Spasi tunggal default (serif); tiap keluarga punya `pitch` sendiri di SERTIFIKAT_FONTS. */
  pitchFactor: 1.16,
  /** Baseline baris "Nomor :" — di bawah sepasang logo. */
  firstBaseline: 146,
  logo: {
    /**
     * Dua logo di docx hanya contoh — sertifikat asli memakai satu logo, yaitu
     * logo perusahaan yang diunggah siswa, ditempatkan di tengah header.
     */
    size: 90,
    top: 28,
  },
  /** Bingkai QR template: 121,8 x 111,3 pt; QR asli dibuat kotak agar tidak gepeng. */
  qr: { size: 111.3, x: 59.1, anchorTop: 7.6 },
  /** Kotak centang predikat A/B/C/D — digambar vektor (glyph Wingdings tidak ikut). */
  checkBox: { size: 11, gapAfter: 5, labelGap: 3 },
  signature: {
    /** Tepi kiri tiap kolom tanda tangan — tab stop paragraf tanda tangan halaman 2. */
    col1: SERTIFIKAT_PAGE.marginX,
    col2: 375.7,
    dateBaseline: 640,
    titleBaseline: 658,
    /** Celah untuk tanda tangan tangan / stempel. */
    gapHeight: 62,
    nameBaseline: 730,
    nipBaseline: 746,
    signatureWidth: 120,
    /** Batas kanan kolom tanda tangan — w:ind w:right="-1136" pada docx (524,4 + 56,8). */
    rightLimit: 581.2,
    /** Jarak aman antara nama kolom kiri dan kolom kanan saat nama panjang. */
    colGap: 8,
  },
};

/** Halaman 2 — LEMBARAN PENILAIAN. */
export const PENILAIAN_SHEET = {
  titleBaseline: 54,
  identity: { firstBaseline: 80, pitch: 16.5, valueX: 227 },
  table: {
    /** w:tblGrid 710/4536/1844/2836 twips; tblInd -5 twips ≈ tepi kiri margin. */
    x: SERTIFIKAT_PAGE.marginX - 0.25,
    columns: [35.5, 226.8, 92.2, 141.8],
    headerHeight: 22.7,
    rowHeight: 19.9,
    totalHeight: 29.8,
    /** w:tcBorders w:sz="4" = 4/8 pt. */
    borderWidth: 0.5,
    headerFill: '#d9d9d9',
    /** w:tblCellMar kiri/kanan 115 twips. */
    cellPadding: 5.75,
    /** w:ind left="251" hanging="251" pada baris butir → takuk huruf "a." */
    itemIndent: 12.55,
    top: 172,
    fontSize: 12,
    /** Baris "Nilai Akhir": angka & predikat dicetak 15 pt di template. */
    finalValueSize: 15,
    legendLetterSize: 12,
    legendSize: 11,
  },
  footnoteGap: 16,
  /** Bingkai "Pas Photo 3 x 4" (shape 1725805x2301240 EMU) di antara dua kolom. */
  photo: { x: 245.9, top: 621.7, width: 85.8, height: 114.2, label: 9 },
  signature: {
    /** Tepi kiri kolom tanda tangan — tab stop paragraf "Guru Pembimbing"/"Pembimbing PKL". */
    col1: SERTIFIKAT_PAGE.marginX,
    col2: 375.7,
    dateBaseline: 632,
    titleBaseline: 650,
    gapHeight: 62,
    nameBaseline: 722,
    nipBaseline: 738,
    /** Jarak minimum tepi bawah footnote ke garis tanggal (termasuk blok photo). */
    clearance: 34,
  },
};

/** Teks tetap sertifikat. Bagian yang diisi data memakai placeholder `{}`. */
export const SERTIFIKAT_TEXT = {
  number: 'Nomor :',
  cooperation: 'Bekerjasama Dengan :',
  grantedTo: 'Sertifikat ini diberikan kepada :',
  grantedToEn: '( This is to certify that  :)',
  classLabel: 'Class / Major :',
  completed: 'Telah menyelesaikan Praktik Kerja Lapangan',
  completedEn: '( Has successfully completed the Field Work Practices )',
  withResult: 'Dengan Hasil :',
  city: 'Medan',
  headSchoolPrefix: 'Kepala ',
  /**
   * Penandatangan kedua halaman 1. Jabatan ini dicetak tetap seperti template;
   * namanya tidak punya sumber data (tidak ada relasi jabatan di schema),
   * jadi kolom nama dibiarkan kosong untuk ditandatangani manual.
   */
  headSecondTitle: 'Kepala Bagian Teknik dan Pengelolaan',
  headCompany: 'Pembimbing PKL',
  guruPembimbing: 'Guru Pembimbing',
  pembimbingPkl: 'Pembimbing PKL',
  nip: 'NIP.',
  photoFrame: ['Pas Photo', '3 x 4'],
  sheetTitle: 'LEMBARAN PENILAIAN',
  identityLabels: {
    nama: 'Nama Peserta Didik',
    nisnKelas: 'NISN / Kelas',
    lahir: 'Tempat / Tanggal Lahir',
    kompetensi: 'Kompetensi Keahlian',
    tempat: 'Tempat PKL',
    tanggal: 'Tanggal PKL',
  },
  reportRow: 'Nilai Laporan PKL (20%)',
  averageRow: 'Nilai Rata-Rata 1, 2 & 3 (80%)',
  finalRow: 'Nilai Akhir PKL',
  scoreHeader: 'Skor  (0-100)',
  numberHeader: 'No',
  componentHeader: 'Komponen Penilaian',
  noteHeader: 'Keterangan',
};

/**
 * Format nomor sertifikat, ditiru dari contoh sekolah:
 * `400.10.5.4/0108.151/SMKN9/XI/2025`
 *   400.10.5.4  = klasifikasi arsip surat sekolah (tetap)
 *   001         = nomor urut terbit dalam satu tahun (dibangkitkan sistem)
 *   SMKN9       = kode sekolah
 *   XI          = bulan Romawi tanggal terbit
 *   2025        = tahun terbit
 */
export const SERTIFIKAT_NUMBER = {
  classification: '400.10.5.4',
  schoolCode: 'SMKN9',
  sequencePad: 3,
};

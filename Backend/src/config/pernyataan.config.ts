/**
 * Konfigurasi Surat Pernyataan Peserta PKL (Fase 2 — pendaftaran ulang).
 *
 * SEMUA angka di file ini adalah hasil ukur surat asli sekolah:
 * `Backend/surat_pkl/surat pernyataan pkl.pdf` (cetakan WeasyPrint 62.3,
 * A4 595.28×841.89 pt, margin kiri-kanan 56.7 pt). Diukur dengan pdf.js:
 * tiap angka di bawah adalah BASELINE/tepi seperti yang terbaca di PDF itu,
 * bukan perkiraan.
 *
 * Font asli = Times New Roman (dicocokkan lewat lebar glyph: "Yang bertanda
 * tangan di bawah ini adalah:" 187.1 pt aslinya vs 186.7 pt Times-Roman 11 pt;
 * Helvetica 207.6 pt — terpaut jauh). pdfkit punya Times base-14, jadi tidak
 * perlu embed TTF. baseline = docY + 0.683 * size, sama untuk regular/bold/
 * italic, sehingga gaya inline tidak menggeser garis dasar.
 *
 * `line-height` template aslinya 1.4 × 11 pt = 15.4 pt — persis selisih
 * baseline antar baris paragraf di PDF.
 */
export const PERNYATAAN_LAYOUT = {
  page: {
    width: 595.28,
    height: 841.89,
    marginX: 56.7,
    marginBottom: 56.7,
  },

  /** Ascender Times/1000 — sama untuk regular, bold, dan italic. */
  metrics: { ascender: 0.683 },

  size: {
    /** Body, label, dan butir pernyataan. */
    body: 11,
    /** Judul — hanya 1 pt lebih besar, tapi tebal + garis bawah. */
    title: 12,
    /** "Catatan: …" (italic di asli). */
    note: 10,
    /** Dua baris "Materai / 10.000" di dalam kotaknya. */
    materai: 8,
  },

  /** Satu-satunya pitch yang dipakai surat ini: 11 pt × line-height 1.4. */
  pitch: { line: 15.4 },

  /**
   * Kolom horizontal (x absolut dari tepi kiri halaman), hasil ukur PDF asli.
   */
  x: {
    left: 56.7,
    right: 538.6,
    /** Tengah halaman — judul dan isi kolom tanda tangan di-center ke sini. */
    centerX: 297.65,
    /** Titik dua blok data; label rata kiri di `left`, nilai mulai di `value`. */
    colon: 182.9,
    /** Garis nilai: tepi kiri … tepi kanan (538.6 = tepi kanan teks). */
    ruleLeft: 191.6,
    value: 193.8,
    /** Butir pernyataan: angka + teks satu baris rata, TANPA hanging indent. */
    itemLeft: 60.4,
    /** Tiga kolom: Wali Kelas / Orang Tua-Wali / Peserta PKL. */
    sigColumns: [57.4, 218.1, 378.7],
    /** "Medan," di kolom 3, tanggal di tab-nya. */
    dateValue: 428.5,
    /** Lebar garis titik-titik = 27 karakter "." Times 11 pt = 118.3 pt. */
    dotWidth: 118.3,
    /** Kotak nama di bawah garis titik-titik. */
    nameWidth: 118.3,
    /** Kotak Materai di kolom 3; teksnya 663.7 dan 673.3 (= tepi atas +17.3/+26.9). */
    materaiBox: { width: 52.5, height: 41.25, gapAbove: 11.5, textTop: 17.3, textPitch: 9.6 },
  },

  /**
   * Jarak vertikal sebagai selisih baseline, semuanya terbaca langsung dari
   * PDF (lihat komentar di tiap butir).
   */
  gap: {
    /** 69.1 → 99.9 = 2 × 15.4. */
    afterTitle: 30.8,
    /** 99.9 → baris data pertama 129.6. */
    beforeRows: 29.7,
    /** 129.6 → 151.0 → … 258.0; termasuk ruang satu baris kosong. */
    dataRow: 21.4,
    /** Baseline nilai → garis titik-titiknya (136.5 − 129.6). */
    ruleOffset: 6.9,
    /** Garis nilai → baseline baris data berikutnya (136.5 → 151.0). */
    afterRule: 14.5,
    /** Garis baris terakhir (264.9) → paragraf Permendikbud (291.7). */
    afterData: 26.8,
    /** Antar paragraf isi: regulasi → deklarasi → butir pertama (24.4). */
    paragraph: 24.4,
    /** Butir terakhir baris pertama → butir berikutnya (402.1 → 422.0). */
    betweenItems: 19.9,
    /** Baris butir 4 (508.0) → paragraf penutup (534.7). */
    afterItems: 26.7,
    /** Baris penutup (565.5) → "Mengetahui," (604.1). */
    afterClosing: 38.6,
    /** Baris jabatan → garis titik-titik (619.5 → 691.2; 634.9 → 706.6). */
    toDots: 71.7,
    /** Garis titik-titik → nama di bawahnya. */
    afterDots: 15.4,
    /** Nama terendah → "Catatan:" (722.0 → 744.2). */
    afterNames: 22.2,
  },

  /** Baseline judul di PDF asli. */
  firstBaseline: 69.1,

  /** Tebal garis: judul 1.52, garis bawah butir 0.716, garis nilai 1.0. */
  stroke: { title: 1.52, underline: 0.716, rule: 1 },

  /** Tinggi blok tanda tangan utuh ("Mengetahui," sampai "Catatan:"). */
  signatureBlockHeight: 140.1,

  contentBottom: 785.2,
  continuationTop: 69.1,
} as const;

/**
 * Teks surat, verbatim dari `surat pernyataan pkl.pdf`. "IDUKA" (Industri,
 * Dunia Usaha dan Dunia Kerja) memang istilah yang dipakai sekolah di sini.
 * `__…__` = garis bawah (tanpa tebal), persis seperti aslinya.
 */
export const PERNYATAAN_TEXT = {
  title: 'SURAT PERNYATAAN PESERTA PKL',
  intro: 'Yang bertanda tangan di bawah ini adalah:',
  /** Label blok data, urut dan berbunyi sama seperti formulir aslinya. */
  labels: {
    namaSiswa: 'Nama Siswa/i',
    kelasJurusan: 'Kelas / Program Keahlian',
    namaOrtu: 'Nama Orang Tua / Wali',
    alamatSiswa: 'Alamat Siswa/i',
    hpOrtu: 'No. HP Orang Tua',
    hpSiswa: 'No. HP Siswa',
    tempatPkl: 'Tempat PKL',
  },
  /** Kutipan definisi PKL — paragraf utuh dari formulir sekolah. */
  regulation:
    'Berdasarkan Permendikbud Nomor 50 Tahun 2020 tentang Praktik Kerja Lapangan Bagi Peserta Didik, ' +
    'Praktik Kerja Lapangan (PKL) adalah pembelajaran bagi peserta didik Sekolah Menengah Kejuruan (SMK) ' +
    'yang dilaksanakan melalui praktik kerja di dunia kerja dalam jangka waktu tertentu sesuai dengan ' +
    'kurikulum dan kebutuhan kerja.',
  /** Klausa kosong dibuang; sisanya tetap satu kalimat seperti aslinya. */
  declaration: (sekolah: string, tanggal: string, tahun: string): string => {
    const parts = [`Sebagai Peserta PKL ${sekolah}`];
    if (tanggal) parts.push(`tanggal ${tanggal}`);
    if (tahun) parts.push(`Tahun Pelajaran ${tahun}`);
    return `${parts.join(' ')}, dengan ini menyatakan bahwa:`;
  },
  items: [
    'Memahami tentang arti pentingnya PKL yang dilaksanakan bersama IDUKA.',
    'Berjanji akan mematuhi tata tertib yang ditetapkan oleh Sekolah dan IDUKA tempat saya melaksanakan PKL.',
    'Akan memegang teguh kerahasiaan IDUKA tempat saya PKL serta menjunjung tinggi nama baik dan kehormatan sekolah, guru, keluarga, dan IDUKA.',
    'Saya menyadari bahwa apabila melakukan pelanggaran atas surat pernyataan ini, ' +
      '__dapat dikeluarkan dari sekolah dan/atau ditindak sesuai dengan peraturan yang berlaku.__',
  ],
  closing:
    'Demikian surat pernyataan ini saya buat dan saya tanda tangani dengan sebenar-benarnya tanpa ada ' +
    'paksaan maupun tekanan dari pihak mana pun, serta diiringi dengan kesadaran akan segala akibat ' +
    'yang ditimbulkannya.',
  signature: {
    knowing: 'Mengetahui,',
    homeroom: 'Wali Kelas,',
    parent: 'Orang Tua/Wali',
    declarant: 'Yang membuat Pernyataan,',
    student: 'Peserta PKL,',
    /** Dua baris, di-center dalam kotak. */
    materai: ['Materai', '10.000'],
    /** Deretan titik sungguhan — aslinya juga teks, bukan garis. */
    dots: '...........................................',
    note: 'Catatan: Tanda tangan peserta PKL harus kena materai',
  },
} as const;

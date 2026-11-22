/**
 * Konfigurasi layout PDF surat resmi. Semua ukuran dalam point (pt).
 *
 * Sumber angka = hasil pengukuran langsung tiga surat asli di Backend/surat_pkl/
 * (baseline teks diukur dari TEPI ATAS halaman, halaman 595.92 x 842.88 pt).
 * Karena itu field bernama `baseline*`/`y` di bawah adalah baseline, bukan koordinat
 * pdfkit: letter.template.ts mengonversinya lewat `boxTop(baseline, size)`.
 */
export const LETTER_LAYOUT = {
  page: {
    width: 595.28,
    height: 841.89,
    /** Margin kiri teks (hasil ukur: 56.7). */
    margin: 56.7,
    /** Tepi kanan teks — aslinya 43.2pt dari tepi halaman, bukan cermin margin kiri. */
    contentRight: 552.7,
    /** Batas bawah konten; di bawahnya blok paksa pindah halaman. */
    contentBottom: 780,
    /** Baseline pertama untuk surat sambungan (halaman 2 dst). */
    continuationTop: 56,
  },

  /**
   * Konversi baseline pdfkit. Times-Roman & Times-Bold sama-sama Ascender 683,
   * jadi bold di tengah baris tidak menggeser baseline.
   */
  metrics: { ascender: 0.683 },

  /** Kop: sama persis di ketiga surat asli. */
  kop: {
    logo: { x: 49.9, top: 36.3, width: 68.3, height: 78.7 },
    /**
     * Teks kop pada aslinya NOT page-centered — ia berada di sel tabel di kanan logo,
     * sehingga sumbu tengahnya mengambang 316..327 antar baris. 322 adalah rata-ratanya.
     */
    centerX: 322,
    lines: {
      government: { baseline: 48.5, size: 12, bold: true },
      department: { baseline: 64.6, size: 14, bold: true },
      schoolName: { baseline: 84.5, size: 18, bold: true },
      program: { baseline: 99.5, size: 10, bold: true },
      address: { baseline: 110.5, size: 9, bold: false },
      contact: { baseline: 120.9, size: 9, bold: false },
    },
    /** Baris website+email; NPSN berada di baris yang sama, di-anchor ke kanan. */
    contact: { emailColor: '#1155cc', npsnRight: 541 },
    /** Garis double pemisah. Pada aslinya lebih lebar dari margin teks. */
    rule: { x1: 44.7, x2: 562.2, upperY: 134.8, upperWidth: 1, lowerY: 140.8, lowerWidth: 0.75 },
    /** Baseline setelah kop tempat blok Nomor mulai. */
    firstBaseline: 154.7,
  },

  /**
   * Kolom label / titik dua / nilai. Dipakai Nomor-Lampiran-Hal dan "Kepada Yth".
   * Titik dua berada di 128.0, nilai di 141.5 — rata pada semua surat asli.
   */
  label: {
    x: 56.7,
    colonX: 128,
    valueX: 141.5,
    size: 12,
    pitch: 13.8,
    /** Tanggal rata kanan ke sini. */
    dateRight: 551.4,
    /** Hal → "Kepada Yth" (satu baris kosong). */
    gapToRecipient: 27.6,
  },

  /** Baris "Di-" di kolom nilai; kotanya mundur 23.2pt dan turun satu baris. */
  recipient: { placeX: 141.5, cityX: 164.7, cityPitch: 13.8 },

  /** Paragraf isi: indent ke kolom nilai, justify, pitch tetap 13.8. */
  body: {
    size: 12,
    pitch: 13.8,
    x: 141.5,
    right: 552.7,
    /** Jarak antar paragraf = satu baris kosong. */
    paragraphGap: 13.8,
    afterRecipient: 27.6,
    beforeTable: 16.7,
    afterTable: 25.5,
    /**
     * Penutup → jabatan tanda tangan. Surat 1 memakai 41.4 (2 baris kosong),
     * surat 2 memakai 27.6 (1 baris). Dipilih 41.4: yang lebih longgar, karena
     * blok tanda tangan tetap muat di halaman pertama (butuh 99.1pt ke bawah).
     */
    beforeClosingSign: 41.4,
  },

  /**
   * Tabel. Tepi kanan = x + jumlah widths (widths yang jadi acuan, bukan dibagi rata).
   * `textPad` = jarak tepi atas sel ke BASELINE baris teks pertama (terukur 17.6pt
   * untuk 12pt = ascender 8.2 + pad 9.4); baris tambahan turun per pitch.
   */
  table: {
    size: 12,
    pitch: 13.8,
    padX: 5,
    textPad: 9.4,
    headerFill: '#e8e8e8',
    borderWidth: 0.6,
    presets: {
      /** Daftar siswa (permohonan & pengantar) — terukur dari surat 1 dan 2. */
      siswa: {
        x: 145.5,
        widths: [35.2, 184.5, 186.8],
        aligns: ['center', 'center', 'center'] as Array<'left' | 'center' | 'right'>,
        padX: 5,
        headerHeight: 27.75,
        rowHeight: 27,
      },
      /**
       * Bulk 6 kolom (pengantar / monitoring / penjemputan): tidak ada surat acuan.
       * Lebar penuh body (56.7 → 552.7 = 496) supaya NISN 10 digit, kelas
       * "XII RPL 1", nama perusahaan dan alamat tidak pecah 3 baris — kalau tiap
       * baris tabel melembung, blok tanda tangan terlempar ke halaman kedua.
       */
      bulk: {
        x: 56.7,
        widths: [26, 70, 108, 66, 110, 116],
        aligns: ['center', 'center', 'left', 'center', 'left', 'left'] as Array<'left' | 'center' | 'right'>,
        padX: 4,
        headerHeight: 27.75,
        rowHeight: 27,
      },
      /** Tujuan pembimbing — terukur dari surat 3. "No." rata kanan, sisanya rata kiri. */
      penugasan: {
        x: 60.4,
        widths: [37.5, 186.7, 270.7],
        aligns: ['right', 'left', 'left'] as Array<'left' | 'center' | 'right'>,
        padX: 5.2,
        headerHeight: 24.75,
        rowHeight: 24.75,
      },
    },
  },

  /** Blok "Dengan Pembimbing Sekolah" pada surat pengantar. */
  pembimbing: { x: 141.5, colonX: 236.7, pitch: 13.8, after: 27.6 },

  /**
   * Blok tanda tangan. Pada ketiga surat asli blok ini RATA KIRI di x=344.7
   * (bukan rata tengah) — posisi, nama, dan NIP punya sumbu berbeda-beda karena
   * memang tidak di-center.
   */
  signature: {
    x: 344.7,
    right: 552.7,
    size: 12,
    /** Celah kosong antara jabatan dan nama = ruang tanda tangan tangan. */
    nameGap: 82.8,
    nipPitch: 13.8,
    /**
     * Tinggi blok dari baseline jabatan: nameGap 82.8 + nipPitch 13.8 + turunnya
     * huruf 2.5 = 99.1 (terukur dari surat 1 & 2). Angka bulat 110 membuat surat
     * pengantar terlempar ke halaman dua hanya untuk blok tanda tangan.
     */
    blockHeight: 99.1,
    /**
     * TODO verifikasi dengan PNG tanda tangan asli — storage/signatures/ kosong di dev,
     * jadi posisi gambar belum bisa diukur. Gambar ditempatkan di dalam celah nameGap.
     */
    image: { offsetX: 0, offsetY: 4, maxWidth: 168 },
  },

  /** Layout khusus Surat Penugasan (surat 3). */
  penugasan: {
    title: { baseline: 160.6, centerX: 304.7, size: 14 },
    nomor: { baseline: 174.8, size: 12 },
    label: { x: 56.7, colonX: 163.2, valueX: 177.5, continuationX: 176.7, size: 12, pitch: 13.8 },
    nested: { x: 213.4, colonX: 308.7, size: 12, pitch: 13.8 },
    /** Jarak antar blok label (Dari → Kepada → Dasar → Isi) pada aslinya 27.6. */
    blockGap: 27.6,
    /** Baris "Dikeluarkan di" / "Pada Tanggal" — satu blok dengan tanda tangan. */
    issued: { colonX: 452.7, valueX: 471, pitch: 13.8 },
    /** Paragraf "Isi" → tepi atas tabel. */
    beforeTable: 30.3,
    /** Tepi bawah tabel → "Ketentuan Lain". */
    afterTable: 25.8,
    /** "Ketentuan Lain" → blok tanda tangan. */
    beforeSign: 41.4,
  },
} as const;

/** Preset tabel yang boleh dipakai pemanggil. */
export type LetterTablePreset = keyof typeof LETTER_LAYOUT.table.presets;

/** Teks statis surat. Placeholder dinamis ditulis sebagai fungsi agar data runtime tetap masuk. */
export const LETTER_TEXT = {
  /** Label blok surat formal. */
  labels: {
    number: 'Nomor',
    attachment: 'Lampiran',
    subject: 'Hal',
    recipient: 'Kepada Yth',
    place: 'Di-',
    issuedAt: 'Dikeluarkan di',
    date: 'Pada Tanggal',
    from: 'Dari',
    to: 'Kepada',
    basis: 'Dasar',
    content: 'Isi',
    otherTerms: 'Ketentuan Lain',
    nipPrefix: 'NIP.',
  },
  /** Blok penerima umum untuk surat bulk multi-perusahaan. */
  recipient: {
    salutation: 'Bapak / Ibu Pimpinan Perusahaan',
    /** Dipasang di baris "Di-" → terbaca "Di Tempat". */
    place: 'Tempat',
  },
  /** Label tabel Surat Permohonan satu siswa. */
  application: {
    subject: 'Permohonan PKL',
    /** Pada surat asli, salam pembuka menyatu dengan paragraf pertama. */
    opener: 'Dengan Hormat, ',
    studentIntro: 'Bersama ini kami kirimkan nama – nama siswa/i yang akan melaksanakan Praktek Kerja Lapangan (PKL) di Institusi / Lembaga yang Bapak / Ibu pimpin sebagai berikut:',
    closing: 'Demikian surat permohonan ini kami sampaikan, atas perhatian, dukungan serta kesediaannya disampaikan terima kasih.',
    tableHeaders: ['NO', 'NAMA SISWA', 'PROGRAM KEAHLIAN'],
    dateClause: (range: string | null) => range ? `mengikuti kegiatan PKL mulai tanggal **${range}**.` : 'mengikuti kegiatan PKL pada masa yang ditentukan.',
    body: (school: string, academicYear: string | null, company: string, dateClause: string) =>
      `Sesuai dengan Permendikbud Ristek RI Nomor 12 Tahun 2024 Tentang Kurikulum Merdeka dan Program Kerja ${school}${academicYear ? ` Tahun Pelajaran ${academicYear}` : ''} tentang Praktek Kerja Lapangan (PKL), melalui surat ini kami mohon kepada Bapak/Ibu pimpinan ${company}, berkenan menerima siswa/siswi ${school} untuk ${dateClause}`,
  },
  /** Teks Surat Pengantar, Monitoring, dan Penjemputan. */
  bulk: {
    pengantar: {
      label: 'Surat Pengantar PKL', subject: 'Pengiriman Siswa PKL',
      intro: (range: string, reply: string) => `Dengan Hormat, menindaklanjuti surat Bapak / Ibu dengan nomor : ${reply || '........'} tertanggal dengan Perihal Penerimaan Siswa Praktek Kerja Lapangan (PKL), bersama ini kami kirimkan nama – nama siswa/i yang akan melaksanakan Praktek Kerja Lapangan (PKL) di Institusi / Lembaga yang Bapak / Ibu pimpin mulai **Tanggal ${range}** sebagai berikut:`,
      closing: 'Demikian kami kirimkan, atas bantuan dan kerjasama yang Bapak / Ibu berikan kami ucapkan terima kasih.',
    },
    monitoring: {
      label: 'Surat Monitoring PKL', subject: 'Monitoring Pembimbingan PKL',
      intro: (range: string) => `Dengan Hormat, bersama ini kami sampaikan daftar siswa yang berada dalam bimbingan kami beserta tempat PKL masing-masing, untuk keperluan monitoring pembimbingan pada masa PKL **${range}**:`,
      closing: 'Kami mohon bantuan Bapak / Ibu dalam memonitor dan membimbing siswa kami selama pelaksanaan PKL. Demikian surat ini kami sampaikan, atas perhatian serta kerjasamanya kami ucapkan terima kasih.',
    },
    penjemputan: {
      label: 'Surat Penjemputan Siswa', subject: 'Penjemputan Siswa PKL',
      intro: (range: string) => `Dengan Hormat, sehubungan dengan telah berakhirnya masa Praktek Kerja Lapangan (PKL) pada **${range}**, bersama ini kami daftarkan siswa-siswi kami yang kami tarik dari tempat PKL:`,
      closing: 'Mohon siswa-siswi tersebut diizinkan untuk tidak melaksanakan aktivitas PKL lagi di perusahaan Bapak / Ibu. Demikian surat ini kami sampaikan, atas perhatian serta kerjasamanya kami ucapkan terima kasih.',
    },
  },
  /** Teks Surat Penugasan Pembimbing. */
  assignment: {
    title: 'SURAT PENUGASAN',
    from: 'Kepala Sekolah Menengah Kejuruan (SMK) Negeri 9 Medan',
    defaultPosition: 'Guru Pembimbing',
    basis: (school: string) => `Keputusan Kepala Sekolah ${school} Nomor 400. 3.8.3/290 SMKN9/VI/2026 tentang pengangkatan pembimbing sekolah dalam pelaksanaan Praktek Kerja Lapangan (PKL).`,
    content: (range: string) => `Menugaskan bahwa nama yang tersebut diatas untuk melaksanakan **Pengantaran/Monitoring/Menjemput** siswa PKL yang dilaksanakan Mulai dari Tanggal **${range}** ke :`,
    closing: 'Demikian Surat Penugasan ini agar dapat dilaksanakan sebaik-baiknya.',
  },
} as const;

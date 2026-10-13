/** Konfigurasi layout PDF surat resmi. Semua ukuran dalam point (pt). */
export const LETTER_LAYOUT = {
  page: { margin: 56, bottomMargin: 40, contentBottom: 780, footerBottomOffset: 52 },
  fonts: {
    body: 11,
    footer: 9,
    table: 10,
    header: { government: 11, department: 11, schoolName: 16, program: 10, address: 20, contact: 20 },
    penugasanTitle: 14,
  },
  signature: {
    formal: { blockWidth: 250, nameOffsetY: 22, image: { offsetX: 28, offsetY: -42, width: 195, height: 58 } },
    penugasan: {
      rightOffset: 215,
      blockWidth: 215,
      positionOffsetX: 40,
      image: { offsetX: 22, offsetY: -2, width: 175, height: 62 },
      afterImageSpacing: 66,
      withoutImageSpacing: 36,
    },
  },
} as const;


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
  },
  /** Blok penerima umum untuk surat bulk multi-perusahaan. */
  recipient: {
    salutation: 'Bapak / Ibu Pimpinan Perusahaan',
    place: 'Di Tempat',
  },
  /** Label tabel Surat Permohonan satu siswa. */
  application: {
    subject: 'Permohonan PKL',
    greeting: 'Dengan Hormat,',
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
      label: 'Surat Monitoring PKL', subject: 'Monitoring Pembimbinan PKL',
      intro: (range: string) => `Dengan Hormat, bersama ini kami sampaikan daftar siswa yang berada dalam bimbingan kami beserta tempat PKL masing-masing, untuk keperluan monitoring pembimbinan pada masa PKL **${range}**:`,
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
    basis: (school: string) => `Keputusan Kepala Sekolah ${school} Nomor 400.3.8.3/290/SMKN9/VI/2026 tentang pengangkatan pembimbing sekolah dalam pelaksanaan Praktek Kerja Lapangan (PKL).`,
    content: (range: string) => `Menugaskan bahwa nama yang tersebut diatas untuk melaksanakan **Pengantaran/Monitoring/Menjemput** siswa PKL yang dilaksanakan Mulai dari Tanggal **${range}** ke :`,
    closing: 'Demikian Surat Penugasan ini agar dapat dilaksanakan sebaik-baiknya.',
  },
} as const;

import type { StepKey } from '@/composables/useWorkflowSteps';

/**
 * Naskah Julie — pemandu alur PKL siswa (Fase 1 & 2).
 *
 * Semua teks UI yang diucapkan host hidup di sini, bukan di dalam komponen,
 * supaya gaya bahasanya bisa dibaca dan diedit sekali lihat. Isi dialog tidak
 * pernah menyimpan progres: yang dibaca host adalah status dari
 * `GET /student/workflow`, jadi kalimatnya hanya berubah kalau kenyataan di
 * server berubah.
 *
 * Aturan penulisan yang dipegang:
 * 1. Satu peristiwa = satu naskah. "Barusan dikirim" dan "sudah tiga hari
 *    antre" bukan kalimat yang sama, meskipun statusnya sama-sama DIAJUKAN.
 * 2. Kalimat tidak boleh menyinggung tahap yang belum terjadi, dan tidak boleh
 *    mengulang kalimat tahap sebelumnya — siswa membuka halaman ini berkali-kali.
 * 3. Tiap balon boleh punya gambar sendiri (`[pose, teks]`); balon tanpa pose
 *    ikut suasana umum peristiwa itu.
 */

export type HostScenario =
  | 'question'
  | 'justSubmitted'
  | 'waiting'
  | 'approvedFresh'
  | 'prep'
  | 'justUploaded'
  | 'locked'
  | 'rejected'
  | 'review'
  | 'behind'
  | 'changeCompany'
  | 'doneAll';

export type HostPose = 'idle' | 'welcome' | 'explain' | 'think' | 'celebrate' | 'oops';

/** Teks saja = ikut pose suasana; `[pose, teks]` = gambar ditentukan per kalimat. */
export type HostLine = string | [HostPose, string];

/** Balon siap tampil: teks sudah diisi variabel, gambarnya sudah dipilih. */
export interface HostSpoken {
  text: string;
  pose: HostPose;
  /**
   * Kunci gambar khusus kalimat ini — `public/host/{art}.png`. Opsional: kalau
   * filenya belum ada, `HostCharacter` jatuh ke gambar pose enam varian, dan
   * baru ke kartu inisial. Jadi gambar boleh dibuat bertahap, satu per satu.
   */
  art?: string;
}

export const HOST_NAME = 'Julie';

/**
 * Nama gambar per kalimat. Polanya deterministik dari posisi kalimat di naskah,
 * jadi tidak perlu ditulis tangan di tiap baris dialog:
 *   tahap{1..6}-{suara}-{01..}   kalimat alur per tahap
 *   khusus-{suara}-{01..}        kalimat yang tidak terikat tahap
 *   reaksi-{suara}-{01..}        jawaban atas tombol/pilihan siswa
 *   buka-{01..} · usulkan-01     sapaan pertama & ajakan usulan tempat
 * Daftar lengkap + arah posenya: `docs/prompt-gambar-julie.txt`.
 */
const STEP_ART: Record<StepKey, string> = {
  pendaftaran: 'tahap1',
  'surat-permohonan': 'tahap2',
  'surat-penerimaan': 'tahap3',
  'data-ortu': 'tahap4',
  'surat-pernyataan': 'tahap5',
  'laporan-akhir': 'tahap6',
};

const SCENARIO_ART: Record<HostScenario, string> = {
  question: 'tanya',
  justSubmitted: 'terkirim',
  waiting: 'menunggu',
  approvedFresh: 'baru-diacc',
  prep: 'menyiapkan',
  justUploaded: 'baru-diunggah',
  locked: 'terkunci',
  rejected: 'ditolak',
  review: 'menunggu-palu',
  behind: 'terlambat',
  changeCompany: 'ganti-tempat',
  doneAll: 'selesai',
};

const ACTION_ART: Record<HostAction, string> = {
  pilih: 'pilih-kartu',
  pilihFile: 'pilih-file',
  draft: 'draft',
  ajukan: 'ajukan',
  unggah: 'unggah',
  unduh: 'unduh',
  buatSurat: 'buat-surat',
  simpan: 'simpan-ortu',
  sahkan: 'sahkan',
  ganti: 'ganti-pikiran',
  usulkan: 'usulkan-tempat',
  skip: 'lewati',
};

/** Variabel yang boleh dipakai: `{nama}`, `{perusahaan}`, `{note}`, `{tanggal}`, `{durasi}`, `{namaFile}`. */
export type HostVars = Partial<
  Record<'nama' | 'perusahaan' | 'note' | 'tanggal' | 'durasi' | 'namaFile', string>
>;

/** Aksi siswa yang punya balon reaksi sendiri. */
export type HostAction =
  | 'pilih'      // kartu perusahaan dipilih
  | 'pilihFile'  // file dipilih, belum diunggah
  | 'draft'
  | 'ajukan'
  | 'unggah'
  | 'unduh'
  | 'buatSurat'
  | 'simpan'
  | 'sahkan'
  | 'ganti'
  | 'usulkan'
  | 'skip';

/** Sapaan pembuka — hanya sekali per akun (lihat `useHostSession`). */
export const OPENING_LINES: HostLine[] = [
  ['welcome', 'Halo, {nama}. Selamat datang di Sistem Informasi PKL. Saya {host}, pemandu alur yang akan mengarahkan tahapan administrasi PKL Anda.'],
  ['explain', 'Setiap tahapan alur perlu diselesaikan secara berurutan sesuai petunjuk sistem. Pastikan seluruh dokumen dan data diisi dengan benar.'],
  ['idle', 'Status yang tertera di sistem ini terhubung langsung dengan proses verifikasi sekolah. Silakan ikuti instruksi pada setiap langkah berikut.'],
];

/**
 * Pintu keluar bagi siswa yang ingin mengajukan tempat PKL sendiri.
 */
export const PROPOSE_LINE: HostLine = [
  'welcome',
  'Apabila perusahaan yang Anda tuju belum terdaftar di sistem, Anda dapat mengajukan usulan tempat PKL baru melalui tautan yang tersedia.',
];

export const HOST_SCRIPT: Record<StepKey, Partial<Record<HostScenario, HostLine[]>>> = {
  pendaftaran: {
    question: [
      ['explain', 'Langkah 1: Silakan pilih perusahaan mitra tempat Anda akan melaksanakan kegiatan PKL.'],
      ['explain', 'Pilih salah satu perusahaan yang tersedia di bawah. Pastikan bidang usaha dan kuota sesuai dengan kebutuhan Anda.'],
      ['think', 'Perusahaan dengan status Kuota Penuh tidak dapat dipilih saat ini.'],
    ],
    justSubmitted: [
      ['celebrate', 'Pengajuan pendaftaran {nama} ke {perusahaan} telah berhasil dikirimkan.'],
      ['explain', 'Pengajuan tercatat {durasi}. Saat ini berkas pendaftaran sedang dalam antrean verifikasi oleh pihak sekolah.'],
      ['think', 'Mohon menunggu konfirmasi dan persetujuan dari koordinator PKL sekolah.'],
    ],
    waiting: [
      ['think', 'Pengajuan pendaftaran ke {perusahaan} masih menunggu proses verifikasi (diajukan {durasi}).'],
      ['explain', 'Pihak sekolah sedang memeriksa kesesuaian data pendaftaran Anda.'],
      ['idle', 'Jika membutuhkan informasi lebih lanjut mengenai status pengajuan, silakan hubungi koordinator PKL atau guru pembimbing Anda.'],
    ],
    rejected: [
      ['oops', 'Pengajuan pendaftaran ke {perusahaan} belum dapat disetujui oleh pihak sekolah.'],
      ['explain', 'Catatan admin: {note}'],
      ['welcome', 'Silakan pilih kembali perusahaan lain yang tersedia atau sesuaikan data pendaftaran Anda, kemudian ajukan ulang.'],
    ],
    changeCompany: [
      ['think', 'Konfirmasi pembatalan pendaftaran perusahaan.'],
      ['explain', 'Jika dibatalkan, kuota pada {perusahaan} akan dilepaskan kembali dan Anda dapat memilih perusahaan baru pada Langkah 1.'],
    ],
  },

  'surat-permohonan': {
    approvedFresh: [
      ['celebrate', 'Pendaftaran Anda di {perusahaan} telah disetujui oleh pihak sekolah.'],
      ['explain', 'Persetujuan tercatat {durasi}. Sistem sedang memproses penerbitan Surat Permohonan PKL resmi.'],
      ['think', 'Dokumen surat akan segera tersedia untuk diunduh setelah nomor surat terbit.'],
    ],
    prep: [
      ['think', 'Pendaftaran Anda telah disetujui ({durasi}), dan Surat Permohonan sedang dalam proses penyiapan oleh pihak sekolah.'],
      ['explain', 'Tidak ada tindakan tambahan yang diperlukan saat ini. Dokumen akan muncul otomatis setelah diverifikasi.'],
      ['idle', 'Jika dokumen belum muncul dalam 1x24 jam, Anda dapat mengonfirmasi kepada admin atau koordinator PKL.'],
    ],
    question: [
      ['celebrate', 'Langkah 2: Surat Permohonan PKL ke {perusahaan} telah siap.'],
      ['explain', 'Silakan unduh berkas PDF Surat Permohonan resmi, cetak, dan sampaikan kepada pihak perusahaan mitra.'],
      ['think', 'Setelah mengunduh surat, Anda dapat melanjutkan ke tahapan pengunggahan surat penerimaan dari perusahaan.'],
    ],
  },

  'surat-penerimaan': {
    question: [
      ['explain', 'Langkah 3: Unggah Surat Balasan / Penerimaan dari {perusahaan}.'],
      ['idle', 'Dokumen ini diperlukan sebagai bukti persetujuan resmi bahwa Anda diterima melaksanakan PKL di perusahaan mitra.'],
      ['explain', 'Pastikan berkas (format PDF atau gambar/foto) terbaca dengan jelas sebelum diunggah untuk verifikasi admin.'],
    ],
    justUploaded: [
      ['celebrate', 'Surat Penerimaan dari {perusahaan} telah berhasil diunggah ({durasi}).'],
      ['explain', 'Berkas saat ini terkunci selama proses pemeriksaan oleh pihak sekolah.'],
      ['think', 'Setelah diverifikasi dan disetujui, Anda akan diarahkan untuk melengkapi Data Orang Tua / Wali.'],
    ],
    locked: [
      ['think', 'Surat Penerimaan sedang dalam proses verifikasi oleh admin sekolah (diunggah {durasi}).'],
      ['explain', 'Dokumen tidak dapat diubah selama proses pemeriksaan berlangsung.'],
      ['idle', 'Hasil verifikasi akan diperbarui otomatis pada sistem setelah disetujui oleh admin.'],
    ],
    rejected: [
      ['oops', 'Surat Penerimaan yang diunggah belum dapat diverifikasi oleh admin.'],
      ['explain', 'Catatan admin: {note}'],
      ['welcome', 'Silakan perbaiki dokumen sesuai catatan di atas, kemudian unggah kembali berkas yang valid.'],
    ],
  },

  'data-ortu': {
    question: [
      ['celebrate', 'Surat Penerimaan telah diverifikasi dan disetujui.'],
      ['explain', 'Langkah 4: Silakan lengkapi Data Orang Tua atau Wali Anda.'],
      ['idle', 'Data ini digunakan untuk kelengkapan administrasi Surat Pernyataan dan arsip sekolah. Pastikan data diisi dengan benar.'],
    ],
  },

  'surat-pernyataan': {
    question: [
      ['explain', 'Langkah 5: Penerbitan dan Pengunggahan Surat Pernyataan PKL.'],
      ['idle', 'Alur pengurusan: unduh dokumen PDF, cetak, bubuhkan tanda tangan bermaterai, lalu unggah kembali ke sistem.'],
      ['think', 'Setelah diverifikasi oleh pihak sekolah, Anda resmi siap memasuki fase pelaksanaan PKL aktif.'],
    ],
  },

  'laporan-akhir': {
    question: [
      ['explain', 'Tahap Akhir: Unggah Laporan Akhir PKL untuk diverifikasi oleh guru pembimbing dan sekolah.'],
      ['idle', 'Penyelesaian laporan akhir merupakan salah satu syarat penerbitan sertifikat PKL.'],
    ],
  },
};

/** Dipakai saat semua langkah selesai, atau ketika siswa tertinggal oleh jadwal. */
export const SPECIAL_SCRIPT: Partial<Record<HostScenario, HostLine[]>> = {
  behind: [
    ['oops', 'Perhatian: Periode jadwal sekolah telah berganti, namun tahapan persyaratan Anda belum lengkap.'],
    ['explain', 'Mohon segera menyelesaikan langkah-langkah yang tertera agar tidak terlambat dari jadwal gelombang PKL.'],
  ],
  review: [
    ['think', 'Seluruh berkas persyaratan telah diajukan. Saat ini menunggu persetujuan dan pengesahan dari admin sekolah.'],
    ['idle', 'Status alur akan diperbarui secara otomatis setelah verifikasi selesai dilakukan.'],
  ],
  doneAll: [
    ['celebrate', 'Seluruh rangkaian alur persiapan PKL telah berhasil Anda selesaikan.'],
    ['idle', 'Silakan pantau perkembangan dan pengumuman selanjutnya melalui menu Dashboard.'],
  ],
};

/** Reaksi seketika atas tombol/pilihan siswa (server sering masih memproses). */
export const ACTION_SCRIPT: Record<HostAction, HostLine[]> = {
  pilih: [
    ['celebrate', 'Perusahaan {perusahaan} telah dipilih. Kuota pendaftaran masih tersedia.'],
    ['explain', 'Klik "Ajukan Pendaftaran" untuk mengirimkan permohonan ke sekolah, atau "Simpan Draft" untuk menyimpan sementara.'],
    ['idle', 'Perubahan pilihan masih dapat dilakukan sebelum pengajuan diverifikasi oleh admin.'],
  ],
  pilihFile: [
    ['explain', 'Berkas dipilih: {namaFile}.'],
    ['think', 'Pastikan dokumen terlihat jelas, memuat cap/tanda tangan resmi perusahaan, dan tidak terpotong.'],
    ['welcome', 'Silakan klik tombol "Unggah Surat Penerimaan" untuk melanjutkan pengiriman berkas.'],
  ],
  draft: [
    ['idle', 'Draft pendaftaran ke {perusahaan} berhasil disimpan.'],
    ['explain', 'Pengajuan belum dikirim ke pihak sekolah. Anda dapat mengubah atau mengajukannya kapan saja selama masa pendaftaran aktif.'],
  ],
  ajukan: [
    ['explain', 'Mengirimkan pengajuan pendaftaran ke {perusahaan}...'],
    ['think', 'Mohon tunggu sebentar, sistem sedang memproses pengajuan Anda.'],
  ],
  unggah: [
    ['explain', 'Mengunggah berkas {namaFile}...'],
    ['think', 'Mohon tunggu, dokumen sedang dikirimkan ke sistem verifikasi sekolah.'],
  ],
  unduh: [
    ['explain', 'Menyiapkan Surat Permohonan PKL ke {perusahaan}...'],
    ['think', 'Setelah berkas berhasil diunduh, segera cetak dan sampaikan ke perusahaan tujuan.'],
  ],
  buatSurat: [
    ['celebrate', 'Dokumen Surat Pernyataan PKL telah berhasil diterbitkan.'],
    ['explain', 'Silakan unduh dokumen, bubuhkan materai dan tanda tangan yang diperlukan, kemudian unggah kembali ke sistem.'],
    ['think', 'Admin sekolah akan mengesahkan dokumen setelah Anda mengunggah berkas yang telah ditandatangani.'],
  ],
  // Satu kalimat saja: halaman data ortu langsung mengalih balik ke alur utama
  simpan: [
    ['celebrate', 'Data orang tua / wali berhasil disimpan. Mengarahkan kembali ke alur persyaratan...'],
  ],
  // Halaman surat pernyataan langsung mengalih balik ke alur utama
  sahkan: [
    ['celebrate', 'Surat Pernyataan telah disahkan oleh admin sekolah. Mengarahkan kembali ke alur persyaratan...'],
  ],
  ganti: [
    ['think', 'Proses pergantian tempat PKL.'],
    ['explain', 'Perhatikan konfirmasi pembatalan. Jika disetujui, pendaftaran sebelumnya akan dibatalkan dan Anda dapat memilih perusahaan baru pada Langkah 1.'],
  ],
  usulkan: [
    ['welcome', 'Membuka formulir pengusulan tempat PKL baru.'],
    ['explain', 'Mohon isi data nama perusahaan, alamat, dan kontak yang dapat dihubungi secara lengkap dan akurat.'],
  ],
  skip: [['idle', 'Panduan sapaan dilewati. Silakan periksa instruksi pada kartu di bawah.']],
};

/** Pose bawaan per peristiwa — dipakai oleh balon yang tidak menentukan gambarnya sendiri. */
const SCENARIO_POSE: Record<HostScenario, HostPose> = {
  question: 'explain',
  justSubmitted: 'celebrate',
  waiting: 'think',
  approvedFresh: 'celebrate',
  prep: 'think',
  justUploaded: 'celebrate',
  locked: 'think',
  rejected: 'oops',
  review: 'think',
  behind: 'oops',
  changeCompany: 'think',
  doneAll: 'celebrate',
};

export const hostPoseFor = (scenario?: HostScenario): HostPose =>
  scenario ? SCENARIO_POSE[scenario] : 'idle';

/**
 * Pengisi variabel yang tidak ikut dikirim. Halaman tugas (Data Orang Tua,
 * Usulan Tempat) tidak punya status selengkap panggung kuis; tanpa nilai cadangan
 * kalimatnya bolong — "Balasan dari disetujui" — jadi placeholder selalu punya
 * fallback netral.
 */
const DEFAULT_VARS: Required<HostVars> = {
  nama: 'kamu',
  perusahaan: 'perusahaanmu',
  note: 'belum ada catatan tertulis dari admin',
  tanggal: 'tanggal yang tercantum di jadwal',
  durasi: 'baru saja',
  namaFile: 'filenya',
};

/** Isi placeholder `{...}` dalam satu baris naskah. Variabel kosong pakai fallback netral. */
export const renderLine = (template: string, vars: HostVars): string =>
  template
    .replace(/\{host\}/g, HOST_NAME)
    .replace(
      /\{(nama|perusahaan|note|tanggal|durasi|namaFile)\}/g,
      (_, name: string) => {
        const key = name as keyof HostVars;
        return vars[key]?.trim() || DEFAULT_VARS[key];
      }
    );

const resolve = (line: HostLine, defaultPose: HostPose, vars: HostVars): HostSpoken =>
  typeof line === 'string'
    ? { text: renderLine(line, vars), pose: defaultPose }
    : { text: renderLine(line[1], vars), pose: line[0] };

/** Nomor urut kalimat jadi nama file: `prefix-01`, `prefix-02`, dst. */
const numbered = (lines: HostLine[], prefix: string, pose: HostPose, vars: HostVars): HostSpoken[] =>
  lines.map((line, i) => ({
    ...resolve(line, pose, vars),
    art: `${prefix}-${String(i + 1).padStart(2, '0')}`,
  }));

/** Prefix gambar satu blok naskah tahap: `tahap3-ditolak`, atau `khusus-terlambat`. */
const blockArt = (stepKey: StepKey, scenario: HostScenario): string => {
  const suara = SCENARIO_ART[scenario];
  return HOST_SCRIPT[stepKey]?.[scenario] ? `${STEP_ART[stepKey]}-${suara}` : `khusus-${suara}`;
};

/**
 * Susun antrean balon untuk satu peristiwa.
 * `intro` menambah sapaan pembuka; `propose` menempelkan ajakan usulan tempat
 * (hanya Tahap 1) — dua-duanya opsional supaya pemanggil tidak menyalin logika.
 */
export const scriptFor = (
  stepKey: StepKey,
  scenario: HostScenario | undefined,
  vars: HostVars,
  options: { intro?: boolean; propose?: boolean } = {}
): HostSpoken[] => {
  const pose = hostPoseFor(scenario);
  const spoken: HostSpoken[] = [];
  if (options.intro) spoken.push(...numbered(OPENING_LINES, 'buka', pose, vars));
  const lines: HostLine[] =
    scenario === 'doneAll'
      ? SPECIAL_SCRIPT.doneAll ?? []
      : scenario
        ? HOST_SCRIPT[stepKey]?.[scenario] ?? SPECIAL_SCRIPT[scenario] ?? []
        : [];
  if (scenario) spoken.push(...numbered(lines, blockArt(stepKey, scenario), pose, vars));
  if (options.propose) spoken.push(...numbered([PROPOSE_LINE], 'usulkan', pose, vars));

  // Balon yang sama persinya dengan balon sebelumnya dibuang: Julie tidak mengulang
  // kalimatnya sendiri di satu percakapan.
  return spoken.filter((item, i) => i === 0 || item.text !== spoken[i - 1].text);
};

/** Balon reaksi untuk aksi siswa; kosong kalau aksinya tidak dikenal. */
export const actionLines = (action: HostAction, vars: HostVars): HostSpoken[] =>
  numbered(ACTION_SCRIPT[action] ?? [], `reaksi-${ACTION_ART[action]}`, 'explain', vars);

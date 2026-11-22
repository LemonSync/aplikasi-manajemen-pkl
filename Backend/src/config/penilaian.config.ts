/**
 * Butir penilaian Fase 4 — disalin apa adanya dari LEMBARAN PENILAIAN
 * (Backend/surat_pkl/sertifikat.docx halaman 2). Sekolah yang mengubah bunyi
 * butir cukup mengubah berkas ini; form siswa, PDF, dan validasi ikut mengikuti.
 */

export interface PenilaianItem {
  /** Huruf butir pada lembar penilaian ('a', 'b', ...). */
  code: string;
  label: string;
}

export interface PenilaianGroup {
  /** Nomor kelompok pada kolom "No". */
  no: string;
  title: string;
  items: PenilaianItem[];
}

export const PENILAIAN_GROUPS: PenilaianGroup[] = [
  {
    no: '1',
    title: 'Aspek Sikap/ Softskill',
    items: [
      { code: 'a', label: 'Penampilan dan kerapihan pakaian' },
      { code: 'b', label: 'Komitmen dan integritas' },
      { code: 'c', label: 'Menghargai dan menghormati' },
      { code: 'd', label: 'Kreativitas' },
      { code: 'e', label: 'Kerja sama tim' },
      { code: 'f', label: 'Disiplin dan tanggung jawab' },
    ],
  },
  {
    no: '2',
    title: 'Aspek Pengetahuan/ Knowledge',
    items: [
      { code: 'a', label: 'Penguasaan Keilmuan' },
      { code: 'b', label: 'Kemampuan mengidentifikasi masalah' },
      { code: 'c', label: 'Kemampuan menemukan alternatif solusi secara kreatif' },
    ],
  },
  {
    no: '3',
    title: 'Aspek Ketrampilan/Hardskill',
    items: [
      { code: 'a', label: 'Keahlian dan Ketrampilan' },
      { code: 'b', label: 'Inovasi dan Kreativitas' },
      { code: 'c', label: 'Produktivitas dan penyelesaian tugas' },
      { code: 'd', label: 'Penguasaan Alat Kerja' },
    ],
  },
];

/** Kunci butir "groupCode:code" — urutan sama dengan lembar penilaian. */
export const PENILAIAN_ITEMS: Array<PenilaianItem & { groupCode: string; label: string }> =
  PENILAIAN_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, groupCode: g.no, label: i.label })));

/** Kode kelompok yang diakui ('1' | '2' | '3'). */
export const PENILAIAN_GROUP_CODES = PENILAIAN_GROUPS.map((g) => g.no) as [string, ...string[]];

/** Kunci lengkap tiap butir — acuan validasi "semua butir wajib diisi". */
export const PENILAIAN_ITEM_KEYS = PENILAIAN_ITEMS.map((i) => `${i.groupCode}:${i.code}`);

/** Label resmi butir menurut kunci — judul yang dikirim klien selalu diganti yang ini. */
export const PENILAIAN_LABEL_BY_KEY: Record<string, string> = Object.fromEntries(
  PENILAIAN_ITEMS.map((i) => [`${i.groupCode}:${i.code}`, i.label])
);

/**
 * Rentang skor → predikat. Angka ini dicetak sebagai keterangan pada kolom
 * "Keterangan" lembar penilaian sekolah, jadi jadi acuan tunggal sistem.
 */
export const PENILAIAN_SCALE = [
  { letter: 'A', label: 'Sangat Baik', min: 90, range: '90 – 100' },
  { letter: 'B', label: 'Baik', min: 80, range: '80 – 89' },
  { letter: 'C', label: 'Cukup', min: 75, range: '75 – 79' },
  { letter: 'D', label: 'Kurang', min: 0, range: '<75' },
] as const;

/** Legenda yang dicetak di sel "Keterangan" (baris 1 s.d. 19 menyatu). */
export const PENILAIAN_LEGEND = PENILAIAN_SCALE.map(
  (s) => `${s.letter}  =  ${s.label} :  ${s.range}`
);

/** Bobot Nilai Akhir: 80% rata-rata butir, 20% nilai laporan PKL. */
export const PENILAIAN_WEIGHTS = { aspek: 80, laporan: 20 } as const;

export const PREDICATE_OF = (score: number): (typeof PENILAIAN_SCALE)[number] =>
  PENILAIAN_SCALE.find((s) => score >= s.min) ?? PENILAIAN_SCALE[PENILAIAN_SCALE.length - 1];

export const predicateLabel = (letter: string | null | undefined): string =>
  PENILAIAN_SCALE.find((s) => s.letter === letter)?.label ?? '';

/** Rata-rata butir penilaian (kelompok 1, 2, dan 3). */
export const averageAspectScore = (scores: number[]): number =>
  scores.length === 0
    ? 0
    : Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 100) / 100;

/** NA = rata-rata butir x 80% + nilai laporan x 20%. */
export const computeFinalScore = (aspectsAverage: number, reportScore: number): number =>
  Math.round(
    (aspectsAverage * (PENILAIAN_WEIGHTS.aspek / 100) + reportScore * (PENILAIAN_WEIGHTS.laporan / 100)) * 100
  ) / 100;

export const PENILAIAN_FOOTNOTE =
  '*NA = (Nilai Rata-rata 1,2, &3) x 80% + (Nilai Laporan PKL) x 20%';

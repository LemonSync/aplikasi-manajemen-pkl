import type { WaGuide } from '@/services/api.service';

/** Samakan dengan MAX_INLINE_BUTTONS / MAX_BUTTON_MESSAGES / BUTTON_TEXT_MAX di waReplier.service.ts. */
export const MAX_INLINE_BUTTONS = 3;
export const MAX_BUTTON_MESSAGES = 2;
export const BUTTON_TEXT_MAX = 26;
/** Backend menolak cabang lebih dalam dari ini (root = tingkat 0). */
export const MAX_DEPTH = 3;

/** Nama tingkat — "depth 0/1/2" tidak berarti apa-apa bagi admin. */
export const LEVEL_NAME = ['Menu awal', 'Topik', 'Langkah', 'Langkah lanjutan'] as const;
export const LEVEL_HINT = [
  'Tombol pertama yang dikirim bot begitu ada yang chat.',
  'Topik di dalam satu peran.',
  'Isi pesan yang dikirim bot: langkah-langkah (boleh dengan gambar).',
  'Langkah tambahan di bawah sebuah langkah — tingkat paling dalam.',
] as const;

export type PreviewMode = 'tombol' | 'daftar' | 'teks';

/**
 * Cara bot menampilkan cabang ini. WhatsApp hanya menampilkan tiga tombol per pesan,
 * jadi sampai 6 pilihan dikirim sebagai (maks) dua pesan tombol; lebih dari itu bot
 * mengirim daftar bernomor yang bisa dijawab dengan mengetik angkanya.
 */
export const previewModeFor = (children: Array<{ label: string }>): PreviewMode => {
  if (children.length === 0) return 'teks';
  return children.length <= MAX_INLINE_BUTTONS * MAX_BUTTON_MESSAGES ? 'tombol' : 'daftar';
};

/** Peringatan kalau label akan dipotong WhatsApp (hanya tombol yang punya batas). */
export const truncationNote = (children: Array<{ label: string }>, mode: PreviewMode): string | null => {
  if (mode !== 'tombol') return null;
  const tooLong = children.filter((c) => c.label.length > BUTTON_TEXT_MAX);
  if (tooLong.length === 0) return null;
  return `Label ${tooLong.map((c) => `“${c.label}”`).join(', ')} lebih dari ${BUTTON_TEXT_MAX} karakter — tombolnya akan tampil terpotong menjadi “${tooLong[0].label.slice(0, BUTTON_TEXT_MAX)}”.`;
};

export const childButtonLabel = (depth: number): string => {
  if (depth === 0) return 'Topik';
  if (depth === MAX_DEPTH - 1) return 'Langkah lanjutan';
  return 'Langkah';
};

export const sortByOrder = (a: WaGuide, b: WaGuide): number => a.order - b.order || a.label.localeCompare(b.label);

export interface GuideActions {
  edit(guide: WaGuide): void;
  addChild(guide: WaGuide): void;
  setActive(guide: WaGuide): void;
  remove(guide: WaGuide): void;
  setImage(guide: WaGuide, file: File): void;
  dropImage(guide: WaGuide): void;
  toggleExpand(guide: WaGuide): void;
  isExpanded(guide: WaGuide): boolean;
}

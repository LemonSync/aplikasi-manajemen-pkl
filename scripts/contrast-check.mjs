const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const cr = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const P = {
  50: [240, 246, 242], 100: [219, 235, 224], 200: [183, 215, 194], 300: [134, 188, 155],
  400: [79, 154, 114], 500: [47, 125, 87], 600: [31, 97, 68], 700: [23, 78, 55],
  800: [18, 61, 44], 900: [13, 43, 32],
};
const K = {
  50: [243, 246, 243], 100: [235, 239, 236], 200: [216, 223, 218], 300: [181, 191, 185],
  400: [96, 110, 102], 500: [88, 102, 94], 600: [63, 76, 69], 700: [42, 54, 48],
  800: [26, 38, 32], 900: [13, 26, 21], 950: [6, 15, 12],
};
const SEM = {
  ok: [26, 112, 51], 'ok-soft': [238, 248, 239], 'ok-500': [35, 137, 63], 'ok-600': [26, 112, 51],
  'ok-700': [23, 92, 43],
  no: [180, 27, 27], 'no-soft': [254, 242, 242], 'no-700': [150, 26, 26],
  warn: [176, 84, 8], 'warn-soft': [255, 249, 233], 'warn-700': [143, 64, 14],
  info: [35, 64, 114], 'info-soft': [240, 244, 250],
};
const BG = [242, 247, 245]; // --bg: hijau berkabut sangat terang
const SIDEBAR = P[900]; // --sidebar / bg-primary-900
const WHITE = [255, 255, 255];

const rows = [
  ['putih di atas p-600 (btn primary)', WHITE, P[600], 4.5],
  ['putih di atas p-700 (btn hover)', WHITE, P[700], 4.5],
  ['text-primary-700 di atas --bg', P[700], BG, 4.5],
  ['text-primary-700 di atas surface', P[700], WHITE, 4.5],
  ['text-primary-600 di atas p-50 (chip)', P[600], P[50], 4.5],
  ['text-ink-400 (muted) di atas --bg', K[400], BG, 4.5],
  ['text-ink-500 di atas --bg', K[500], BG, 4.5],
  ['text-ink-600 di atas --bg', K[600], BG, 4.5],
  ['text-ink-800 (body) di atas --bg', K[800], BG, 4.5],
  ['text-ink-900 (judul) di atas --bg', K[900], BG, 4.5],
  ['border k-300 vs --bg (non-teks)', K[300], BG, 1.5],
  ['sidebar p-900 + text white', WHITE, SIDEBAR, 4.5],
  ['sidebar p-900 + ink-300', K[300], SIDEBAR, 4.5],
  ['badge ok', SEM.ok, SEM['ok-soft'], 4.5],
  ['badge no', SEM.no, SEM['no-soft'], 4.5],
  ['badge warn', SEM.warn, SEM['warn-soft'], 4.5],
  ['badge info', SEM.info, SEM['info-soft'], 4.5],
  ['badge primary-50', P[700], P[50], 4.5],
  ['putih di atas p-500 (gradien hero)', WHITE, P[500], 3],
  ['ink-700 di atas primary-50 (row hover)', K[700], P[50], 4.5],
  ['primary-600 di atas surface', P[600], WHITE, 3],
  ['accent p-400 vs sidebar (garis non-teks)', P[400], SIDEBAR, 3],
  ['ink-300/65 di atas sidebar', [122, 139, 131], SIDEBAR, 3],

  // --- pasangan dari renovasi hutan/radius-0 ---
  ['putih di atas k-800 (gradien hero, via)', WHITE, K[800], 4.5],
  ['putih di atas p-900 (gradien hero, to)', WHITE, P[900], 4.5],
  ['ink-200 di atas k-900 (paragraf hero)', K[200], K[900], 4.5],
  ['primary-300 di atas k-900 (eyebrow)', P[300], K[900], 4.5],
  ['primary-200 di atas k-900 (chip masa)', P[200], K[900], 4.5],
  ['ink-300 di atas k-900 (footer login)', K[300], K[900], 4.5],
  ['putih di atas ok-600 (penanda langkah selesai)', WHITE, SEM['ok-600'], 4.5],
  ['putih di atas p-800 (gradien penanda angka)', WHITE, P[800], 4.5],
  ['ink-400 di atas surface (label langkah)', K[400], WHITE, 4.5],
  ['ink-500 di atas surface', K[500], WHITE, 4.5],
  ['ink-600 di atas surface', K[600], WHITE, 4.5],
  ['ink-900 di atas p-50 (kartu langkah aktif)', K[900], P[50], 4.5],
  ['primary-700 di atas p-50 (teks langkah)', P[700], P[50], 4.5],
  ['ok-700 di atas ok-50', SEM['ok-700'], SEM['ok-soft'], 4.5],
  ['ok-600 di atas ok-50', SEM['ok-600'], SEM['ok-soft'], 4.5],
  ['no-700 di atas no-50', SEM['no-700'], SEM['no-soft'], 4.5],
  ['warn-700 di atas warn-50', SEM['warn-700'], SEM['warn-soft'], 4.5],
  ['info-700 di atas info-50 (kartu tunggu)', SEM.info, SEM['info-soft'], 4.5],
];

let worst = 0;
for (const [name, fg, bg, need] of rows) {
  const c = cr(fg, bg);
  const flag = c >= need ? 'OK ' : 'GG ';
  if (c < need) worst = Math.max(worst, need - c);
  console.log(`${flag} ${c.toFixed(2).padStart(5)} : 1  (butuh ${need})  ${name}`);
}
console.log(worst === 0 ? '\nSEMUA LOLOS' : `\nADA YANG GAGAL, selisih terbesar ${worst.toFixed(2)}`);

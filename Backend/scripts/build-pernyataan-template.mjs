import JSZip from 'jszip';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'surat_pkl', 'SURAT PERNYATAAN PKL-SISWA.docx');
const OUT = join(__dirname, '..', 'src', 'templates', 'surat-pernyataan-pkl.docx');
const E = String.fromCharCode(8230); // U+2026 "…"
const DOTS = E + '+\\.?'; // run of ellipsis + optional trailing period

const buf = readFileSync(SRC);
const zip = await JSZip.loadAsync(buf);
let xml = await zip.file('word/document.xml').async('string');

function re(pattern, replacement, label) {
  const before = xml;
  xml = xml.replace(pattern, replacement);
  if (xml === before) throw new Error('PATTERN TIDAK DITEMUKAN: ' + label);
}

// Nama Siswa/I
re(
  new RegExp('(Nama Siswa/I</w:t><w:tab/><w:t xml:space="preserve">:\\s*)' + DOTS + '(</w:t>)'),
  '$1{nama_siswa}$2',
  'nama_siswa'
);
// Kelas / Program Keahlian
re(
  new RegExp('(Kelas/Prog\\. Keahlian\\s*:\\s*)XII-RPL' + E + '\\./Rekayasa Perangkat Lunak(</w:t>)'),
  '$1{kelas_jurusan}$2',
  'kelas_jurusan'
);
// Nama Orang Tua/Wali
re(
  new RegExp('(Nama Orang Tua/Wali\\s*:\\s*)' + DOTS + '(</w:t>)'),
  '$1{nama_ortu}$2',
  'nama_ortu'
);
// Alamat Siswa/i (baris pertama)
re(
  new RegExp('(Alamat Siswa/i</w:t><w:tab/><w:t xml:space="preserve">:\\s*)' + DOTS + '(</w:t>)'),
  '$1{alamat_siswa}$2',
  'alamat_siswa'
);
// Baris lanjutan: hilangkan titik-titik di awal baris
re(
  new RegExp('<w:t xml:space="preserve">' + DOTS + ' No\\. HP\\. Orang Tua</w:t>'),
  '<w:t xml:space="preserve"> No. HP. Orang Tua</w:t>',
  'lanjutan_alamat'
);
// No. HP Orang Tua / HP Siswa / Tempat PKL
re(
  new RegExp('(:\\s*)' + DOTS + '( HP\\. Siswa:\\s*)' + DOTS + '(\\. Tempat PKL</w:t><w:tab/><w:t xml:space="preserve">:\\s*)' + DOTS + '(</w:t>)'),
  '$1{hp_ortu}$2{hp_siswa}$3{tempat_pkl}$4',
  'hp_tempat'
);
// Tanggal PKL (cetak tebal)
re(
  /<w:t xml:space="preserve">Tanggal\s+15 Juli 2025 s\.d\. 15 November 2025 <\/w:t>/,
  '<w:t xml:space="preserve">Tanggal {tanggal_pkl} </w:t>',
  'tanggal_pkl'
);
// Tahun Pelajaran
re(
  /(Tahun Pelajaran )2025\/2026( dengan ini menyatakan:)/,
  '$1{tahun_pelajaran}$2',
  'tahun_pelajaran'
);
// Medan, Juli 2025 -> Medan, {bulan_tahun}
re(/<w:t xml:space="preserve">Juli <\/w:t>/, '<w:t xml:space="preserve">{bulan_tahun} </w:t>', 'bulan');
re(/<w:t xml:space="preserve">202<\/w:t>/, '<w:t xml:space="preserve"></w:t>', 'tahun-202');
re(/<w:t xml:space="preserve">5<\/w:t>/, '<w:t xml:space="preserve"></w:t>', 'tahun-5');

const placeholders = [
  'nama_siswa', 'kelas_jurusan', 'nama_ortu', 'alamat_siswa',
  'hp_ortu', 'hp_siswa', 'tempat_pkl', 'tanggal_pkl', 'tahun_pelajaran', 'bulan_tahun',
];
for (const ph of placeholders) {
  if (!xml.includes('{' + ph + '}')) throw new Error('Placeholder hilang: ' + ph);
}

zip.file('word/document.xml', xml);
mkdirSync(dirname(OUT), { recursive: true });
const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
writeFileSync(OUT, out);
console.log('OK master template ->', OUT);
console.log('Placeholders:', placeholders.join(', '));
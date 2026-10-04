import JSZip from 'jszip';
import { readFileSync } from 'fs';
import { join } from 'path';

const file = join(process.cwd(), 'surat_pkl', 'SURAT PERNYATAAN PKL-SISWA.docx');
const buf = readFileSync(file);
const zip = await JSZip.loadAsync(buf);
console.log('=== ENTRIES ===');
for (const name of Object.keys(zip.files)) console.log(name);
const xml = await zip.file('word/document.xml').async('string');
console.log('=== DOCUMENT.XML (raw, length ' + xml.length + ') ===');
console.log(xml);

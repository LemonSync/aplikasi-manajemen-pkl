import PDFDocument from 'pdfkit';

/**
 * Template Surat Pernyataan Peserta PKL (PDF).
 * Berisi: peraturan, persyaratan, data siswa, blok tanda tangan (siswa, ortu, wali kelas), materai.
 */

const MARGIN = 56;
const FONT = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';

export interface PernyataanPdfData {
  namaSiswa: string;
  kelasJurusan: string;
  namaOrtu: string;
  alamatSiswa: string;
  hpOrtu: string;
  hpSiswa: string;
  tempatPkl: string;
  tanggalPkl: string;
  tahunPelajaran: string;
  namaWaliKelas: string;
  kota: string;
  tanggalSurat: string;
}

export const renderPernyataanPdf = (data: PernyataanPdfData): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // --- Judul ---
      doc.font(FONT_BOLD).fontSize(14).text('SURAT PERNYATAAN', { align: 'center' });
      doc.font(FONT_BOLD).fontSize(12).text('PESERTA PRAKTIK KERJA LAPANGAN', { align: 'center' });
      doc.moveDown(0.5);
      doc.font(FONT).fontSize(10).text(`Tahun Pelajaran ${data.tahunPelajaran}`, { align: 'center' });
      doc.moveDown(1.5);

      // --- Isi Surat ---
      doc.font(FONT).fontSize(11);
      doc.text('Yang bertanda tangan di bawah ini:', { align: 'left' });
      doc.moveDown(0.5);

      // Data Siswa
      doc.font(FONT_BOLD).fontSize(11).text('I. Data Siswa');
      doc.font(FONT).fontSize(11);
      doc.text(`Nama\t\t: ${data.namaSiswa}`);
      doc.text(`Kelas\t\t: ${data.kelasJurusan}`);
      doc.text(`No. HP\t\t: ${data.hpSiswa}`);
      doc.text(`Alamat\t\t: ${data.alamatSiswa}`);
      doc.moveDown(0.8);

      // Data Orang Tua
      doc.font(FONT_BOLD).fontSize(11).text('II. Data Orang Tua / Wali');
      doc.font(FONT).fontSize(11);
      doc.text(`Nama\t\t: ${data.namaOrtu}`);
      doc.text(`No. HP\t\t: ${data.hpOrtu}`);
      doc.moveDown(0.8);

      // Data PKL
      doc.font(FONT_BOLD).fontSize(11).text('III. Data Praktik Kerja Lapangan');
      doc.font(FONT).fontSize(11);
      doc.text(`Tempat PKL\t: ${data.tempatPkl}`);
      doc.text(`Periode\t\t: ${data.tanggalPkl}`);
      doc.moveDown(1);

      // Pernyataan
      doc.font(FONT_BOLD).fontSize(11).text('IV. Surat Pernyataan');
      doc.font(FONT).fontSize(11);
      doc.text('Dengan ini saya menyatakan bahwa:', { align: 'left' });
      doc.moveDown(0.3);

      const pernyataan = [
        '1. Saya menaati seluruh peraturan yang berlaku di tempat Praktik Kerja Lapangan.',
        '2. Saya bersedia melaksanakan PKL selama periode yang telah ditentukan.',
        '3. Saya bertanggung jawab atas keselamatan dan keamanan diri sendiri selama PKL.',
        '4. Saya tidak akan melakukan perbuatan yang merugikan nama baik sekolah maupun tempat PKL.',
        '5. Saya bersedia menerima sanksi apabila melanggar peraturan yang berlaku.',
        '6. Surat pernyataan ini dibuat dengan sebenarnya dan dapat dipertanggungjawabkan.',
      ];
      pernyataan.forEach((p) => {
        doc.text(p, { align: 'justify', indent: 20, lineGap: 2 });
      });
      doc.moveDown(2);

      // --- Blok Tanda Tangan ---
      const pageWidth = doc.page.width - MARGIN * 2;
      const colWidth = pageWidth / 3;

      // Siswa (kiri)
      const leftX = MARGIN;
      doc.font(FONT).fontSize(11).text(`${data.kota}, ${data.tanggalSurat}`, leftX, doc.y, { width: colWidth, align: 'center' });
      doc.moveDown(0.3);
      doc.text('(                           )', leftX, doc.y, { width: colWidth, align: 'center' });
      doc.moveDown(2.5);
      doc.font(FONT_BOLD).text('Tanda Tangan Siswa', leftX, doc.y, { width: colWidth, align: 'center' });
      doc.font(FONT);
      doc.moveDown(0.3);
      doc.text(`(${data.namaSiswa})`, leftX, doc.y, { width: colWidth, align: 'center' });
      doc.moveDown(0.3);
      doc.text('Materai Rp 10.000', leftX, doc.y, { width: colWidth, align: 'center' });

      // Orang Tua (tengah)
      const centerX = MARGIN + colWidth;
      // Hitung Y yang sama dengan blok kiri
      const blockTop = doc.y - 7;
      doc.text('(                           )', centerX, blockTop + 52, { width: colWidth, align: 'center' });
      doc.font(FONT_BOLD).text('Tanda Tangan Orang Tua', centerX, blockTop + 82, { width: colWidth, align: 'center' });
      doc.font(FONT);
      doc.moveDown(0.3);
      doc.text(`(${data.namaOrtu})`, centerX, doc.y, { width: colWidth, align: 'center' });

      // Wali Kelas (kanan)
      const rightX = MARGIN + colWidth * 2;
      doc.y = blockTop;
      doc.font(FONT).fontSize(11);
      doc.text('(                           )', rightX, blockTop + 52, { width: colWidth, align: 'center' });
      doc.font(FONT_BOLD).text('Tanda Tangan Wali Kelas', rightX, blockTop + 82, { width: colWidth, align: 'center' });
      doc.font(FONT);
      doc.moveDown(0.3);
      doc.text(`(${data.namaWaliKelas})`, rightX, doc.y, { width: colWidth, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

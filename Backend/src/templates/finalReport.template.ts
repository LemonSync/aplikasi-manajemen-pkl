import PDFDocument from 'pdfkit';

/**
 * Template Laporan Hasil PKL per kelompok (multi-halaman).
 * Bagian nilai akhir DUDI mengikuti data masuk: bila DUDI belum menginput
 * nilai, sel nilai dikosongkan (tabel tetap tampil tanpa angka).
 */

export interface FinalReportData {
  school: { name: string; address: string; phone?: string; email?: string; city?: string };
  issuedAt: Date;
  group: { code: string; name: string; cohortName: string | null; majorName: string | null };
  company: { name: string; address: string; city: string | null };
  period: { from: string | null; to: string | null };
  supervisors: string[];
  members: Array<{ nisn: string; fullName: string }>;
  attendanceSummary: Array<{ fullName: string; hadir: number; izin: number; sakit: number; alpha: number }>;
  attendanceRows: Array<{ date: string; fullName: string; status: string; activity: string }>;
  visits: Array<{ scheduledAt: string; visitedAt: string | null; status: string; supervisor: string; note: string | null }>;
  journals: Array<{ date: string; fullName: string; activity: string; result: string | null }>;
  grades: Array<{ fullName: string; nisn: string; scoreDudi: string | null; predicate: string | null; note: string | null }>;
}

const MARGIN = 48;
const FONT = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';

interface Column {
  header: string;
  width: number;
  align?: 'left' | 'center' | 'right';
}

const ROW_BOTTOM = (doc: PDFKit.PDFDocument): number => doc.page.height - MARGIN;

const drawTable = (doc: PDFKit.PDFDocument, columns: Column[], rows: string[][]): void => {
  const fontSize = 8.5;
  const pad = 4;

  const writeHeader = (): void => {
    doc.font(FONT_BOLD).fontSize(fontSize);
    const heights = columns.map((c) => doc.heightOfString(c.header, { width: c.width - pad * 2 }) + pad * 2);
    const h = Math.max(...heights, 16);
    if (doc.y + h > ROW_BOTTOM(doc)) doc.addPage();
    let x = MARGIN;
    const y = doc.y;
    columns.forEach((c) => {
      doc.rect(x, y, c.width, h).fillAndStroke('#e5e7eb', '#9ca3af');
      doc.fillColor('#111827').text(c.header, x + pad, y + pad, {
        width: c.width - pad * 2,
        align: c.align ?? 'left',
      });
      x += c.width;
    });
    doc.fillColor('#000000');
    doc.y = y + h;
  };

  writeHeader();

  for (const row of rows) {
    doc.font(FONT).fontSize(fontSize);
    const heights = row.map((cell, i) =>
      doc.heightOfString(cell ?? '', { width: columns[i]!.width - pad * 2 }) + pad * 2
    );
    const h = Math.max(...heights, 15);
    if (doc.y + h > ROW_BOTTOM(doc)) {
      doc.addPage();
      writeHeader();
    }
    let x = MARGIN;
    const y = doc.y;
    row.forEach((cell, i) => {
      const c = columns[i];
      doc.rect(x, y, c.width, h).stroke('#d1d5db');
      doc.fillColor('#111827').text(cell ?? '', x + pad, y + pad, {
        width: c.width - pad * 2,
        align: c.align ?? 'left',
      });
      x += c.width;
    });
    doc.fillColor('#000000');
    doc.y = y + h;
  }
  doc.moveDown(0.8);
};

const sectionTitle = (doc: PDFKit.PDFDocument, text: string): void => {
  if (doc.y > doc.page.height - MARGIN - 70) doc.addPage();
  doc.moveDown(0.5);
  doc.font(FONT_BOLD).fontSize(11).fillColor('#1f2937').text(text);
  doc
    .moveTo(MARGIN, doc.y + 2)
    .lineTo(doc.page.width - MARGIN, doc.y + 2)
    .strokeColor('#9ca3af')
    .stroke();
  doc.moveDown(0.5);
  doc.fillColor('#000000');
};

const infoLine = (doc: PDFKit.PDFDocument, label: string, value: string): void => {
  doc.font(FONT).fontSize(9.5);
  const y = doc.y;
  doc.font(FONT_BOLD).text(`${label}: `, MARGIN, y, { continued: true, width: 140 });
  doc.font(FONT).text(value || '-', { width: doc.page.width - MARGIN * 2 - 140 });
};

export const renderFinalReportPdf = (data: FinalReportData): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: MARGIN,
        info: { Title: `Laporan Hasil PKL - ${data.group.name}` },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // --- Kop surat sekolah ---
      doc.font(FONT_BOLD).fontSize(15).text(data.school.name.toUpperCase(), { align: 'center' });
      doc.font(FONT).fontSize(9);
      doc.text(data.school.address, { align: 'center' });
      const contact = [data.school.phone, data.school.email].filter(Boolean).join(' | ');
      if (contact) doc.text(contact, { align: 'center' });
      doc.moveDown(0.4);
      doc
        .moveTo(MARGIN, doc.y)
        .lineTo(doc.page.width - MARGIN, doc.y)
        .strokeColor('#111827')
        .stroke();
      doc.moveDown(1);

      // --- Judul ---
      doc.font(FONT_BOLD).fontSize(13).text('LAPORAN HASIL PRAKTIK KER LAPANGAN', { align: 'center' });
      doc.font(FONT).fontSize(10).text(`Kelompok ${data.group.name} (${data.group.code})`, {
        align: 'center',
      });
      doc.moveDown(1.2);

      // --- A. Identitas ---
      sectionTitle(doc, 'A. IDENTITAS KELOMPOK');
      infoLine(doc, 'Nama Kelompok', data.group.name);
      infoLine(doc, 'Kode Kelompok', data.group.code);
      infoLine(doc, 'Gelombang', data.group.cohortName ?? '-');
      infoLine(doc, 'Jurusan', data.group.majorName ?? '-');
      infoLine(doc, 'Perusahaan (DUDI)', data.company.name);
      infoLine(doc, 'Alamat Perusahaan', data.company.address);
      infoLine(doc, 'Kota', data.company.city ?? '-');
      infoLine(
        doc,
        'Periode PKL',
        data.period.from && data.period.to ? `${data.period.from} - ${data.period.to}` : '-'
      );
      infoLine(doc, 'Guru Pembimbing', data.supervisors.length > 0 ? data.supervisors.join(', ') : '-');
      doc.moveDown(0.5);

      // --- B. Anggota ---
      sectionTitle(doc, 'B. ANGGOTA KELOMPOK');
      drawTable(
        doc,
        [
          { header: 'No', width: 34, align: 'center' },
          { header: 'NISN', width: 110 },
          { header: 'Nama Lengkap', width: doc.page.width - MARGIN * 2 - 144 },
        ],
        data.members.map((m, i) => [String(i + 1), m.nisn, m.fullName])
      );

      // --- C. Absensi ---
      sectionTitle(doc, 'C. DAFTAR ABSENSI');
      doc.font(FONT_BOLD).fontSize(9).text('Rekapitulasi Kehadiran', { underline: true });
      doc.moveDown(0.3);
      const w = doc.page.width - MARGIN * 2;
      drawTable(
        doc,
        [
          { header: 'Nama', width: w - 240 },
          { header: 'Hadir', width: 60, align: 'center' },
          { header: 'Izin', width: 60, align: 'center' },
          { header: 'Sakit', width: 60, align: 'center' },
          { header: 'Alpha', width: 60, align: 'center' },
        ],
        data.attendanceSummary.map((s) => [
          s.fullName,
          String(s.hadir),
          String(s.izin),
          String(s.sakit),
          String(s.alpha),
        ])
      );
      doc.font(FONT_BOLD).fontSize(9).text('Rincian Absensi', { underline: true });
      doc.moveDown(0.3);
      drawTable(
        doc,
        [
          { header: 'Tanggal', width: 90 },
          { header: 'Nama', width: 150 },
          { header: 'Status', width: 65, align: 'center' },
          { header: 'Kegiatan', width: w - 305 },
        ],
        data.attendanceRows.map((r) => [r.date, r.fullName, r.status, r.activity])
      );

      // --- D. Monitoring guru pembimbing ---
      sectionTitle(doc, 'D. MONITORING GURU PEMBIMBING');
      drawTable(
        doc,
        [
          { header: 'Jadwal', width: 115 },
          { header: 'Dilaksanakan', width: 115 },
          { header: 'Status', width: 70, align: 'center' },
          { header: 'Guru Pembimbing', width: 105 },
          { header: 'Catatan', width: w - 405 },
        ],
        data.visits.map((v) => [v.scheduledAt, v.visitedAt ?? '-', v.status, v.supervisor, v.note ?? '-'])
      );

      // --- E. Jurnal kegiatan ---
      sectionTitle(doc, 'E. JURNAL KEGIATAN');
      drawTable(
        doc,
        [
          { header: 'Tanggal', width: 90 },
          { header: 'Nama', width: 150 },
          { header: 'Kegiatan', width: w * 0.45 },
          { header: 'Hasil', width: w - 240 - w * 0.45 },
        ],
        data.journals.map((j) => [j.date, j.fullName, j.activity, j.result ?? '-'])
      );

      // --- F. Nilai akhir DUDI (sel kosong bila belum diinput) ---
      sectionTitle(doc, 'F. NILAI AKHIR (DARI DUDI)');
      drawTable(
        doc,
        [
          { header: 'No', width: 34, align: 'center' },
          { header: 'NISN', width: 110 },
          { header: 'Nama', width: w - 34 - 110 - 70 - 80 - 130 },
          { header: 'Nilai', width: 70, align: 'center' },
          { header: 'Predikat', width: 80, align: 'center' },
          { header: 'Catatan', width: 130 },
        ],
        data.grades.map((g, i) => [
          String(i + 1),
          g.nisn,
          g.fullName,
          g.scoreDudi ?? '',
          g.predicate ?? '',
          g.note ?? '',
        ])
      );

      // --- Tanda tangan / penerbitan ---
      if (doc.y > doc.page.height - MARGIN - 90) doc.addPage();
      doc.moveDown(1.5);
      const y = doc.y;
      doc.font(FONT).fontSize(9.5).text('Diterbitkan pada:', MARGIN, y);
      doc.text(
        new Date(data.issuedAt).toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
        MARGIN,
        y + 14
      );
      doc.text('(Dokumen ini diterbitkan otomatis oleh sistem Manajemen PKL)', MARGIN, y + 28);

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
};

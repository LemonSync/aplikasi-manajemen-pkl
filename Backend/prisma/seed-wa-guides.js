"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedWaGuides = void 0;
/**
 * Pohon panduan bawaan bot WhatsApp.
 *
 * Level 0 = peran (menu pertama yang dilihat user), level 1 = topik,
 * level 2 = langkah dengan teks panduan (dan gambar bila admin menambahnya).
 * Node tanpa anak = daun → bot mengirim teks + gambar.
 */
const GUIDE_TREE = [
    {
        rowId: 'peran-siswa',
        role: 'SISWA',
        label: 'Saya Siswa',
        body: 'Panduan untuk siswa PKL.',
        children: [
            {
                rowId: 'siswa-pendaftaran',
                label: 'Pendaftaran & Usulan Tempat',
                body: 'Tahap mengajukan tempat PKL dan melengkapi berkas.',
                children: [
                    {
                        rowId: 'siswa-usulkan-tempat',
                        label: 'Usulkan Tempat PKL',
                        body: '1. Login web PKL lalu buka menu *Pendaftaran*.\n' +
                            '2. Klik *Usulkan Tempat* dan isi nama perusahaan, alamat, bidang, serta kontak pembimbing lapangan.\n' +
                            '3. Kirim. Ajuan diperiksa Admin, lalu keluar Surat Permohonan bila disetujui.\n' +
                            '4. Pantau statusnya di halaman yang sama; status berubah menjadi *Diterima* setelah perusahaan menjawab surat.',
                    },
                    {
                        rowId: 'siswa-berkas',
                        label: 'Berkas & Surat Pernyataan',
                        body: 'Buka menu *Dokumen* untuk mengunggah berkas (rapor, pas foto, tanda tangan orang tua) dan menu *Surat Pernyataan* untuk menandatangani pakta integritas secara digital.\n' +
                            'Berkas yang belum lengkap membuat ajuan ditolak Admin, jadi periksa daftar centang pada halaman Dokumen.',
                    },
                ],
            },
            {
                rowId: 'siswa-presensi',
                label: 'Presensi & Jurnal Harian',
                body: 'Mengisi kehadiran dan catatan kegiatan selama PKL.',
                children: [
                    {
                        rowId: 'siswa-checkin',
                        label: 'Absen Hadir / Pulang',
                        body: 'Buka menu *Absensi* setiap hari kerja.\n' +
                            '• *Check in* pada pagi hari (menyimpan jam & foto).\n' +
                            '• *Check out* saat selesai.\n' +
                            'Presensi yang tidak diisi sampai sore otomatis dicatat Alpha. Sampaikan ke Guru Pembimbing bila ada kesalahan.',
                    },
                    {
                        rowId: 'siswa-jurnal',
                        label: 'Catatan Kegiatan',
                        body: 'Isi kolom kegiatan pada form absensi harian (apa yang dikerjakan hari itu). Jurnal dipakai Guru Pembimbing saat kunjungan dan penilaian akhir, jadi tulis singkat tapi spesifik.',
                    },
                    {
                        rowId: 'siswa-pengaduan',
                        label: 'Lapor Masalah (Pengaduan)',
                        body: 'Ada kendala di tempat PKL? Buka menu *Pengaduan*, pilih kategori, jelaskan kejadiannya. Admin dan Guru Pembimbing menerima notifikasi dan akan menindaklanjuti.',
                    },
                ],
            },
            {
                rowId: 'siswa-akhir',
                label: 'Laporan Akhir & Sertifikat',
                body: 'Tahap setelah PKL selesai.',
                children: [
                    {
                        rowId: 'siswa-laporan',
                        label: 'Unggah Laporan Akhir',
                        body: 'Setelah fase *PKL Selesai*, buka menu *Laporan Akhir* dan unggah PDF laporan. Nilai dari perusahaan (menu *Penilaian*) ikut menjadi dasar penerbitan sertifikat.',
                    },
                    {
                        rowId: 'siswa-sertifikat',
                        label: 'Sertifikat PKL',
                        body: 'Buka menu *Sertifikat*. Bila presensi, dokumen, dan penilaian sudah lengkap, tombol ajukan sertifikat aktif. Unduh PDF sertifikat setelah Admin menerbitkan.',
                    },
                ],
            },
        ],
    },
    {
        rowId: 'peran-guru',
        role: 'GURU',
        label: 'Saya Guru Pembimbing',
        body: 'Panduan untuk guru pembimbing PKL.',
        children: [
            {
                rowId: 'guru-bimbingan',
                label: 'Daftar Siswa Bimbingan',
                body: 'Menu *Bimbingan* menampilkan siswa yang ditugaskan ke Anda beserta fase, presensi, dan dokumen terakhir. Guru dapat meminta penugasan ulang lewat Admin bila ada perubahan.',
            },
            {
                rowId: 'guru-absensi',
                label: 'Verifikasi Presensi Siswa',
                body: 'Buka *Guru → Absensi*. Periksa check in/out dan catatan kegiatan siswa, lalu verifikasi. Presensi yang belum diverifikasi belum dihitung sebagai kehadiran sah.',
            },
            {
                rowId: 'guru-kunjungan',
                label: 'Catat Kunjungan',
                body: 'Menu *Guru → Kunjungan* dipakai untuk mencatat kunjungan ke tempat PKL: tanggal, hasil pengamatan, dan foto dokumentasi. Catatan ini menjadi bukti pembimbingan.',
            },
            {
                rowId: 'guru-surat',
                label: 'Surat Seputar Pembimbingan',
                body: 'Menu *Guru → Surat* berisi surat pengantar, surat penugasan, dan dokumen yang perlu Anda periksa atau tanda tangani.',
            },
        ],
    },
    {
        rowId: 'peran-admin',
        role: 'ADMIN',
        label: 'Saya Admin',
        body: 'Panduan untuk admin PKL.',
        children: [
            {
                rowId: 'admin-inbox',
                label: 'Inbox Verifikasi Ajuan',
                body: 'Menu *Admin → Inbox* mengumpulkan semua ajuan yang menunggu: pendaftaran siswa, usulan tempat, penerimaan perusahaan, dan daftar ulang. Buka satu per satu, setujui atau tolak dengan alasan. Setiap ajuan hanya tampil untuk admin yang memegang jurusan terkait.',
            },
            {
                rowId: 'admin-surat',
                label: 'Terbitkan Surat Permohonan',
                body: 'Di *Admin → Surat Baru* pilih ajuan yang sudah disetujui, masukkan *Nomor Surat* dari buku agenda (kolom ini opsional tetapi wajib diisi bila sekolah memakai penomoran manual), lalu unduh PDF-nya. Surat lama dapat dilihat pada *Admin → Surat*.',
            },
            {
                rowId: 'admin-gelombang',
                label: 'Kelola Gelombang & Jadwal Fase',
                body: '*Admin → Gelombang* untuk menambah/menutup gelombang; *Admin → Jadwal Fase* untuk menetapkan tanggal tiap fase. Bot WhatsApp mengirim pengingat ke grup gelombang tepat pada tanggal tersebut.',
            },
            {
                rowId: 'admin-akun',
                label: 'Tambah Akun & Pembimbing',
                body: '*Admin → Users* membuat akun siswa, guru, dan perusahaan (password dibuat otomatis dan sekali tampil). *Admin → Pembimbingan* menugaskan guru ke siswa.',
            },
        ],
    },
];
/**
 * Tambah pohon panduan default. Idempoten: tidak menyentuh data bila
 * admin sudah mengisi pohonnya lewat menu Config.
 */
const seedWaGuides = async (prisma) => {
    const existing = await prisma.waGuide.count();
    if (existing > 0)
        return { created: 0, skipped: true };
    let created = 0;
    const walk = async (nodes, parentId, role, depth) => {
        let order = 10;
        for (const node of nodes) {
            const row = await prisma.waGuide.create({
                data: {
                    parentId,
                    role,
                    depth,
                    order,
                    rowId: node.rowId,
                    label: node.label,
                    body: node.body ?? null,
                    isActive: true,
                },
            });
            created += 1;
            if (node.children)
                await walk(node.children, row.id, role, depth + 1);
            order += 10;
        }
    };
    for (const root of GUIDE_TREE) {
        await walk([root], null, root.role, 0);
    }
    return { created, skipped: false };
};
exports.seedWaGuides = seedWaGuides;
//# sourceMappingURL=seed-wa-guides.js.map
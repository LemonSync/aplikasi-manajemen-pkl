import { ref, type Ref } from 'vue';
import {
  documentService,
  registrationService,
  downloadFile,
  type StudentWorkflowStatus,
} from '@/services/api.service';
import { notify } from './useNotify';
import { confirmDialog } from './useDialog';
import { extractErrorMessage } from '@/services/http';

/**
 * Aksi-aksi alur PKL (unduh surat, unggah Surat Penerimaan, ganti perusahaan).
 *
 * Dulu hidup di dalam `StudentWorkflowView`; sekarang dipakai Mode Daftar dan
 * panggung kuis bersamaan, supaya kedua tampilan benar-benar memanggil fungsi
 * yang sama — tidak ada jalan pintas di salah satunya. Gerbang sebenarnya tetap
 * di backend: ini hanya pemanggil endpoint yang sudah ada.
 */
export const useWorkflowActions = (
  status: Readonly<Ref<StudentWorkflowStatus | null>>,
  refresh: () => Promise<void>
) => {
  // --- Surat Penerimaan ---
  const penerimaanFile = ref<File | null>(null);
  const uploadingPenerimaan = ref(false);

  const onPenerimaanFileChange = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    penerimaanFile.value = input.files?.[0] ?? null;
  };

  const uploadSuratPenerimaan = async (): Promise<void> => {
    if (!penerimaanFile.value) return;
    if (status.value?.hasSuratPenerimaanPending) {
      notify.error('Surat Penerimaan sedang menunggu verifikasi admin dan tidak dapat diganti.');
      return;
    }
    uploadingPenerimaan.value = true;
    notify.clear();
    try {
      await documentService.upload('SURAT_PENERIMAAN', penerimaanFile.value, 'Surat Penerimaan PKL dari Perusahaan');
      notify.success('Surat Penerimaan berhasil diunggah. Menunggu verifikasi admin.');
      penerimaanFile.value = null;
      await refresh();
    } catch (e) {
      notify.error(extractErrorMessage(e));
    } finally {
      uploadingPenerimaan.value = false;
    }
  };

  // --- Download Surat Permohonan (gerbang Fase 1 → 2) ---
  const downloadingSurat = ref(false);

  const downloadSurat = async (): Promise<void> => {
    const documentId = status.value?.registrationDocumentId;
    if (!documentId || downloadingSurat.value) return;
    downloadingSurat.value = true;
    try {
      await downloadFile(`/documents/${documentId}/download`, 'surat-permohonan-pkl.pdf');
      // Unduhan menandai permohonanDownloaded di backend → status di-refresh
      await refresh();
    } catch (e) {
      notify.error(extractErrorMessage(e));
    } finally {
      downloadingSurat.value = false;
    }
  };

  // --- Berubah pikiran: ganti perusahaan (kembali Fase 1) ---
  const cancellingCompany = ref(false);

  const changeCompany = async (): Promise<void> => {
    const ok = await confirmDialog({
      title: 'Ganti Perusahaan',
      message:
        'Yakin berubah pikiran dan ganti perusahaan?\n\n' +
        '• Pendaftaran saat ini akan dibatalkan.\n' +
        '• Kuota perusahaan lama otomatis dilepas (+1).\n' +
        '• Anda kembali ke Fase 1 untuk memilih perusahaan baru dan mendapat Surat Permohonan baru.',
      confirmLabel: 'Ya, ganti',
      danger: true,
    });
    if (!ok) return;
    cancellingCompany.value = true;
    notify.clear();
    try {
      await registrationService.changeCompany();
      notify.success(
        'Pendaftaran dibatalkan. Kuota perusahaan lama dilepas — silakan pilih perusahaan baru di Fase 1.'
      );
      await refresh();
    } catch (e) {
      notify.error(extractErrorMessage(e));
    } finally {
      cancellingCompany.value = false;
    }
  };

  return {
    penerimaanFile,
    uploadingPenerimaan,
    onPenerimaanFileChange,
    uploadSuratPenerimaan,
    downloadingSurat,
    downloadSurat,
    cancellingCompany,
    changeCompany,
  };
};

import { computed, ref, type ComputedRef, type Ref } from 'vue';
import {
  companyService,
  registrationService,
  type CompanyOption,
  type Registration,
} from '@/services/api.service';
import { notify } from './useNotify';
import { extractErrorMessage } from '@/services/http';

/** Label sisa kuota; kuota null = tanpa batas. */
export const quotaLabel = (c: CompanyOption): string =>
  c.sisa === null ? 'Tanpa batas' : `Sisa kuota: ${c.sisa}`;

/**
 * Pemilihan perusahaan tujuan (Tahap 1 Fase 1): daftar opsi, draft, dan pengajuan.
 *
 * Dipakai `RegistrationView` (Mode Daftar & `/pendaftaran`) sekaligus kartu kuis
 * Tahap 1, agar kedua jalur mengirim payload yang sama persis ke backend.
 * Daftar diminta dengan `includeFull`: siswa melihat seluruh perusahaan aktif
 * beserta kuotanya — yang penuh tampil nonaktif, bukan disembunyikan. Memilih
 * yang penuh tetap ditolak `assertSisaAvailable` saat diajukan.
 */
export const useRegistrationPick = (
  onChanged: () => Promise<void> = async () => {}
): {
  existing: Ref<Registration | null>;
  companies: Ref<CompanyOption[]>;
  companyId: Ref<string>;
  loading: Ref<boolean>;
  saving: Ref<boolean>;
  selectedCompany: ComputedRef<CompanyOption | null>;
  load: () => Promise<void>;
  save: () => Promise<void>;
  submit: () => Promise<void>;
} => {
  const existing = ref<Registration | null>(null);
  const companies = ref<CompanyOption[]>([]);
  const companyId = ref('');
  const loading = ref(true);
  const saving = ref(false);

  const selectedCompany = computed(() => companies.value.find((c) => c.id === companyId.value) ?? null);

  const load = async (): Promise<void> => {
    loading.value = true;
    notify.clear();
    try {
      const [opts, reg] = await Promise.all([companyService.options(true), registrationService.getMy()]);
      companies.value = opts;
      existing.value = reg;
      if (reg?.company?.id) companyId.value = reg.company.id;
    } catch (e) {
      notify.error(extractErrorMessage(e));
    } finally {
      loading.value = false;
    }
  };

  /** Simpan draft pendaftaran per-orang (hanya companyId). Return null bila gagal. */
  const saveDraftNow = async (): Promise<Registration | null> => {
    const target = companies.value.find((c) => c.id === companyId.value);
    if (!target) {
      notify.error('Pilih perusahaan tujuan terlebih dahulu.');
      return null;
    }
    if (target.sisa === 0) {
      notify.error(`Kuota ${target.name} sudah penuh — pilih perusahaan lain.`);
      return null;
    }
    return registrationService.saveDraft({ companyId: target.id });
  };

  const save = async (): Promise<void> => {
    saving.value = true;
    notify.clear();
    try {
      const saved = await saveDraftNow();
      if (!saved) return;
      existing.value = saved;
      notify.success('Draft pendaftaran berhasil disimpan.');
      await onChanged();
    } catch (e) {
      notify.error(extractErrorMessage(e));
    } finally {
      saving.value = false;
    }
  };

  const submit = async (): Promise<void> => {
    saving.value = true;
    notify.clear();
    try {
      // Selalu simpan dulu agar perusahaan terbaru yang diajukan
      const saved = await saveDraftNow();
      if (!saved) return;
      existing.value = saved;
      const result = await registrationService.submit(saved.id);
      existing.value = result.registration ?? saved;
      notify.success('Pendaftaran diajukan. Surat Permohonan akan dibuat setelah disetujui Admin.');
      await onChanged();
    } catch (e) {
      notify.error(extractErrorMessage(e));
    } finally {
      saving.value = false;
    }
  };

  // Pemanggil yang memutuskan kapan daftar dimuat (`load()`): Tahap 1 saja,
  // dan ulang setelah kuota berubah (mis. ganti perusahaan).
  return { existing, companies, companyId, loading, saving, selectedCompany, load, save, submit };
};

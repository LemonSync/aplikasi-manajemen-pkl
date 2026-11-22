<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { certificateService, type SertifikatStatus } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import AppIcon from '@/components/AppIcon.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import { notify } from '@/composables/useNotify';

/**
 * Sertifikat PKL (fase 4). Tiga syarat berurutan: nilai terkunci, logo
 * perusahaan terunggah, baru sertifikat dapat diterbitkan. PDF-nya 2 halaman
 * (sertifikat + LEMBARAN PENILAIAN) dan disnapshot di server setelah terbit.
 */
const status = ref<SertifikatStatus | null>(null);
const loading = ref(true);
const uploading = ref(false);
const generating = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const preview = ref<string | null>(null);
/** Nama penandatangan kanan halaman 1 — siswa yang mengetik, sekolah yang menentukan. */
const kabag = ref('');
const savingKabag = ref(false);

const load = async (): Promise<void> => {
  loading.value = true;
  notify.clear();
  try {
    status.value = await certificateService.status();
    kabag.value = status.value.kepalaBagianName ?? '';
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    loading.value = false;
  }
};

const nilaiSiap = computed(() => Boolean(status.value?.gradeSubmitted));
const logoSiap = computed(() => Boolean(status.value?.hasLogo));
const siapTerbit = computed(() => nilaiSiap.value && logoSiap.value);
const kabagBerubah = computed(
  () => kabag.value.trim() !== (status.value?.kepalaBagianName ?? '').trim()
);

const simpanPenandatangan = async (): Promise<void> => {
  savingKabag.value = true;
  notify.clear();
  try {
    status.value = await certificateService.setPenandatangan(kabag.value);
    kabag.value = status.value.kepalaBagianName ?? '';
    notify.success(
      status.value.kepalaBagianName
      ? 'Nama penandatangan disimpan.'
      : 'Nama penandatangan dikosongkan — kolom itu diisi manual saat penandatanganan.'
    );
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    savingKabag.value = false;
  }
};

const onPick = (ev: Event): void => {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (preview.value) URL.revokeObjectURL(preview.value);
  preview.value = URL.createObjectURL(file);
  void upload(file);
};

const upload = async (file: File): Promise<void> => {
  uploading.value = true;
  notify.clear();
  try {
    status.value = await certificateService.uploadLogo(file);
    notify.success('Logo perusahaan tersimpan. Sertifikat siap dibuat.');
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    uploading.value = false;
    if (fileInput.value) fileInput.value.value = '';
  }
};

const gantiLogo = (): void => {
  if (preview.value) {
    URL.revokeObjectURL(preview.value);
    preview.value = null;
  }
  fileInput.value?.click();
};

const unduh = async (): Promise<void> => {
  generating.value = true;
  notify.clear();
  try {
    await certificateService.downloadMine();
    if (status.value) status.value = await certificateService.status();
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    generating.value = false;
  }
};

const tanggal = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div v-if="loading" class="loading" />

    <template v-else-if="status">

      <div class="card">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold text-ink-900">Sertifikat PKL</h2>
            <p class="mt-1 text-sm text-ink-500">
              {{ status.studentName }}
              <span v-if="status.nisn" class="text-ink-400">· NISN {{ status.nisn }}</span>
              <span v-if="status.companyName" class="text-ink-400">· {{ status.companyName }}</span>
            </p>
          </div>
          <p v-if="status.number" class="rounded-lg bg-raise px-3 py-2 text-sm">
            <span class="text-ink-500">Nomor:</span>
            <span class="font-mono font-semibold text-ink-900">{{ status.number }}</span>
            <span class="ml-2 text-xs text-ink-400">
              {{ status.numberSource === 'MANUAL' ? 'input admin' : 'dibangkitkan sistem' }}
            </span>
          </p>
        </div>

        <!-- Checklist 3 langkah -->
        <ol class="mt-5 space-y-3">
          <li class="flex items-start gap-3">
            <span
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-xs font-semibold"
              :class="nilaiSiap ? 'bg-ok-soft text-ok' : 'bg-raise text-ink-400'"
            >
              <AppIcon v-if="nilaiSiap" name="check" :size="14" />
              <template v-else>1</template>
            </span>
            <div class="min-w-0">
              <p class="text-sm font-medium text-ink-800">Nilai PKL terkunci</p>
              <p v-if="nilaiSiap" class="text-xs text-ink-500">
                Dikirim {{ tanggal(status.gradeSubmittedAt) }} · Nilai akhir
                {{ status.finalScore ?? '—' }}
                <span v-if="status.predicate" class="font-semibold">(predikat {{ status.predicate }})</span>
              </p>
              <RouterLink v-else :to="{ name: 'grade-input' }" class="text-xs text-primary-600 hover:underline">
                Isi dan kirim penilaian terlebih dahulu
              </RouterLink>
            </div>
          </li>

          <li class="flex items-start gap-3">
            <span
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-xs font-semibold"
              :class="logoSiap ? 'bg-ok-soft text-ok' : 'bg-raise text-ink-400'"
            >
              <AppIcon v-if="logoSiap" name="check" :size="14" />
              <template v-else>2</template>
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-ink-800">Logo perusahaan tempat PKL</p>
              <p v-if="logoSiap" class="text-xs text-ink-500">
                {{ status.logoName ?? 'Logo tersimpan' }}
              </p>
              <p v-else class="text-xs text-ink-500">
                Wajib diunggah sebelum sertifikat dibuat (JPG/PNG).
              </p>

              <div class="mt-2 flex flex-wrap items-center gap-3">
                <img
                  v-if="preview"
                  :src="preview"
                  alt="Pratinjau logo"
                  class="h-14 w-14 rounded-lg border border-line bg-white object-contain p-1"
                />
                <input
                  ref="fileInput"
                  class="sr-only"
                  type="file"
                  accept="image/jpeg,image/png"
                  @change="onPick"
                />
                <button
                  type="button"
                  class="btn-secondary"
                  :disabled="uploading"
                  @click="gantiLogo"
                >
                  <LoadingSpinner v-if="uploading" inline />
                  {{ uploading ? 'Mengunggah…' : logoSiap ? 'Ganti Logo' : 'Unggah Logo' }}
                </button>
              </div>
              <p v-if="logoSiap && status.ready" class="mt-1 text-xs text-amber-700">
                Mengganti logo membatalkan sertifikat yang sudah terbit; unduh ulang setelahnya.
              </p>
            </div>
          </li>

          <li class="flex items-start gap-3">
            <span
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-xs font-semibold"
              :class="status.ready ? 'bg-ok-soft text-ok' : 'bg-raise text-ink-400'"
            >
              <AppIcon v-if="status.ready" name="check" :size="14" />
              <template v-else>3</template>
            </span>
            <div class="min-w-0">
              <p class="text-sm font-medium text-ink-800">Sertifikat 2 halaman</p>
              <p class="text-xs text-ink-500">
                <template v-if="status.ready">
                  Terbit {{ tanggal(status.issuedAt) }} — halaman 1 sertifikat, halaman 2 lembar penilaian.
                </template>
                <template v-else>
                  Sertifikat dibuat setelah nilai terkunci dan logo terunggah.
                </template>
              </p>
            </div>
          </li>
        </ol>

        <div class="mt-5 rounded-lg bg-raise px-4 py-3">
          <label class="label" for="kepala-bagian">Nama Kepala Bagian Teknik dan Pengelolaan</label>
          <p class="mb-2 text-xs text-ink-500">
            Penandatangan kanan pada halaman 1 sertifikat. Boleh dikosongkan bila nama
            akan ditulis manual di atas kertas.
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <input
              id="kepala-bagian"
              v-model="kabag"
              class="input max-w-md"
              maxlength="120"
              placeholder="mis. H. Yudi Dharma Putra Hasibuan, S.T., M.M."
            />
            <button
              class="btn-secondary"
              :disabled="!kabagBerubah || savingKabag"
              @click="simpanPenandatangan"
            >
              <LoadingSpinner v-if="savingKabag" inline />
              Simpan
            </button>
          </div>
          <p v-if="status.ready && kabagBerubah" class="mt-2 text-xs text-amber-700">
            Mengubah nama membatalkan sertifikat yang sudah terbit; unduh ulang setelahnya.
          </p>
        </div>

        <div class="mt-5 flex flex-wrap items-center gap-3">
          <button class="btn-primary" :disabled="!siapTerbit || generating" @click="unduh">
            <LoadingSpinner v-if="generating" inline />
            {{ generating ? 'Membuat…' : status.ready ? 'Unduh Ulang Sertifikat' : 'Buat & Unduh Sertifikat' }}
          </button>
          <span v-if="!siapTerbit" class="text-xs text-ink-400">
            Lengkapi langkah 1 dan 2 dulu.
          </span>
        </div>

        <div v-if="status.approvalStatus" class="mt-4 flex flex-wrap items-center gap-2 text-sm text-ink-600">
          Status persetujuan nilai (admin):
          <StatusBadge :status="status.approvalStatus" />
          <span v-if="status.approvalNote" class="text-ink-400">{{ status.approvalNote }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

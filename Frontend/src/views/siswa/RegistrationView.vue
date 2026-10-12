<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  companyService,
  registrationService,
  downloadFile,
  type CompanyOption,
  type Registration,
} from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import StatusBadge from '@/components/StatusBadge.vue';
import { useAuthStore } from '@/stores/auth.store';

const auth = useAuthStore();

// Beri tahu parent (StudentWorkflowView) bahwa Surat Permohonan sudah diunduh
// agar status workflow di-refetch — unduhan membuka gerbang Fase 1 → Fase 2.
const emit = defineEmits<{ downloaded: [] }>();

const existing = ref<Registration | null>(null);
const companies = ref<CompanyOption[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');

const companyId = ref('');

const selectedCompany = computed(
  () => companies.value.find((c) => c.id === companyId.value) ?? null
);

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

/** Label sisa kuota; kuota null = tanpa batas. */
const quotaLabel = (c: CompanyOption): string =>
  c.sisa === null ? 'Tanpa batas' : `Sisa kuota: ${c.sisa}`;

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    const [opts, reg] = await Promise.all([companyService.options(), registrationService.getMy()]);
    companies.value = opts;
    existing.value = reg;
    if (reg?.company?.id) companyId.value = reg.company.id;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

/** Simpan draft pendaftaran per-orang (hanya companyId). Return null bila gagal. */
const saveDraftNow = async (): Promise<Registration | null> => {
  if (!companyId.value) {
    error.value = 'Pilih perusahaan tujuan terlebih dahulu.';
    return null;
  }
  return registrationService.saveDraft({ companyId: companyId.value });
};

const save = async (): Promise<void> => {
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    const saved = await saveDraftNow();
    if (!saved) return;
    existing.value = saved;
    success.value = 'Draft pendaftaran berhasil disimpan.';
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

const submit = async (): Promise<void> => {
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    // Selalu simpan dulu agar perusahaan terbaru yang diajukan
    const saved = await saveDraftNow();
    if (!saved) return;
    existing.value = saved;
    const result = await registrationService.submit(saved.id);
    existing.value = result.registration ?? saved;
    success.value = 'Pendaftaran diajukan. Surat Permohonan akan dibuat setelah disetujui Admin.';
    await auth.fetchMe();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

const downloadSurat = async (): Promise<void> => {
  const docId = existing.value?.document?.id;
  if (!docId) return;
  try {
    await downloadFile(`/documents/${docId}/download`, `surat-permohonan-${existing.value?.code}.pdf`);
    emit('downloaded');
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div v-if="loading" class="loading" />

    <template v-else>
      <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
      <div v-if="success" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

      <!-- Ringkasan pendaftaran (per-orang) -->
      <div v-if="existing" class="card">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold text-gray-800">Pendaftaran: {{ existing.code }}</h2>
            <p class="text-sm text-gray-500">Ringkasan pendaftaran PKL Anda.</p>
          </div>
          <StatusBadge :status="existing.status" />
        </div>
        <dl class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div class="rounded-lg bg-gray-50 p-3">
            <dt class="text-xs text-gray-500">Perusahaan</dt>
            <dd class="mt-0.5 text-sm font-medium text-gray-800">{{ existing.company.name }}</dd>
            <dd class="text-xs text-gray-500">
              {{ existing.company.address }}{{ existing.company.city ? ` — ${existing.company.city}` : '' }}
            </dd>
          </div>
          <div class="rounded-lg bg-gray-50 p-3">
            <dt class="text-xs text-gray-500">Tanggal Diajukan</dt>
            <dd class="mt-0.5 text-sm font-medium text-gray-800">{{ formatDate(existing.submittedAt) }}</dd>
          </div>
          <div class="rounded-lg bg-gray-50 p-3">
            <dt class="text-xs text-gray-500">Tanggal Dibuat</dt>
            <dd class="mt-0.5 text-sm font-medium text-gray-800">{{ formatDate(existing.createdAt) }}</dd>
          </div>
        </dl>

        <div
          v-if="existing.status === 'DISETUJUI' && existing.document"
          class="mt-4 rounded-lg bg-emerald-50 p-4"
        >
          <p class="text-sm font-medium text-emerald-800">Pendaftaran disetujui! Surat Permohonan sudah dibuat.</p>
          <p class="mt-1 text-sm text-emerald-700">Download, cetak, dan serahkan ke perusahaan.</p>
          <p class="mt-1 text-xs text-emerald-600">
            Surat ini wajib diunduh terlebih dahulu sebelum Anda dialihkan ke Fase 2 (Daftar Ulang).
          </p>
          <button class="btn-primary mt-3" @click="downloadSurat">Download Surat Permohonan (PDF)</button>
        </div>
        <div v-else-if="existing.status === 'DIAJUKAN'" class="mt-4 rounded-lg bg-amber-50 p-4">
          <p class="text-sm text-amber-700">Menunggu persetujuan admin...</p>
        </div>
      </div>

      <!-- Form pra-pendaftaran (hanya saat DRAFT) -->
      <form v-if="!existing || existing.status === 'DRAFT'" class="card space-y-4" @submit.prevent="save">
        <div>
          <h2 class="text-lg font-semibold text-gray-800">Data Perusahaan Tujuan</h2>
          <p class="text-sm text-gray-500">
            Pilih perusahaan dari daftar berikut. Hanya perusahaan dengan sisa kuota yang ditampilkan.
          </p>
        </div>

        <div>
          <label class="label">Perusahaan</label>
          <select v-model="companyId" class="input" required>
            <option value="" disabled>Pilih perusahaan…</option>
            <option v-for="c in companies" :key="c.id" :value="c.id">
              {{ c.name }} — {{ c.address }}{{ c.city ? `, ${c.city}` : '' }} ({{ quotaLabel(c) }})
            </option>
          </select>
        </div>

        <div v-if="selectedCompany" class="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
          <p class="font-medium text-gray-800">{{ selectedCompany.name }}</p>
          <p class="mt-0.5">
            {{ selectedCompany.address }}<span v-if="selectedCompany.city">, {{ selectedCompany.city }}</span>
          </p>
          <p class="mt-0.5 text-xs text-gray-500">
            <span v-if="selectedCompany.industryName">Bidang: {{ selectedCompany.industryName }} · </span>
            {{ quotaLabel(selectedCompany) }}
          </p>
        </div>

        <p v-if="companies.length === 0" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Belum ada perusahaan dengan sisa kuota. Hubungi admin sekolah.
        </p>

        <div class="flex items-center gap-3">
          <button type="submit" class="btn-secondary" :disabled="saving || companies.length === 0">
            Simpan Draft
          </button>
          <button
            type="button"
            class="btn-primary"
            :disabled="saving || companies.length === 0"
            @click="submit"
          >
            Ajukan Pendaftaran
          </button>
        </div>
      </form>
    </template>
  </div>
</template>

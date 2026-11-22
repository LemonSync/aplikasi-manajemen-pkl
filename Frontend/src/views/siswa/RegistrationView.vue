<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth.store';
import { downloadFile } from '@/services/api.service';
import { notify } from '@/composables/useNotify';
import { extractErrorMessage } from '@/services/http';
import { useRegistrationPick, quotaLabel } from '@/composables/useRegistrationPick';
import StatusBadge from '@/components/StatusBadge.vue';
import CompanyCardList from '@/components/host/CompanyCardList.vue';

/**
 * Form pendaftaran tempat PKL (Tahap 1 Fase 1).
 *
 * Ditampilkan di dua tempat: rute `/pendaftaran` dan Mode Daftar di `/alur-pkl`.
 * Pilihan perusahaan sudah bukan `<select>` lagi melainkan kartu — seluruh
 * perusahaan aktif beserta kuotanya, yang penuh tampil nonaktif.
 */
const auth = useAuthStore();

// Beri tahu parent (StudentWorkflowView) bahwa Surat Permohonan sudah diunduh
// agar status workflow di-refetch — unduhan membuka gerbang Fase 1 → Fase 2.
const emit = defineEmits<{ downloaded: [] }>();

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

const { existing, companies, companyId, loading, saving, selectedCompany, load, save, submit } =
  useRegistrationPick(async () => {
    await auth.fetchMe();
  });

onMounted(load);

const downloadSurat = async (): Promise<void> => {
  const docId = existing.value?.document?.id;
  if (!docId) return;
  try {
    await downloadFile(`/documents/${docId}/download`, `surat-permohonan-${existing.value?.code}.pdf`);
    emit('downloaded');
  } catch (e) {
    notify.error(extractErrorMessage(e));
  }
};
</script>

<template>
  <div class="space-y-6">
    <div v-if="loading" class="loading" />

    <template v-else>

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
            <dd class="mt-0.5 text-sm font-medium text-gray-800">{{ existing.company?.name ?? '—' }}</dd>
            <dd v-if="existing.company" class="text-xs text-gray-500">
              {{ existing.company.address }}{{ existing.company.city ? ` — ${existing.company.city}` : '' }}
            </dd>
            <dd v-else class="text-xs text-amber-600">Perusahaan sudah dihapus admin — hubungi Admin.</dd>
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
        <!-- Ditolak: alasan admin harus terbaca di sini, bukan hilang tanpa jejak -->
        <div v-else-if="existing.status === 'DITOLAK'" class="mt-4 border-l-[3px] border-l-no bg-no-soft p-4">
          <p class="text-sm font-medium text-no">Pendaftaran Anda ditolak admin.</p>
          <p v-if="existing.note" class="mt-1 text-sm text-red-700">Alasan: {{ existing.note }}</p>
          <p v-else class="mt-1 text-sm text-red-700">
            Admin tidak menuliskan alasan — tanyakan kepada guru pembimbing atau admin.
          </p>
          <p class="mt-1 text-xs text-red-600">Ditolak pada {{ formatDate(existing.reviewedAt) }}.</p>
        </div>
      </div>

      <!-- Form pra-pendaftaran (DRAFT, atau ajukan ulang setelah ditolak) -->
      <form
        v-if="!existing || existing.status === 'DRAFT' || existing.status === 'DITOLAK'"
        class="card space-y-4"
        @submit.prevent="save"
      >
        <div>
          <h2 class="text-lg font-semibold text-gray-800">
            {{ existing?.status === 'DITOLAK' ? 'Ajukan Ulang: Data Perusahaan Tujuan' : 'Data Perusahaan Tujuan' }}
          </h2>
          <p class="text-sm text-gray-500">
            Klik kartu perusahaan yang kamu tuju. Seluruh perusahaan aktif ditampilkan berikut kuotanya — yang
            sudah penuh ditandai dan tidak bisa dipilih.
          </p>
        </div>

        <CompanyCardList v-model="companyId" :companies="companies" :loading="loading" />

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

        <div class="flex flex-wrap items-center gap-3">
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
          <RouterLink
            :to="{ name: 'company-request' }"
            class="btn-secondary border-dashed border-primary-300 text-primary-700 hover:border-primary-500 hover:bg-primary-50"
          >
            + Usulkan Tempat PKL
          </RouterLink>
        </div>
        <p class="text-xs text-gray-400">
          Tidak menemukan perusahaan yang diinginkan? Usulkan sendiri — admin akan menghubungi perusahaan tersebut
          untuk memastikan menerima siswa PKL.
        </p>
      </form>
    </template>
  </div>
</template>

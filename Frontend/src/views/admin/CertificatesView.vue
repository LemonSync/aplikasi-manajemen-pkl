<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { certificateService, type CertificateRow } from '@/services/api.service';
import { useCohortStore } from '@/stores/cohort.store';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { notify } from '@/composables/useNotify';

/**
 * Daftar sertifikat PKL (fase 4) untuk admin.
 * Nomor dibangkitkan sistem sesuai format contoh sekolah; admin dapat
 * menimpanya dengan nomor surat resmi — nomor manual ditandai MANUAL dan
 * tidak dihitung ulang oleh sistem.
 */
const rows = ref<CertificateRow[]>([]);
const loading = ref(true);
const saving = ref(false);
const search = ref('');
const page = ref(1);
const perPage = 25;
const total = ref(0);

const cohortStore = useCohortStore();

const target = ref<CertificateRow | null>(null);
const nomorBaru = ref('');

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / perPage)));

const load = async (): Promise<void> => {
  loading.value = true;
  notify.clear();
  try {
    const res = await certificateService.list({
      page: page.value,
      perPage,
      cohortId: cohortStore.activeCohortId ?? undefined,
    });
    rows.value = res.items;
    total.value = res.meta?.total ?? res.items.length;
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    loading.value = false;
  }
};

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return rows.value;
  return rows.value.filter((r) =>
    [r.fullName, r.username, r.nisn ?? '', r.className ?? '', r.number].join(' ').toLowerCase().includes(q)
  );
});

const openNomor = (row: CertificateRow): void => {
  target.value = row;
  nomorBaru.value = row.number;
  notify.clear();
};

const simpanNomor = async (): Promise<void> => {
  const row = target.value;
  if (!row) return;
  const nilai = nomorBaru.value.trim();
  if (nilai.length < 3) {
    notify.error('Nomor terlalu pendek. Contoh: 400.10.5.4/0108.151/SMKN9/XI/2025');
    return;
  }
  saving.value = true;
  notify.clear();
  try {
    await certificateService.setNumber(row.id, nilai);
    notify.success(`Nomor ${row.fullName} diganti menjadi ${nilai}. Sertifikat akan terbit ulang dengan nomor ini.`);
    target.value = null;
    await load();
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    saving.value = false;
  }
};

const unduh = async (row: CertificateRow): Promise<void> => {
  notify.clear();
  try {
    await certificateService.downloadForStudent(row.studentId);
  } catch (e) {
    notify.error(extractErrorMessage(e));
  }
};

const pindah = async (delta: number): Promise<void> => {
  const next = page.value + delta;
  if (next < 1 || next > totalPages.value) return;
  page.value = next;
  await load();
};

const tanggal = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

onMounted(async () => {
  await cohortStore.ensureLoaded();
  await load();
});

watch(() => cohortStore.activeCohortId, async () => {
  page.value = 1;
  await load();
});
</script>

<template>
  <div class="space-y-6">

    <div class="card">
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-ink-900">Sertifikat PKL</h2>
          <p class="text-sm text-ink-500">{{ total }} sertifikat terdaftar</p>
        </div>
        <input
          v-model="search"
          class="input w-72"
          type="search"
          placeholder="Cari nama, username, NISN, kelas, nomor…"
        />
      </div>

      <SkeletonTable v-if="loading" :rows="8" :cols="6" />
      <div v-else-if="filtered.length === 0" class="py-6 text-center text-sm text-ink-400">
        Belum ada sertifikat. Sertifikat muncul setelah siswa fase Pasca-PKL mengunggah logo perusahaan.
      </div>

      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Siswa</th>
              <th>Kelas</th>
              <th>Nomor Sertifikat</th>
              <th class="text-center">Sumber</th>
              <th class="text-center">Logo</th>
              <th>Terbit</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in filtered" :key="r.id">
              <td>
                <div class="font-medium text-ink-900">{{ r.fullName }}</div>
                <div class="font-mono text-xs text-ink-400">{{ r.username }}{{ r.nisn ? ` · ${r.nisn}` : '' }}</div>
              </td>
              <td class="text-ink-700">{{ r.className ?? '—' }}</td>
              <td class="font-mono text-sm text-ink-800">{{ r.number }}</td>
              <td class="text-center">
                <span
                  class="rounded px-2 py-0.5 text-xs font-medium"
                  :class="r.numberSource === 'MANUAL' ? 'bg-info-soft text-info' : 'bg-raise text-ink-600'"
                >
                  {{ r.numberSource === 'MANUAL' ? 'Manual admin' : 'Sistem' }}
                </span>
              </td>
              <td class="text-center">
                <StatusBadge v-if="r.hasLogo" status="ADA" />
                <span v-else class="text-xs text-ink-400">Belum</span>
              </td>
              <td class="text-sm text-ink-600">
                <StatusBadge v-if="r.ready" status="TERBIT" />
                <span v-else class="text-xs text-ink-400">{{ tanggal(r.issuedAt) }}</span>
              </td>
              <td class="whitespace-nowrap text-right text-sm">
                <button class="text-primary-600 hover:underline" @click="openNomor(r)">Ganti Nomor</button>
                <span class="mx-2 text-ink-200">|</span>
                <button
                  class="text-primary-600 hover:underline disabled:text-ink-300 disabled:no-underline"
                  :disabled="!r.hasLogo"
                  @click="unduh(r)"
                >
                  Unduh
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="!loading && totalPages > 1" class="mt-4 flex items-center justify-between text-sm">
        <button class="btn-secondary" :disabled="page <= 1" @click="pindah(-1)">Sebelumnya</button>
        <span class="text-ink-500">Halaman {{ page }} / {{ totalPages }}</span>
        <button class="btn-secondary" :disabled="page >= totalPages" @click="pindah(1)">Berikutnya</button>
      </div>
    </div>

    <Modal :open="!!target" title="Nomor sertifikat manual" size="sm" :busy="saving" @close="target = null">
      <template v-if="target">
        <p class="text-sm text-ink-800">{{ target.fullName }}</p>
        <p class="mt-1 text-xs text-ink-500">
          {{ target.username }}{{ target.nisn ? ` · NISN ${target.nisn}` : '' }}
          {{ target.className ? ` · ${target.className}` : '' }}
        </p>
        <p class="mt-3 text-sm text-ink-600">
          Nomor saat ini: <span class="font-mono">{{ target.number }}</span>
        </p>
        <label class="label mt-4" for="nomor-baru">Nomor surat</label>
        <input
          id="nomor-baru"
          v-model="nomorBaru"
          class="input font-mono"
          placeholder="400.10.5.4/0108.151/SMKN9/XI/2025"
        />
        <p class="mt-2 text-xs text-ink-400">
          Menyimpan nomor manual membuang snapshot PDF lama — sertifikat terbit ulang dengan nomor ini.
          Nomor tidak boleh sama dengan milik siswa lain.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <button class="btn-secondary" :disabled="saving" @click="target = null">Batal</button>
          <button class="btn-primary" :disabled="saving" @click="simpanNomor">
            {{ saving ? 'Menyimpan…' : 'Simpan Nomor' }}
          </button>
        </div>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { supervisionService, type SupervisionRow } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import type { PaginationMeta } from '@/types';
import SkeletonTable from '@/components/SkeletonTable.vue';

/**
 * Siswa Bimbingan (per-orang: 1 siswa = 1 guru).
 * Backend otomatis membatasi supervisor = diri sendiri untuk guru pembimbing.
 */
const rows = ref<SupervisionRow[]>([]);
const meta = ref<PaginationMeta | undefined>(undefined);
const loading = ref(true);
const error = ref('');

const searchInput = ref('');
const search = ref('');
const page = ref(1);
const perPage = 10;

/** Nama guru (diri sendiri) — diambil dari baris mana pun (field supervisorName). */
const teacherName = ref('');

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    const res = await supervisionService.list({
      page: page.value,
      perPage,
      search: search.value || undefined,
    });
    rows.value = res.items;
    meta.value = res.meta;
    const name = res.items.find((r) => r.supervisorName)?.supervisorName;
    if (name) teacherName.value = name;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const applySearch = (): void => {
  search.value = searchInput.value.trim();
  page.value = 1;
  void load();
};

const clearSearch = (): void => {
  searchInput.value = '';
  applySearch();
};

const goPage = (p: number): void => {
  if (p < 1) return;
  if (meta.value && p > meta.value.totalPages) return;
  page.value = p;
  void load();
};

const fmtDate = (v?: string | null): string => (v ? new Date(v).toLocaleDateString('id-ID') : '-');

const totalPages = (): number => meta.value?.totalPages ?? 1;

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>

    <div class="card">
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-gray-800">Siswa Bimbingan</h2>
          <p class="text-sm text-gray-500">
            Daftar siswa yang berada dalam bimbingan Anda
            <span v-if="teacherName"> · Pembimbing: {{ teacherName }}</span>
          </p>
        </div>
        <div class="flex items-end gap-2">
          <div>
            <label class="label">Cari</label>
            <input
              v-model="searchInput"
              type="search"
              class="input w-64"
              placeholder="Nama, NISN, atau username…"
              @keyup.enter="applySearch"
            />
          </div>
          <button class="btn-secondary" @click="applySearch">Cari</button>
          <button v-if="search" class="btn-secondary" @click="clearSearch">Reset</button>
        </div>
      </div>

      <SkeletonTable v-if="loading" :rows="6" :cols="7" />
      <table v-else class="table">
        <thead>
          <tr>
            <th>Nama</th>
            <th>NISN</th>
            <th>Kelas</th>
            <th>Jurusan</th>
            <th>Fase</th>
            <th>Dibimbing Sejak</th>
            <th>Akun</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.studentId">
            <td class="font-medium text-gray-800">{{ r.fullName ?? '-' }}</td>
            <td class="font-mono">{{ r.nisn ?? '-' }}</td>
            <td>{{ r.className ?? '-' }}</td>
            <td>{{ r.majorName ?? '-' }}</td>
            <td><span class="badge bg-primary-100 text-primary-700">{{ r.phase ?? '-' }}</span></td>
            <td>{{ fmtDate(r.assignedAt) }}</td>
            <td class="font-mono text-gray-500">{{ r.username }}</td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="7" class="py-4 text-center text-gray-400">
              {{ search ? 'Tidak ada siswa yang cocok dengan pencarian.' : 'Belum ada siswa bimbingan.' }}
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="!loading" class="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
        <span>
          Total {{ meta?.total ?? rows.length }} siswa · Halaman {{ page }} dari {{ totalPages() }}
        </span>
        <div class="flex items-center gap-2">
          <button class="btn-secondary" :disabled="page <= 1" @click="goPage(page - 1)">Sebelumnya</button>
          <button class="btn-secondary" :disabled="page >= totalPages()" @click="goPage(page + 1)">
            Berikutnya
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

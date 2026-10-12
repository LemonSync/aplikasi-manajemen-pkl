<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { phase4Service, type LetterRecord } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import SkeletonTable from '@/components/SkeletonTable.vue';
import StatusBadge from '@/components/StatusBadge.vue';

/**
 * Daftar surat terbit (admin hanya membaca & mengunduh).
 * Generate surat bulk (Pengantar/Monitoring/Penjemputan) dilakukan pada halaman
 * guru pembimbing — lihat views/guru.
 */
const letters = ref<LetterRecord[]>([]);
const lettersLoading = ref(true);
const error = ref('');
const letterFilter = ref('');
const letterSearch = ref('');

/** Cari nomor/perihal/penanda tangan surat terbit (FE-side, daftar tidak dipaginasi). */
const filteredLetters = computed(() => {
  const q = letterSearch.value.trim().toLowerCase();
  if (!q) return letters.value;
  return letters.value.filter((l) =>
    [l.number ?? '', l.subject ?? '', l.signerName, l.type].join(' ').toLowerCase().includes(q)
  );
});

const loadLetters = async (): Promise<void> => {
  lettersLoading.value = true;
  error.value = '';
  try {
    letters.value = await phase4Service.listLetters(letterFilter.value ? { type: letterFilter.value } : undefined);
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    lettersLoading.value = false;
  }
};

const downloadLetter = async (letter: LetterRecord): Promise<void> => {
  try {
    await phase4Service.downloadLetter(letter);
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

onMounted(() => {
  void loadLetters();
});

watch(letterFilter, () => void loadLetters());
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>

    <!-- Daftar Surat Terbit -->
    <div class="card">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-gray-800">Surat Terbit</h2>
          <p class="text-sm text-gray-500">Semua surat yang sudah digenerate sistem oleh guru pembimbing.</p>
        </div>
        <div class="flex items-center gap-2">
          <input
            v-model="letterSearch"
            class="input w-56"
            type="search"
            placeholder="Cari nomor, perihal, penanda tangan…"
          />
          <select v-model="letterFilter" class="input w-auto">
            <option value="">Semua Jenis</option>
            <option value="SURAT_PENGANTAR">Surat Pengantar</option>
            <option value="SURAT_MONITORING">Surat Monitoring</option>
            <option value="SURAT_PENJEMPUTAN">Surat Penjemputan</option>
          </select>
          <RouterLink class="btn-primary" :to="{ name: 'admin-letter-generator' }">Buat Surat Baru</RouterLink>
          <button class="btn-secondary" :disabled="lettersLoading" @click="loadLetters">Muat Ulang</button>
        </div>
      </div>

      <SkeletonTable v-if="lettersLoading" :rows="5" :cols="7" />
      <table v-else class="table">
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Jenis</th>
            <th>Nomor</th>
            <th>Perihal</th>
            <th>Penanda Tangan</th>
            <th>Guru Pembimbing</th>
            <th class="text-center">Siswa</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in filteredLetters" :key="l.id">
            <td>{{ new Date(l.createdAt).toLocaleDateString('id-ID') }}</td>
            <td><StatusBadge :status="l.type" /></td>
            <td class="font-mono">{{ l.number ?? '-' }}</td>
            <td>{{ l.subject ?? '-' }}</td>
            <td>{{ l.signerName }}</td>
            <td>{{ l.supervisorName ?? '-' }}</td>
            <td class="text-center">{{ l.studentCount }}</td>
            <td class="text-right">
              <button class="text-sm text-primary-600 hover:underline" @click="downloadLetter(l)">Unduh</button>
            </td>
          </tr>
          <tr v-if="filteredLetters.length === 0">
            <td colspan="8" class="py-4 text-center text-gray-400">
              {{ letterSearch.trim() ? 'Tidak ada surat yang cocok dengan pencarian.' : 'Belum ada surat terbit.' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

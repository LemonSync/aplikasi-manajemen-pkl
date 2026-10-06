<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { journalService, type JournalRecord } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';

const journals = ref<JournalRecord[]>([]);
const loading = ref(true);
const submitting = ref<string | null>(null);
const error = ref('');

const load = async () => {
  loading.value = true;
  error.value = '';
  try { journals.value = await journalService.listForDudi(); }
  catch (e) { error.value = extractErrorMessage(e); }
  finally { loading.value = false; }
};

const verify = async (journal: JournalRecord) => {
  submitting.value = journal.id;
  try { await journalService.verifyByDudi(journal.id); await load(); }
  catch (e) { error.value = extractErrorMessage(e); }
  finally { submitting.value = null; }
};

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <section class="card">
      <h2 class="mb-1 text-lg font-semibold text-gray-800">Konfirmasi Jurnal Siswa</h2>
      <p class="mb-4 text-sm text-gray-500">Hanya jurnal dari kelompok di perusahaan Anda yang ditampilkan.</p>
      <div v-if="loading" class="loading" />
      <table v-else class="table">
        <thead><tr><th>Tanggal</th><th>Siswa</th><th>Kelompok</th><th>Kegiatan</th><th>Status</th><th></th></tr></thead>
        <tbody>
          <tr v-for="journal in journals" :key="journal.id">
            <td>{{ new Date(journal.date).toLocaleDateString('id-ID') }}</td>
            <td>
              <div>{{ journal.user?.studentProfile?.fullName ?? journal.user?.username ?? '-' }}</div>
              <div v-if="journal.user?.studentProfile?.fullName" class="font-mono text-xs text-gray-400">{{ journal.user?.username }}</div>
            </td><td>{{ journal.group?.name ?? '-' }}</td>
            <td class="max-w-xs truncate" :title="journal.activity">{{ journal.activity }}</td>
            <td>{{ journal.dudiVerifiedAt ? 'Terkonfirmasi' : 'Menunggu' }}</td>
            <td><button v-if="!journal.dudiVerifiedAt" class="btn-primary" :disabled="submitting === journal.id" @click="verify(journal)">Konfirmasi</button></td>
          </tr>
          <tr v-if="journals.length === 0"><td colspan="6" class="py-4 text-center text-gray-400">Belum ada jurnal.</td></tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { journalService, type JournalRecord } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';

const journals = ref<JournalRecord[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');

const form = ref({ activity: '', result: '', obstacles: '' });

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    journals.value = await journalService.listMine();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const save = async (): Promise<void> => {
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    await journalService.create({
      activity: form.value.activity,
      result: form.value.result || null,
      obstacles: form.value.obstacles || null,
    });
    success.value = 'Jurnal hari ini tersimpan.';
    form.value = { activity: '', result: '', obstacles: '' };
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

const isToday = (dateStr: string): boolean =>
  new Date(dateStr).toDateString() === new Date().toDateString();

const hasTodayJournal = computed(() => journals.value.some((j) => isToday(j.date)));

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Jurnal Hari Ini</h2>
      <p v-if="hasTodayJournal" class="text-sm text-gray-500">Jurnal hari ini sudah diisi.</p>
      <div v-else class="space-y-3">
        <div>
          <label class="label">Kegiatan</label>
          <textarea v-model="form.activity" class="input" rows="3" placeholder="Apa yang Anda kerjakan hari ini?" />
        </div>
        <div>
          <label class="label">Hasil</label>
          <textarea v-model="form.result" class="input" rows="2" placeholder="Hasil yang dicapai (opsional)" />
        </div>
        <div>
          <label class="label">Kendala</label>
          <textarea v-model="form.obstacles" class="input" rows="2" placeholder="Kendala yang dihadapi (opsional)" />
        </div>
        <button class="btn-primary" :disabled="saving || form.activity.length < 3" @click="save">
          {{ saving ? 'Menyimpan…' : 'Simpan Jurnal' }}
        </button>
      </div>
    </div>

    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Riwayat Jurnal</h2>
      <div v-if="loading" class="loading" />
      <div v-else class="space-y-3">
        <div v-for="j in journals" :key="j.id" class="rounded-lg border border-gray-200 p-4">
          <div class="mb-1 flex items-center justify-between">
            <span class="text-sm font-semibold text-gray-800">{{ new Date(j.date).toLocaleDateString('id-ID', { dateStyle: 'long' }) }}</span>
          </div>
          <p class="text-sm text-gray-700">{{ j.activity }}</p>
          <p v-if="j.result" class="mt-1 text-xs text-gray-500">Hasil: {{ j.result }}</p>
          <p v-if="j.obstacles" class="mt-1 text-xs text-gray-500">Kendala: {{ j.obstacles }}</p>
          <p v-if="j.supervisorNote" class="mt-2 rounded bg-primary-50 px-2 py-1 text-xs text-primary-700">
            Catatan pembimbing: {{ j.supervisorNote }}
          </p>
        </div>
        <p v-if="journals.length === 0" class="py-4 text-center text-gray-400">Belum ada jurnal.</p>
      </div>
    </div>
  </div>
</template>
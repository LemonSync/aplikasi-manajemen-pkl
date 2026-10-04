<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { jobVacancyService, type JobVacancyRecord } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import StatusBadge from '@/components/StatusBadge.vue';

const vacancies = ref<JobVacancyRecord[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');
const showForm = ref(false);
const form = ref({ title: '', description: '', requirements: '', location: '' });

const load = async (): Promise<void> => {
  loading.value = true;
  try {
    const { items } = await jobVacancyService.list();
    vacancies.value = items;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const submit = async (): Promise<void> => {
  if (!form.value.title || !form.value.description) return;
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    await jobVacancyService.create(form.value);
    success.value = 'Loker berhasil dibuat.';
    showForm.value = false;
    form.value = { title: '', description: '', requirements: '', location: '' };
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div class="card">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-800">Lowongan Kerja</h2>
        <button class="btn-primary" @click="showForm = !showForm">{{ showForm ? 'Batal' : 'Tambah Loker' }}</button>
      </div>
      <div v-if="error" class="mb-3 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
      <div v-if="success" class="mb-3 mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

      <div v-if="showForm" class="mt-4 space-y-4">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><label class="label">Judul</label><input v-model="form.title" class="input" placeholder="e.g. Frontend Developer" /></div>
          <div><label class="label">Lokasi</label><input v-model="form.location" class="input" placeholder="e.g. Jakarta" /></div>
        </div>
        <div><label class="label">Deskripsi</label><textarea v-model="form.description" class="input" rows="3"></textarea></div>
        <div><label class="label">Persyaratan</label><textarea v-model="form.requirements" class="input" rows="2"></textarea></div>
      </div>
      <button v-if="showForm" class="btn-primary mt-4" :disabled="saving || !form.title || !form.description" @click="submit">
        {{ saving ? 'Menyimpan…' : 'Simpan' }}
      </button>
    </div>

    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Daftar Loker</h2>
      <div v-if="loading" class="text-sm text-gray-500">Memuat…</div>
      <table v-else class="table">
        <thead><tr><th>Judul</th><th>Lokasi</th><th>Status</th><th>Tanggal</th></tr></thead>
        <tbody>
          <tr v-for="v in vacancies" :key="v.id">
            <td>{{ v.title }}</td>
            <td>{{ v.location ?? '-' }}</td>
            <td><StatusBadge :status="v.status" /></td>
            <td>{{ new Date(v.createdAt).toLocaleDateString('id-ID') }}</td>
          </tr>
          <tr v-if="vacancies.length === 0"><td colspan="4" class="py-4 text-center text-gray-400">Belum ada loker.</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { announcementService, type AnnouncementRecord } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';

const announcements = ref<AnnouncementRecord[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');
const showForm = ref(false);
const form = ref({ title: '', body: '' });

const load = async (): Promise<void> => {
  loading.value = true;
  try {
    const { items } = await announcementService.list();
    announcements.value = items;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const submit = async (): Promise<void> => {
  if (!form.value.title || !form.value.body) return;
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    await announcementService.create(form.value);
    success.value = 'Pengumuman berhasil dibuat.';
    showForm.value = false;
    form.value = { title: '', body: '' };
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
        <h2 class="text-lg font-semibold text-gray-800">Pengumuman</h2>
        <button class="btn-primary" @click="showForm = !showForm">{{ showForm ? 'Batal' : 'Buat Pengumuman' }}</button>
      </div>
      <div v-if="error" class="mb-3 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
      <div v-if="success" class="mb-3 mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

      <div v-if="showForm" class="mt-4 space-y-4">
        <div><label class="label">Judul</label><input v-model="form.title" class="input" /></div>
        <div><label class="label">Isi</label><textarea v-model="form.body" class="input" rows="4"></textarea></div>
      </div>
      <button v-if="showForm" class="btn-primary mt-4" :disabled="saving || !form.title || !form.body" @click="submit">
        {{ saving ? 'Mengirim…' : 'Kirim' }}
      </button>
    </div>

    <div class="space-y-4">
      <div v-for="a in announcements" :key="a.id" class="card">
        <div class="flex items-start justify-between">
          <div>
            <h3 class="font-semibold text-gray-800">{{ a.title }}</h3>
            <p class="mt-1 text-sm text-gray-600">{{ a.body }}</p>
          </div>
          <span v-if="a.isPinned" class="badge bg-amber-100 text-amber-800">Dipinned</span>
        </div>
        <p class="mt-2 text-xs text-gray-400">{{ new Date(a.createdAt).toLocaleString('id-ID') }}</p>
      </div>
      <div v-if="announcements.length === 0 && !loading" class="card text-center text-gray-400">Belum ada pengumuman.</div>
    </div>
  </div>
</template>

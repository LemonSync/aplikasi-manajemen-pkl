<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { announcementService, type AnnouncementRecord } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';

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
    success.value = 'Pengumuman dibuat.';
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
    <div v-if="error" class="bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <div class="card">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-800">Pengumuman</h2>
        <button class="btn-primary" @click="showForm = true">Buat</button>
      </div>

      <div v-if="loading" class="mt-4 space-y-3">
        <div v-for="i in 4" :key="i" class="skeleton h-16 w-full" />
      </div>
      <div v-else class="mt-4 space-y-3">
        <div v-for="a in announcements" :key="a.id" class="border border-gray-200 p-4">
          <div class="flex items-start justify-between">
            <h3 class="font-semibold text-gray-800">{{ a.title }}</h3>
            <span v-if="a.isPinned" class="badge bg-amber-100 text-amber-800">Dipinned</span>
          </div>
          <p class="mt-1 text-sm text-gray-600">{{ a.body }}</p>
          <p class="mt-2 text-xs text-gray-400">{{ new Date(a.createdAt).toLocaleString('id-ID') }}</p>
        </div>
        <div v-if="announcements.length === 0" class="py-4 text-center text-gray-400">Belum ada pengumuman.</div>
      </div>
    </div>

    <Modal :open="showForm" title="Buat Pengumuman" size="md" :busy="saving" @close="showForm = false">
      <div class="space-y-4">
        <div><label class="label">Judul</label><input v-model="form.title" class="input" /></div>
        <div><label class="label">Isi</label><textarea v-model="form.body" class="input" rows="4"></textarea></div>
      </div>
      <template #footer>
        <button class="btn-secondary" :disabled="saving" @click="showForm = false">Batal</button>
        <button class="btn-primary" :disabled="saving || !form.title || !form.body" @click="submit">
          <LoadingSpinner v-if="saving" inline />
          {{ saving ? 'Mengirim…' : 'Simpan' }}
        </button>
      </template>
    </Modal>
  </div>
</template>

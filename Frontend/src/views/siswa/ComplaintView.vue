<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { complaintService, type ComplaintRecord } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import StatusBadge from '@/components/StatusBadge.vue';

const complaints = ref<ComplaintRecord[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');
const form = ref({ subject: '', body: '' });

const expandId = ref<string | null>(null);
const replyBody = ref('');

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    complaints.value = await complaintService.listMine();
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
    await complaintService.create({ subject: form.value.subject, body: form.value.body });
    success.value = 'Pengaduan terkirim.';
    form.value = { subject: '', body: '' };
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

const toggle = async (id: string): Promise<void> => {
  if (expandId.value === id) {
    expandId.value = null;
    return;
  }
  expandId.value = id;
  replyBody.value = '';
  try {
    const detail = await complaintService.detail(id);
    const idx = complaints.value.findIndex((c) => c.id === id);
    if (idx >= 0) complaints.value[idx] = detail;
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

const sendReply = async (id: string): Promise<void> => {
  if (!replyBody.value.trim()) return;
  try {
    const detail = await complaintService.reply(id, replyBody.value);
    const idx = complaints.value.findIndex((c) => c.id === id);
    if (idx >= 0) complaints.value[idx] = detail;
    replyBody.value = '';
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

const close = async (id: string): Promise<void> => {
  try {
    const detail = await complaintService.close(id);
    const idx = complaints.value.findIndex((c) => c.id === id);
    if (idx >= 0) complaints.value[idx] = detail;
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Buat Pengaduan</h2>
      <div class="space-y-3">
        <div>
          <label class="label">Subjek</label>
          <input v-model="form.subject" class="input" placeholder="Ringkasan masalah" />
        </div>
        <div>
          <label class="label">Isi Pengaduan</label>
          <textarea v-model="form.body" class="input" rows="3" placeholder="Jelaskan kendala Anda…" />
        </div>
        <button class="btn-primary" :disabled="saving || form.subject.length < 3 || form.body.length < 5" @click="save">
          {{ saving ? 'Mengirim…' : 'Kirim Pengaduan' }}
        </button>
      </div>
    </div>

    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Pengaduan Saya</h2>
      <div v-if="loading" class="text-sm text-gray-500">Memuat…</div>
      <div v-else class="space-y-3">
        <div v-for="c in complaints" :key="c.id" class="rounded-lg border border-gray-200 p-4">
          <div class="flex items-center justify-between">
            <button class="text-left" @click="toggle(c.id)">
              <span class="font-medium text-gray-800">{{ c.subject }}</span>
            </button>
            <StatusBadge :status="c.status" />
          </div>
          <p class="mt-1 text-sm text-gray-600">{{ c.body }}</p>

          <div v-if="expandId === c.id" class="mt-3 border-t border-gray-100 pt-3">
            <div v-for="r in c.replies ?? []" :key="r.id" class="mb-2 rounded bg-gray-50 px-3 py-2">
              <p class="text-xs font-medium text-gray-500">{{ r.author?.username ?? 'Petugas' }}</p>
              <p class="text-sm text-gray-700">{{ r.body }}</p>
            </div>
            <p v-if="(c.replies ?? []).length === 0" class="text-xs text-gray-400">Belum ada balasan.</p>

            <div v-if="c.status !== 'SELESAI'" class="mt-3 flex gap-2">
              <input v-model="replyBody" class="input" placeholder="Tulis balasan…" />
              <button class="btn-secondary" @click="sendReply(c.id)">Kirim</button>
            </div>
            <button v-if="c.status !== 'SELESAI'" class="mt-2 text-xs text-red-600 hover:underline" @click="close(c.id)">
              Tutup pengaduan
            </button>
          </div>
        </div>
        <p v-if="complaints.length === 0" class="py-4 text-center text-gray-400">Belum ada pengaduan.</p>
      </div>
    </div>
  </div>
</template>
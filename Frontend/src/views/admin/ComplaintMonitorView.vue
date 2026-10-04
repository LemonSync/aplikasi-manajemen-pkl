<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { complaintService, type ComplaintRecord } from '@/services/api.service';
import { useCohortStore } from '@/stores/cohort.store';
import { extractErrorMessage } from '@/services/http';
import StatusBadge from '@/components/StatusBadge.vue';

const complaints = ref<ComplaintRecord[]>([]);
const cohortStore = useCohortStore();
const loading = ref(true);
const error = ref('');
const statusFilter = ref('');
const expandId = ref<string | null>(null);
const replyBody = ref('');
const busy = ref(false);

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    const res = await complaintService.list({
      ...(statusFilter.value ? { status: statusFilter.value } : {}),
      ...(cohortStore.activeCohortId ? { cohortId: cohortStore.activeCohortId } : {}),
    });
    complaints.value = res.items;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
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
  busy.value = true;
  error.value = '';
  try {
    const detail = await complaintService.reply(id, replyBody.value);
    const idx = complaints.value.findIndex((c) => c.id === id);
    if (idx >= 0) complaints.value[idx] = detail;
    replyBody.value = '';
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    busy.value = false;
  }
};

const closeComplaint = async (id: string): Promise<void> => {
  busy.value = true;
  error.value = '';
  try {
    const detail = await complaintService.close(id);
    const idx = complaints.value.findIndex((c) => c.id === id);
    if (idx >= 0) complaints.value[idx] = detail;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    busy.value = false;
  }
};

onMounted(async () => {
  await cohortStore.ensureLoaded();
  await load();
});

watch(
  () => cohortStore.activeCohortId,
  () => void load()
);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>

    <div class="card">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-gray-800">Monitor Pengaduan Siswa</h2>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-400">Gelombang aktif di header</span>
          <select v-model="statusFilter" class="input w-auto" @change="load">
            <option value="">Semua Status</option>
            <option value="TERBUKA">Terbuka</option>
            <option value="DIPROSES">Diproses</option>
            <option value="SELESAI">Selesai</option>
          </select>
          <button class="btn-secondary" :disabled="loading" @click="load">Muat Ulang</button>
        </div>
      </div>

      <div v-if="loading" class="text-sm text-gray-500">Memuat…</div>
      <div v-else class="space-y-3">
        <div v-for="c in complaints" :key="c.id" class="rounded-lg border border-gray-200 p-4">
          <div class="flex items-center justify-between gap-3">
            <button class="text-left" @click="toggle(c.id)">
              <span class="font-medium text-gray-800">{{ c.subject }}</span>
              <span class="ml-2 text-xs text-gray-400">
                {{ c.author?.studentProfile?.fullName ?? c.author?.username ?? '-' }} · {{ new Date(c.createdAt).toLocaleDateString('id-ID') }}
                <template v-if="c.group"> · {{ c.group.name }}</template>
              </span>
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
              <input
                v-model="replyBody"
                class="input"
                placeholder="Tulis balasan untuk siswa…"
                @keyup.enter="sendReply(c.id)"
              />
              <button class="btn-primary" :disabled="busy || !replyBody.trim()" @click="sendReply(c.id)">
                Kirim
              </button>
            </div>
            <button
              v-if="c.status !== 'SELESAI'"
              class="mt-2 text-xs text-red-600 hover:underline"
              :disabled="busy"
              @click="closeComplaint(c.id)"
            >
              Tutup pengaduan
            </button>
          </div>
        </div>
        <p v-if="complaints.length === 0" class="py-4 text-center text-gray-400">Belum ada pengaduan.</p>
      </div>
    </div>
  </div>
</template>

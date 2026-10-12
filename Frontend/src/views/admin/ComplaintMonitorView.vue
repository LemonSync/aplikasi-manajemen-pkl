<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { complaintService, type ComplaintRecord } from '@/services/api.service';
import { useCohortStore } from '@/stores/cohort.store';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';
import StatusBadge from '@/components/StatusBadge.vue';

const complaints = ref<ComplaintRecord[]>([]);
const cohortStore = useCohortStore();
const loading = ref(true);
const error = ref('');
const statusFilter = ref('');
const search = ref('');
// Filter opsional per penulis (param authorId) — dipilih dengan mengklik nama penulis.
const authorId = ref('');
const authorName = ref('');
const busy = ref(false);
const replyBody = ref('');
const activeId = ref<string | null>(null);

const active = computed<ComplaintRecord | null>(
  () => complaints.value.find((c) => c.id === activeId.value) ?? null
);

/** Cari subjek atau penulis (FE-side, daftar sudah difilter server per gelombang). */
const filteredComplaints = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return complaints.value;
  return complaints.value.filter((c) =>
    [c.subject, c.author?.studentProfile?.fullName ?? '', c.author?.username ?? '']
      .join(' ')
      .toLowerCase()
      .includes(q)
  );
});

/**
 * Muat daftar pengaduan: filter server memakai status + gelombang (cohortId);
 * penyaring per penulis (authorId) tersedia bila dibutuhkan.
 */
const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    const res = await complaintService.list({
      ...(statusFilter.value ? { status: statusFilter.value } : {}),
      ...(cohortStore.activeCohortId ? { cohortId: cohortStore.activeCohortId } : {}),
      ...(authorId.value ? { authorId: authorId.value } : {}),
    });
    complaints.value = res.items;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

/** Klik nama penulis → saring pengaduan hanya milik penulis tersebut (authorId). */
const filterByAuthor = (c: ComplaintRecord): void => {
  authorId.value = c.authorId;
  authorName.value = c.author?.studentProfile?.fullName ?? c.author?.username ?? c.authorId;
  void load();
};

const clearAuthorFilter = (): void => {
  authorId.value = '';
  authorName.value = '';
  void load();
};

const open = async (id: string): Promise<void> => {
  activeId.value = id;
  replyBody.value = '';
  try {
    const detail = await complaintService.detail(id);
    const idx = complaints.value.findIndex((c) => c.id === id);
    if (idx >= 0) complaints.value[idx] = detail;
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

const sendReply = async (): Promise<void> => {
  if (!activeId.value || !replyBody.value.trim()) return;
  busy.value = true;
  try {
    const detail = await complaintService.reply(activeId.value, replyBody.value);
    const idx = complaints.value.findIndex((c) => c.id === activeId.value);
    if (idx >= 0) complaints.value[idx] = detail;
    replyBody.value = '';
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    busy.value = false;
  }
};

const closeComplaint = async (): Promise<void> => {
  if (!activeId.value) return;
  busy.value = true;
  try {
    const detail = await complaintService.close(activeId.value);
    const idx = complaints.value.findIndex((c) => c.id === activeId.value);
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
    <div v-if="error" class="bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>

    <div class="card">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-gray-800">Pengaduan Siswa</h2>
        <div class="flex items-center gap-2">
          <input
            v-model="search"
            class="input w-56"
            type="search"
            placeholder="Cari subjek atau penulis…"
          />
          <select v-model="statusFilter" class="input w-auto" @change="load">
            <option value="">Semua Status</option>
            <option value="TERBUKA">Terbuka</option>
            <option value="DIPROSES">Diproses</option>
            <option value="SELESAI">Selesai</option>
          </select>
          <button class="btn-secondary" :disabled="loading" @click="load">Muat Ulang</button>
        </div>
      </div>

      <p
        v-if="authorId"
        class="mb-3 flex items-center gap-2 text-xs text-gray-500"
      >
        Filter penulis:
        <span class="badge bg-primary-100 text-primary-700">{{ authorName }}</span>
        <button class="text-primary-600 underline hover:text-primary-800" @click="clearAuthorFilter">
          Hapus
        </button>
      </p>

      <SkeletonTable v-if="loading" :rows="6" :cols="4" />
      <div v-else class="divide-y divide-gray-100">
        <button
          v-for="c in filteredComplaints"
          :key="c.id"
          class="flex w-full items-center justify-between gap-3 px-1 py-3 text-left hover:bg-gray-50"
          @click="open(c.id)"
        >
          <div class="min-w-0">
            <p class="truncate font-medium text-gray-800">{{ c.subject }}</p>
            <p class="truncate text-xs text-gray-400">
              <span
                class="cursor-pointer text-primary-600 underline decoration-dotted hover:text-primary-800"
                title="Saring pengaduan penulis ini"
                @click.stop="filterByAuthor(c)"
              >
                {{ c.author?.studentProfile?.fullName ?? c.author?.username ?? '-' }}
              </span>
              · {{ new Date(c.createdAt).toLocaleDateString('id-ID') }}
            </p>
          </div>
          <StatusBadge :status="c.status" />
        </button>
        <p v-if="filteredComplaints.length === 0" class="py-4 text-center text-gray-400">
          {{ search.trim() || authorId ? 'Tidak ada pengaduan yang cocok dengan filter.' : 'Belum ada pengaduan.' }}
        </p>
      </div>
    </div>

    <Modal :open="!!activeId" :title="active?.subject ?? 'Pengaduan'" size="lg" :busy="busy" @close="activeId = null">
      <template v-if="active">
        <div class="mb-4 flex items-center justify-between text-sm text-gray-500">
          <span>
            {{ active.author?.studentProfile?.fullName ?? active.author?.username ?? '-' }}
            · {{ new Date(active.createdAt).toLocaleDateString('id-ID') }}
          </span>
          <StatusBadge :status="active.status" />
        </div>
        <p class="mb-4 whitespace-pre-wrap text-sm text-gray-700">{{ active.body }}</p>

        <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Balasan</div>
        <div class="mb-4 space-y-2">
          <div v-for="r in active.replies ?? []" :key="r.id" class="border border-gray-200 bg-gray-50 px-3 py-2">
            <p class="text-xs font-medium text-gray-500">{{ r.author?.username ?? 'Petugas' }}</p>
            <p class="text-sm text-gray-700">{{ r.body }}</p>
          </div>
          <p v-if="(active.replies ?? []).length === 0" class="text-xs text-gray-400">Belum ada balasan.</p>
        </div>

        <div v-if="active.status !== 'SELESAI'" class="flex gap-2">
          <input
            v-model="replyBody"
            class="input"
            placeholder="Tulis balasan…"
            @keyup.enter="sendReply"
          />
          <button class="btn-primary shrink-0" :disabled="busy || !replyBody.trim()" @click="sendReply">
            <LoadingSpinner v-if="busy" inline />
            Kirim
          </button>
        </div>
      </template>
      <LoadingSpinner v-else />

      <template #footer>
        <button v-if="active && active.status !== 'SELESAI'" class="btn-danger" :disabled="busy" @click="closeComplaint">
          Tutup
        </button>
        <button class="btn-secondary" :disabled="busy" @click="activeId = null">Tutup</button>
      </template>
    </Modal>
  </div>
</template>

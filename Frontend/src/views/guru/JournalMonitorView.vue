<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  journalService,
  supervisionService,
  type JournalRecord,
  type SupervisionRow,
} from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import type { PaginationMeta } from '@/types';
import Modal from '@/components/Modal.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';

/**
 * Monitoring jurnal siswa bimbingan (per-orang, tanpa kelompok).
 * Backend otomatis membatasi daftar jurnal ke siswa bimbingan guru yang login.
 */
const students = ref<SupervisionRow[]>([]);
const studentFilter = ref('');
const journals = ref<JournalRecord[]>([]);
const meta = ref<PaginationMeta | undefined>(undefined);
const loading = ref(true);
const saving = ref(false);
const error = ref('');

const page = ref(1);
const perPage = 10;

// Catatan pembimbing (inline)
const noteFor = ref<string | null>(null);
const noteText = ref('');

// Modal verifikasi jurnal
const verifyTarget = ref<JournalRecord | null>(null);
const verifyNote = ref('');

const loadStudents = async (): Promise<void> => {
  try {
    const res = await supervisionService.list({ page: 1, perPage: 100 });
    students.value = res.items;
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    const res = await journalService.list({
      userId: studentFilter.value || undefined,
      page: page.value,
      perPage,
    });
    journals.value = res.items;
    meta.value = res.meta;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const applyFilter = (): void => {
  page.value = 1;
  void load();
};

const goPage = (p: number): void => {
  if (p < 1) return;
  if (meta.value && p > meta.value.totalPages) return;
  page.value = p;
  void load();
};

const saveNote = async (id: string): Promise<void> => {
  if (!noteText.value.trim()) return;
  saving.value = true;
  error.value = '';
  try {
    const updated = await journalService.addSupervisorNote(id, noteText.value.trim());
    const idx = journals.value.findIndex((j) => j.id === id);
    if (idx >= 0) journals.value[idx] = updated;
    noteFor.value = null;
    noteText.value = '';
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

const openVerify = (j: JournalRecord): void => {
  verifyTarget.value = j;
  verifyNote.value = '';
  error.value = '';
};

const closeVerify = (): void => {
  if (saving.value) return;
  verifyTarget.value = null;
  verifyNote.value = '';
};

const submitVerify = async (): Promise<void> => {
  const target = verifyTarget.value;
  if (!target) return;
  saving.value = true;
  error.value = '';
  try {
    const updated = await journalService.verify(target.id, verifyNote.value.trim() || undefined);
    const idx = journals.value.findIndex((j) => j.id === target.id);
    if (idx >= 0) journals.value[idx] = updated;
    verifyTarget.value = null;
    verifyNote.value = '';
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

const studentName = (j: JournalRecord): string =>
  j.user?.studentProfile?.fullName ?? j.user?.username ?? '-';

const fmtDate = (v?: string | null): string => (v ? new Date(v).toLocaleDateString('id-ID') : '-');

const totalPages = (): number => meta.value?.totalPages ?? 1;

onMounted(() => {
  void loadStudents();
  void load();
});
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>

    <div class="card">
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-gray-800">Monitoring Jurnal</h2>
          <p class="text-sm text-gray-500">Jurnal kegiatan seluruh siswa yang berada dalam bimbingan Anda.</p>
        </div>
        <div class="flex items-end gap-2">
          <div>
            <label class="label">Siswa</label>
            <select v-model="studentFilter" class="input w-64" @change="applyFilter">
              <option value="">Semua siswa bimbingan</option>
              <option v-for="s in students" :key="s.studentId" :value="s.studentId">
                {{ s.fullName ?? s.username }}
              </option>
            </select>
          </div>
          <button class="btn-secondary" @click="applyFilter">Terapkan</button>
        </div>
      </div>

      <SkeletonTable v-if="loading" :rows="5" :cols="4" />
      <div v-else class="space-y-3">
        <div v-for="j in journals" :key="j.id" class="rounded-lg border border-gray-200 p-4">
          <div class="mb-1 flex items-center justify-between gap-3">
            <span class="text-sm font-semibold text-gray-800">
              {{ studentName(j) }} · {{ fmtDate(j.date) }}
            </span>
            <span
              v-if="j.verifiedAt"
              class="badge bg-emerald-100 text-emerald-700"
              :title="new Date(j.verifiedAt).toLocaleString('id-ID')"
            >
              Terverifikasi
            </span>
            <span v-else class="badge bg-amber-100 text-amber-700">Menunggu</span>
          </div>

          <p class="text-sm text-gray-700">{{ j.activity }}</p>
          <p v-if="j.result" class="mt-1 text-xs text-gray-500">Hasil: {{ j.result }}</p>
          <p v-if="j.obstacles" class="mt-1 text-xs text-gray-500">Kendala: {{ j.obstacles }}</p>
          <p v-if="j.supervisorNote" class="mt-2 rounded bg-primary-50 px-2 py-1 text-xs text-primary-700">
            Catatan Anda: {{ j.supervisorNote }}
          </p>
          <p v-if="j.verificationNote" class="mt-1 text-xs text-emerald-700">
            Catatan verifikasi: {{ j.verificationNote }}
          </p>

          <div class="mt-3 flex flex-wrap items-center gap-3">
            <button
              v-if="!j.verifiedAt"
              class="btn-primary text-xs"
              :disabled="saving"
              @click="openVerify(j)"
            >
              Verifikasi
            </button>

            <div v-if="noteFor === j.id" class="flex flex-1 gap-2">
              <input v-model="noteText" class="input" placeholder="Catatan untuk siswa…" />
              <button class="btn-secondary" :disabled="saving" @click="saveNote(j.id)">Simpan</button>
            </div>
            <button
              v-else
              class="text-xs text-primary-600 hover:underline"
              @click="noteFor = j.id; noteText = j.supervisorNote ?? ''"
            >
              {{ j.supervisorNote ? 'Ubah catatan' : 'Beri catatan' }}
            </button>
          </div>
        </div>

        <p v-if="journals.length === 0" class="py-4 text-center text-gray-400">Belum ada jurnal.</p>

        <div v-if="journals.length > 0" class="flex flex-wrap items-center justify-between gap-3 pt-2 text-sm text-gray-500">
          <span>Total {{ meta?.total ?? journals.length }} jurnal · Halaman {{ page }} dari {{ totalPages() }}</span>
          <div class="flex items-center gap-2">
            <button class="btn-secondary" :disabled="page <= 1" @click="goPage(page - 1)">Sebelumnya</button>
            <button class="btn-secondary" :disabled="page >= totalPages()" @click="goPage(page + 1)">
              Berikutnya
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal verifikasi jurnal -->
    <Modal
      :open="verifyTarget !== null"
      title="Verifikasi Jurnal"
      size="md"
      :busy="saving"
      @close="closeVerify"
    >
      <div class="space-y-4">
        <p class="text-sm text-gray-600">
          {{ verifyTarget ? studentName(verifyTarget) : '' }} ·
          {{ verifyTarget ? fmtDate(verifyTarget.date) : '' }}
        </p>
        <p class="text-sm text-gray-700">{{ verifyTarget?.activity ?? '' }}</p>
        <div>
          <label class="label">Catatan verifikasi (opsional)</label>
          <textarea
            v-model="verifyNote"
            class="input"
            rows="3"
            placeholder="Apakah ada catatan untuk siswa?"
          />
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" :disabled="saving" @click="closeVerify">Batal</button>
        <button class="btn-primary" :disabled="saving" @click="submitVerify">
          {{ saving ? 'Menyimpan…' : 'Verifikasi' }}
        </button>
      </template>
    </Modal>
  </div>
</template>

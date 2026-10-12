<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  supervisionService,
  userManageService,
  type SupervisionRow,
  type UserRecord,
} from '@/services/api.service';
import type { PaginationMeta } from '@/types';
import { useCohortStore } from '@/stores/cohort.store';
import { extractErrorMessage } from '@/services/http';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';

const cohortStore = useCohortStore();
const rows = ref<SupervisionRow[]>([]);
const meta = ref<PaginationMeta | null>(null);
const teachers = ref<UserRecord[]>([]);
const loading = ref(true);
const busy = ref(false);
const error = ref('');
const success = ref('');

// Filter & pagination
const search = ref('');
const page = ref(1);
const PER_PAGE = 10;
const unassignedOnly = ref(false);

// Aksi batch
const selectedIds = ref<string[]>([]);
const supervisorId = ref('');

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    const res = await supervisionService.list({
      page: page.value,
      perPage: PER_PAGE,
      search: search.value.trim() || undefined,
      cohortId: cohortStore.activeCohortId || undefined,
      unassigned: unassignedOnly.value || undefined,
    });
    rows.value = res.items;
    meta.value = res.meta ?? null;
    // Buang seleksi yang tidak ada di halaman ini (reset seleksi lintas halaman).
    const current = new Set(res.items.map((r) => r.studentId));
    selectedIds.value = selectedIds.value.filter((id) => current.has(id));
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const totalPages = computed<number>(() => Math.max(1, meta.value?.totalPages ?? 1));
const totalRows = computed<number>(() => meta.value?.total ?? rows.value.length);
const allSelected = computed<boolean>(
  () => rows.value.length > 0 && selectedIds.value.length === rows.value.length
);

const toggleAll = (checked: boolean): void => {
  selectedIds.value = checked ? rows.value.map((r) => r.studentId) : [];
};

const toggleOne = (studentId: string, checked: boolean): void => {
  selectedIds.value = checked
    ? [...selectedIds.value, studentId]
    : selectedIds.value.filter((id) => id !== studentId);
};

const loadTeachers = async (): Promise<void> => {
  try {
    const res = await userManageService.list({ role: 'GURU_PEMBIMBING', perPage: 100 });
    teachers.value = res.items;
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

const teacherName = (u: UserRecord): string =>
  u.teacherProfile?.fullName ?? u.username;

const doAssign = async (): Promise<void> => {
  if (!supervisorId.value || selectedIds.value.length === 0) return;
  busy.value = true;
  error.value = '';
  success.value = '';
  try {
    await supervisionService.assign({
      studentIds: [...selectedIds.value],
      supervisorId: supervisorId.value,
    });
    const guru = teachers.value.find((t) => t.id === supervisorId.value);
    success.value = `${selectedIds.value.length} siswa ditugaskan ke ${guru ? teacherName(guru) : 'guru pembimbing'}.`;
    selectedIds.value = [];
    supervisorId.value = '';
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    busy.value = false;
  }
};

const doUnassign = async (row: SupervisionRow): Promise<void> => {
  const name = row.fullName ?? row.username;
  if (!window.confirm(`Lepas pembimbingan ${name}? Siswa kembali ke status "Belum ada".`)) return;
  busy.value = true;
  error.value = '';
  success.value = '';
  try {
    await supervisionService.unassign(row.studentId);
    success.value = `Pembimbingan ${name} dilepas.`;
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    busy.value = false;
  }
};

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(search, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    void load();
  }, 400);
});

watch(unassignedOnly, () => {
  page.value = 1;
  selectedIds.value = [];
  void load();
});

watch(
  () => cohortStore.activeCohortId,
  () => {
    page.value = 1;
    selectedIds.value = [];
    void load();
  }
);

const goto = (next: number): void => {
  if (next < 1 || next > totalPages.value || next === page.value) return;
  page.value = next;
  void load();
};

onMounted(async () => {
  await cohortStore.ensureLoaded();
  await Promise.all([loadTeachers(), load()]);
});
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <div class="card">
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-gray-800">Pembimbingan Siswa</h2>
          <p class="text-sm text-gray-500">Satu siswa memperoleh satu guru pembimbing.</p>
        </div>

        <div class="flex flex-wrap items-end gap-3">
          <input
            v-model="search"
            class="input w-64"
            type="search"
            placeholder="Cari nama, NISN, kelas…"
          />
          <label class="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
            <input v-model="unassignedOnly" type="checkbox" class="h-4 w-4" />
            Belum dibimbing
          </label>
          <button class="btn-secondary" :disabled="loading" @click="load">Muat Ulang</button>
        </div>
      </div>

      <!-- Aksi batch: tugaskan guru untuk siswa terpilih -->
      <div class="mb-4 flex flex-wrap items-center gap-3 border border-gray-200 bg-gray-50 p-3">
        <span class="text-sm text-gray-600">
          <strong>{{ selectedIds.length }}</strong> siswa dipilih
        </span>
        <select v-model="supervisorId" class="input w-auto min-w-56">
          <option value="">— Pilih Guru Pembimbing —</option>
          <option v-for="t in teachers" :key="t.id" :value="t.id">{{ teacherName(t) }}</option>
        </select>
        <button
          class="btn-primary"
          :disabled="busy || selectedIds.length === 0 || !supervisorId"
          @click="doAssign"
        >
          <LoadingSpinner v-if="busy" inline />
          Tugaskan ({{ selectedIds.length }})
        </button>
        <span v-if="teachers.length === 0" class="text-xs text-amber-600">
          Belum ada akun Guru Pembimbing.
        </span>
      </div>

      <SkeletonTable v-if="loading" :rows="6" :cols="8" />
      <table v-else class="table">
        <thead>
          <tr>
            <th class="w-8">
              <input
                type="checkbox"
                :checked="allSelected"
                :disabled="rows.length === 0"
                @change="toggleAll(($event.target as HTMLInputElement).checked)"
              />
            </th>
            <th>Nama</th>
            <th>NISN</th>
            <th>Kelas</th>
            <th>Jurusan</th>
            <th>Fase</th>
            <th>Pembimbing</th>
            <th>Ditugaskan</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.studentId">
            <td>
              <input
                type="checkbox"
                :checked="selectedIds.includes(r.studentId)"
                @change="toggleOne(r.studentId, ($event.target as HTMLInputElement).checked)"
              />
            </td>
            <td class="font-medium">
              {{ r.fullName ?? r.username }}
              <p class="font-mono text-xs text-gray-400">{{ r.username }}</p>
            </td>
            <td class="font-mono text-sm">{{ r.nisn ?? '-' }}</td>
            <td>{{ r.className ?? '-' }}</td>
            <td>{{ r.majorName ?? '-' }}</td>
            <td>
              <span v-if="r.phase" class="badge bg-gray-100 text-gray-700">{{ r.phase }}</span>
              <span v-else class="text-gray-400">-</span>
            </td>
            <td>
              <span v-if="r.supervisorName">{{ r.supervisorName }}</span>
              <span v-else class="badge bg-amber-100 text-amber-700">Belum ada</span>
            </td>
            <td class="whitespace-nowrap text-sm text-gray-500">
              {{ r.assignedAt ? new Date(r.assignedAt).toLocaleDateString('id-ID') : '-' }}
            </td>
            <td class="text-right">
              <button
                v-if="r.supervisorId"
                class="text-sm text-red-600 hover:underline"
                :disabled="busy"
                @click="doUnassign(r)"
              >
                Lepas
              </button>
              <span v-else class="text-xs text-gray-400">—</span>
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="9" class="py-4 text-center text-gray-400">
              {{
                search.trim() || unassignedOnly
                  ? 'Tidak ada siswa yang cocok dengan filter.'
                  : 'Belum ada data siswa.'
              }}
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div class="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
        <span>Halaman {{ page }} dari {{ totalPages }} — {{ totalRows }} siswa</span>
        <div class="flex gap-2">
          <button class="btn-secondary" :disabled="loading || page <= 1" @click="goto(page - 1)">
            Sebelumnya
          </button>
          <button class="btn-secondary" :disabled="loading || page >= totalPages" @click="goto(page + 1)">
            Berikutnya
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

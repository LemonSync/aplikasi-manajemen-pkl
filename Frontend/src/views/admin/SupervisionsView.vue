<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  supervisionService,
  userManageService,
  type SupervisionRow,
  type UserRecord,
} from '@/services/api.service';
import { notify } from '@/composables/useNotify';
import type { PaginationMeta } from '@/types';
import { useCohortStore } from '@/stores/cohort.store';
import { extractErrorMessage } from '@/services/http';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';
import { confirmDialog } from '@/composables/useDialog';

const cohortStore = useCohortStore();
const rows = ref<SupervisionRow[]>([]);
const meta = ref<PaginationMeta | null>(null);
const teachers = ref<UserRecord[]>([]);
const loading = ref(true);
const busy = ref(false);

// Filter & pagination
const search = ref('');
const page = ref(1);
const PER_PAGE = 10;
const unassignedOnly = ref(false);

// Aksi batch — seleksi AKUMULATIF lintas pencarian/halaman: cari & select
// satu per satu, baru tugaskan guru sekaligus setelah semua terpilih.
const selectedIds = ref<string[]>([]);
// Label nama per id, disimpan saat dipilih agar siswa yang tidak sedang
// tampil di tabel (karena pencarian berganti) tetap bisa ditampilkan di panel.
const selectedMeta = ref<Record<string, string>>({});
const supervisorId = ref('');

const rowLabel = (r: SupervisionRow): string => r.fullName ?? r.username;

const load = async (): Promise<void> => {
  loading.value = true;
  notify.clear();
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
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    loading.value = false;
  }
};

const totalPages = computed<number>(() => Math.max(1, meta.value?.totalPages ?? 1));
const totalRows = computed<number>(() => meta.value?.total ?? rows.value.length);
const allSelected = computed<boolean>(
  () => rows.value.length > 0 && rows.value.every((r) => selectedIds.value.includes(r.studentId))
);

const toggleAll = (checked: boolean): void => {
  if (checked) {
    const known = new Set(selectedIds.value);
    for (const r of rows.value) {
      if (!known.has(r.studentId)) {
        selectedIds.value.push(r.studentId);
        selectedMeta.value[r.studentId] = rowLabel(r);
      }
    }
  } else {
    const visible = new Set(rows.value.map((r) => r.studentId));
    selectedIds.value = selectedIds.value.filter((id) => !visible.has(id));
    for (const id of visible) delete selectedMeta.value[id];
  }
};

const toggleOne = (r: SupervisionRow, checked: boolean): void => {
  const id = r.studentId;
  if (checked) {
    if (!selectedIds.value.includes(id)) selectedIds.value.push(id);
    selectedMeta.value[id] = rowLabel(r);
  } else {
    selectedIds.value = selectedIds.value.filter((x) => x !== id);
    delete selectedMeta.value[id];
  }
};

const removeSelected = (id: string): void => {
  selectedIds.value = selectedIds.value.filter((x) => x !== id);
  delete selectedMeta.value[id];
};

const clearSelection = (): void => {
  selectedIds.value = [];
  selectedMeta.value = {};
};

const loadTeachers = async (): Promise<void> => {
  try {
    const res = await userManageService.list({ role: 'GURU_PEMBIMBING', perPage: 100 });
    teachers.value = res.items;
  } catch (e) {
    notify.error(extractErrorMessage(e));
  }
};

const teacherName = (u: UserRecord): string =>
  u.teacherProfile?.fullName ?? u.username;

const doAssign = async (): Promise<void> => {
  if (!supervisorId.value || selectedIds.value.length === 0) return;
  busy.value = true;
  notify.clear();
  try {
    await supervisionService.assign({
      studentIds: [...selectedIds.value],
      supervisorId: supervisorId.value,
    });
    const guru = teachers.value.find((t) => t.id === supervisorId.value);
    notify.success(`${selectedIds.value.length} siswa ditugaskan ke ${guru ? teacherName(guru) : 'guru pembimbing'}.`);
    clearSelection();
    supervisorId.value = '';
    await load();
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    busy.value = false;
  }
};

const doUnassign = async (row: SupervisionRow): Promise<void> => {
  const name = row.fullName ?? row.username;
  const ok = await confirmDialog({
    title: 'Lepas Pembimbingan',
    message: `Lepas pembimbingan ${name}? Siswa kembali ke status "Belum ada".`,
    confirmLabel: 'Lepas',
    danger: true,
  });
  if (!ok) return;
  busy.value = true;
  notify.clear();
  try {
    await supervisionService.unassign(row.studentId);
    notify.success(`Pembimbingan ${name} dilepas.`);
    await load();
  } catch (e) {
    notify.error(extractErrorMessage(e));
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
  void load();
});

watch(
  () => cohortStore.activeCohortId,
  () => {
    page.value = 1;
    clearSelection();
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

      <!-- Aksi batch: tugaskan guru untuk siswa terpilih (akumulatif lintas pencarian) -->
      <div class="mb-4 border border-gray-200 bg-gray-50 p-3">
        <div class="flex flex-wrap items-center gap-3">
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
          <button
            v-if="selectedIds.length > 0"
            class="btn-secondary"
            :disabled="busy"
            @click="clearSelection"
          >
            Bersihkan Pilihan
          </button>
          <span v-if="teachers.length === 0" class="text-xs text-amber-600">
            Belum ada akun Guru Pembimbing.
          </span>
        </div>

        <!-- Daftar siswa terpilih — tetap terlihat walau hasil pencarian berganti -->
        <div v-if="selectedIds.length > 0" class="mt-3 border-t border-gray-200 pt-3">
          <p class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            Siswa terpilih ({{ selectedIds.length }}) — pilihannya bertahan saat mencari siswa lain
          </p>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="id in selectedIds"
              :key="id"
              class="inline-flex items-center gap-1.5 rounded-none border border-emerald-300 bg-emerald-50 py-0.5 pl-2.5 pr-1 text-xs text-emerald-800"
            >
              {{ selectedMeta[id] ?? id }}
              <button
                class="rounded-none p-0.5 text-emerald-600 hover:bg-emerald-200 hover:text-emerald-900"
                :disabled="busy"
                :title="`Hapus ${selectedMeta[id] ?? id} dari pilihan`"
                :aria-label="`Hapus ${selectedMeta[id] ?? id} dari pilihan`"
                @click="removeSelected(id)"
              >
                <span aria-hidden="true" class="text-sm leading-none">&times;</span>
              </button>
            </span>
          </div>
        </div>
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
                @change="toggleOne(r, ($event.target as HTMLInputElement).checked)"
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

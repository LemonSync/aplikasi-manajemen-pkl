<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import {
  gradeService,
  phase4Service,
  groupService,
  type GradeRecapByClass,
  type GradeRecapClass,
  type GradeRecapStudent,
  type PhaseTransitionResult,
  type LetterRecord,
} from '@/services/api.service';
import { useCohortStore } from '@/stores/cohort.store';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';
import StatusBadge from '@/components/StatusBadge.vue';

interface GroupOption {
  id: string;
  name: string;
  code?: string;
  members?: Array<{ userId: string; isLeader?: boolean; user?: { username: string; studentProfile?: { fullName: string } | null } }>;
}

const recap = ref<GradeRecapByClass | null>(null);
const groups = ref<GroupOption[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');
const phaseResults = ref<PhaseTransitionResult[]>([]);
const phaseSkipped = ref<Array<{ studentId: string; reason: string }>>([]);

const cohortStore = useCohortStore();
const detailClass = ref<GradeRecapClass | null>(null);

const toNum = (v: number | string | null | undefined): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const avgOf = (students: GradeRecapStudent[]): number | null => {
  const scores = students.map((s) => toNum(s.grade?.finalScore)).filter((n): n is number => n !== null);
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
};

const classAvg = (cls: GradeRecapClass): number | null =>
  avgOf(cls.groups.flatMap((g) => g.students));

const gradedIn = (students: GradeRecapStudent[]): number => students.filter((s) => s.grade !== null).length;

const allGradedStudents = (): GradeRecapStudent[] =>
  (recap.value?.classes ?? []).flatMap((c) => c.groups.flatMap((g) => g.students)).filter((s) => s.grade?.finalScore != null);

// Surat penarikan
const withdrawalGroupId = ref('');
const withdrawalMembers = ref<NonNullable<GroupOption['members']>>([]);
const withdrawalSelectedIds = ref<string[]>([]);
const withdrawalNumber = ref('');
const loadingMembers = ref(false);

// Daftar surat
const letters = ref<LetterRecord[]>([]);
const lettersLoading = ref(false);
const letterFilter = ref('');

const load = async (): Promise<void> => {
  loading.value = true;
  try {
    const [recapData, groupsData] = await Promise.all([
      gradeService.recapByClass(cohortStore.activeCohortId ? { cohortId: cohortStore.activeCohortId } : undefined),
      groupService.list(cohortStore.activeCohortId ? { cohortId: cohortStore.activeCohortId } : {}),
    ]);
    recap.value = recapData;
    groups.value = groupsData.items as unknown as GroupOption[];
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const loadLetters = async (): Promise<void> => {
  lettersLoading.value = true;
  try {
    letters.value = await phase4Service.listLetters(
      letterFilter.value ? { type: letterFilter.value } : undefined
    );
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    lettersLoading.value = false;
  }
};

watch(withdrawalGroupId, async (id) => {
  withdrawalMembers.value = [];
  withdrawalSelectedIds.value = [];
  if (!id) return;
  loadingMembers.value = true;
  try {
    const detail = (await groupService.getById(id)) as GroupOption;
    withdrawalMembers.value = detail.members ?? [];
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loadingMembers.value = false;
  }
});

const toggleMember = (userId: string, checked: boolean): void => {
  withdrawalSelectedIds.value = checked
    ? [...withdrawalSelectedIds.value, userId]
    : withdrawalSelectedIds.value.filter((id) => id !== userId);
};

const generateWithdrawal = async (): Promise<void> => {
  if (!withdrawalGroupId.value || withdrawalSelectedIds.value.length === 0) return;

  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    await phase4Service.generateWithdrawalLetter({
      groupId: withdrawalGroupId.value,
      studentIds: withdrawalSelectedIds.value,
      number: withdrawalNumber.value || null,
    });
    success.value = `Surat penarikan untuk ${withdrawalSelectedIds.value.length} siswa digenerate.`;
    withdrawalSelectedIds.value = [];
    withdrawalNumber.value = '';
    await loadLetters();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

const downloadLetter = async (letter: LetterRecord): Promise<void> => {
  try {
    await phase4Service.downloadLetter(letter);
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

const completePhase = async (): Promise<void> => {
  const selectedIds = allGradedStudents().map((s) => s.userId);
  if (selectedIds.length === 0) {
    error.value = 'Tidak ada siswa dengan nilai akhir.';
    return;
  }
  if (!confirm(`Ubah fase ${selectedIds.length} siswa ke PKL_SELESAI?`)) return;

  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    const res = await phase4Service.completePhase(selectedIds);
    phaseResults.value = res.results;
    phaseSkipped.value = res.skipped;
    success.value = `${res.results.length} siswa diubah ke PKL_SELESAI.`;
    if (res.skipped.length > 0) {
      success.value += ` ${res.skipped.length} dilewati (syarat belum lengkap).`;
    }
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

onMounted(() => {
  void (async () => {
    await cohortStore.ensureLoaded();
    await load();
  })();
  void loadLetters();
});

watch(
  () => cohortStore.activeCohortId,
  () => {
    detailClass.value = null;
    void load();
  }
);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <div class="card">
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-gray-800">Rekap Nilai</h2>
          <p v-if="recap" class="text-sm text-gray-500">
            {{ recap.totalGraded }}/{{ recap.totalStudents }} siswa dinilai
          </p>
        </div>
      </div>

      <SkeletonTable v-if="loading" :rows="6" :cols="5" />
      <div v-else-if="!recap || recap.classes.length === 0" class="py-6 text-center text-sm text-gray-400">
        Belum ada data nilai.
      </div>
      <table v-else class="table">
        <thead>
          <tr>
            <th>Kelas</th>
            <th class="text-center">Siswa</th>
            <th class="text-center">Kelompok</th>
            <th class="text-center">Dinilai</th>
            <th class="text-center">Rata-rata</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="cls in recap.classes"
            :key="cls.className"
            class="cursor-pointer hover:bg-gray-50"
            @click="detailClass = cls"
          >
            <td class="font-medium text-gray-800">{{ cls.className }}</td>
            <td class="text-center">{{ cls.studentCount }}</td>
            <td class="text-center">{{ cls.groups.length }}</td>
            <td class="text-center">
              {{ cls.gradedCount }}<span class="text-gray-400">/{{ cls.studentCount }}</span>
            </td>
            <td class="text-center font-semibold text-gray-800">
              {{ classAvg(cls) !== null ? classAvg(cls)!.toFixed(1) : '—' }}
            </td>
            <td class="text-right text-primary-600">Buka</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal kelas: kelompok + nilai siswa -->
    <Modal :open="!!detailClass" :title="detailClass?.className ?? 'Kelas'" size="xl" @close="detailClass = null">
      <template v-if="detailClass">
        <p class="mb-4 text-sm text-gray-500">
          {{ detailClass.studentCount }} siswa · {{ detailClass.groups.length }} kelompok ·
          {{ detailClass.gradedCount }} dinilai
        </p>
        <div
          v-for="g in detailClass.groups"
          :key="g.groupId"
          class="mb-4 border border-gray-200 p-3 last:mb-0"
        >
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold text-gray-800">{{ g.groupName }}</span>
              <span v-if="g.companyName" class="text-sm text-gray-500">— {{ g.companyName }}</span>
              <span
                v-if="g.students.length < g.memberCount"
                class="badge bg-amber-100 text-amber-700"
                title="Sebagian anggota di kelas lain"
              >
                {{ g.students.length }}/{{ g.memberCount }} di kelas ini
              </span>
            </div>
            <span class="text-xs text-gray-500">
              {{ g.students.length }} siswa · {{ gradedIn(g.students) }} dinilai
              <template v-if="avgOf(g.students) !== null"> · {{ avgOf(g.students)!.toFixed(1) }}</template>
            </span>
          </div>

          <table class="table">
            <thead>
              <tr>
                <th>Siswa</th>
                <th>NISN</th>
                <th class="text-center">DUDI</th>
                <th class="text-center">Indikator</th>
                <th class="text-center">Bimbingan</th>
                <th class="text-center">Akhir</th>
                <th class="text-center">Predikat</th>
                <th>Catatan</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in g.students" :key="s.userId" :class="{ 'opacity-70': !s.grade }">
                <td>
                  <div class="font-medium text-gray-800">{{ s.fullName }}</div>
                  <div class="font-mono text-xs text-gray-400">{{ s.username }}</div>
                </td>
                <td class="font-mono text-sm text-gray-600">{{ s.nisn ?? '—' }}</td>
                <template v-if="s.grade">
                  <td class="text-center">{{ toNum(s.grade.scoreDudi) ?? '—' }}</td>
                  <td class="text-center">
                    <span
                      v-if="(s.grade.aspects ?? []).length > 0"
                      class="cursor-help text-gray-600 underline decoration-dotted"
                      :title="(s.grade.aspects ?? []).map((a) => `${a.label}: ${a.score}`).join('\n')"
                    >
                      {{ (s.grade.aspects ?? []).length }} aspek
                    </span>
                    <span v-else class="text-gray-400">-</span>
                  </td>
                  <td class="text-center">{{ toNum(s.grade.scoreGuidance) ?? '—' }}</td>
                  <td class="text-center font-semibold text-gray-800">{{ toNum(s.grade.finalScore) ?? '—' }}</td>
                  <td class="text-center"><StatusBadge :status="s.grade.predicate ?? '-'" /></td>
                  <td class="text-gray-500">{{ s.grade.note ?? '-' }}</td>
                </template>
                <template v-else>
                  <td colspan="6" class="text-center text-sm text-gray-400">Belum dinilai</td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </Modal>

    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Surat Penarikan Siswa</h2>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label class="label">Kelompok</label>
          <select v-model="withdrawalGroupId" class="input">
            <option value="">-- Pilih --</option>
            <option v-for="g in groups" :key="g.id" :value="g.id">
              {{ g.code ?? '' }} {{ g.name }}
            </option>
          </select>
        </div>
        <div>
          <label class="label">Nomor Surat</label>
          <input v-model="withdrawalNumber" class="input" placeholder="Opsional" />
        </div>
      </div>

      <LoadingSpinner v-if="loadingMembers" label="Memuat anggota…" class="mt-4" />
      <div v-else-if="withdrawalGroupId && withdrawalMembers.length > 0" class="mt-4">
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label
            v-for="m in withdrawalMembers"
            :key="m.userId"
            class="flex items-center gap-2 border border-gray-200 px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              :checked="withdrawalSelectedIds.includes(m.userId)"
              @change="toggleMember(m.userId, ($event.target as HTMLInputElement).checked)"
            />
            <span>
              {{ m.user?.studentProfile?.fullName ?? m.user?.username ?? m.userId }}
              <span v-if="m.isLeader" class="text-amber-600">(Ketua)</span>
            </span>
          </label>
        </div>
      </div>
      <p v-else-if="withdrawalGroupId" class="mt-4 text-sm text-gray-500">Kelompok tanpa anggota.</p>

      <button
        class="btn-primary mt-4"
        :disabled="saving || !withdrawalGroupId || withdrawalSelectedIds.length === 0"
        @click="generateWithdrawal"
      >
        <LoadingSpinner v-if="saving" inline />
        {{ saving ? 'Menggenerate…' : `Generate (${withdrawalSelectedIds.length})` }}
      </button>
    </div>

    <div class="card">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-gray-800">Surat Terbit</h2>
        <div class="flex items-center gap-2">
          <select v-model="letterFilter" class="input w-auto" @change="loadLetters">
            <option value="">Semua Jenis</option>
            <option value="PENGANTAR">Pengantar</option>
            <option value="PENUGASAN">Penugasan</option>
            <option value="PENARIKAN">Penarikan</option>
          </select>
          <button class="btn-secondary" :disabled="lettersLoading" @click="loadLetters">Muat Ulang</button>
        </div>
      </div>
      <SkeletonTable v-if="lettersLoading" :rows="5" :cols="5" />
      <table v-else class="table">
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Jenis</th>
            <th>Nomor</th>
            <th>Perihal</th>
            <th>Penanda Tangan</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in letters" :key="l.id">
            <td>{{ new Date(l.createdAt).toLocaleDateString('id-ID') }}</td>
            <td><StatusBadge :status="l.type" /></td>
            <td class="font-mono">{{ l.number ?? '-' }}</td>
            <td>{{ l.subject ?? '-' }}</td>
            <td>{{ l.signerName }}</td>
            <td class="text-right">
              <button class="text-sm text-primary-600 hover:underline" @click="downloadLetter(l)">Unduh</button>
            </td>
          </tr>
          <tr v-if="letters.length === 0">
            <td colspan="6" class="py-4 text-center text-gray-400">Belum ada surat.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2 class="mb-3 text-lg font-semibold text-gray-800">Transisi Fase ke PKL Selesai</h2>
      <p class="mb-3 text-sm text-gray-600">
        Siswa dengan nilai akhir diubah dari PKL_AKTIF ke PKL_SELESAI.
      </p>
      <button class="btn-success" :disabled="saving" @click="completePhase">
        <LoadingSpinner v-if="saving" inline />
        {{ saving ? 'Memproses…' : 'Ubah Fase ke PKL_SELESAI' }}
      </button>
      <div v-if="phaseSkipped.length > 0" class="mt-4 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <p class="font-medium">Dilewati ({{ phaseSkipped.length }})</p>
        <ul class="mt-1 list-inside list-disc">
          <li v-for="s in phaseSkipped" :key="s.studentId" class="font-mono text-xs">
            {{ s.studentId }} — {{ s.reason }}
          </li>
        </ul>
      </div>
      <div v-if="phaseResults.length > 0" class="mt-4 text-sm text-gray-600">
        Berhasil: {{ phaseResults.length }} siswa.
      </div>
    </div>
  </div>
</template>

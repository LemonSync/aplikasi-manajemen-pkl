<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import {
  gradeService,
  phase4Service,
  type GradeRecapByClass,
  type GradeRecapClass,
  type GradeRecapStudent,
  type PhaseTransitionResult,
} from '@/services/api.service';
import { useCohortStore } from '@/stores/cohort.store';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';
import StatusBadge from '@/components/StatusBadge.vue';

const recap = ref<GradeRecapByClass | null>(null);
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

const load = async (): Promise<void> => {
  loading.value = true;
  try {
    recap.value = await gradeService.recapByClass(
      cohortStore.activeCohortId ? { cohortId: cohortStore.activeCohortId } : undefined
    );
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
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

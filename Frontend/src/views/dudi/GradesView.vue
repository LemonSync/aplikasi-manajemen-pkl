<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { gradeService, type GradeRecord } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import StatusBadge from '@/components/StatusBadge.vue';

const grades = ref<GradeRecord[]>([]);
type DudiGroup = Awaited<ReturnType<typeof gradeService.dudiAssignments>>[number];
const groups = ref<DudiGroup[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');

// Form input nilai
const selectedStudentId = ref('');
const selectedGroupId = ref('');
const scoreDudi = ref<number | null>(null);
const gradeNote = ref('');

// Indikator penilaian (form penilaian per aspek sesuai indikator PKL)
const DEFAULT_ASPECTS = [
  'Disiplin & Kehadiran',
  'Sikap & Etika Kerja',
  'Tanggung Jawab',
  'Kerja Sama Tim',
  'Keterampilan Teknis (Job Skill)',
  'Kepatuhan Prosedur & K3',
  'Komunikasi & Pelaporan',
];
const aspects = ref(DEFAULT_ASPECTS.map((label) => ({ label, score: null as number | null })));

const filledAspects = computed(() => aspects.value.filter((a) => a.score !== null && a.score !== undefined));
const aspectAverage = computed(() => {
  if (filledAspects.value.length === 0) return null;
  const sum = filledAspects.value.reduce((acc, a) => acc + Number(a.score), 0);
  return Math.round((sum / filledAspects.value.length) * 100) / 100;
});

// Rata-rata indikator menjadi nilai DUDI secara otomatis
watch(aspectAverage, (avg) => {
  if (avg !== null) scoreDudi.value = avg;
});

const selectedGroup = computed(() => groups.value.find((group) => group.id === selectedGroupId.value) ?? null);

const load = async (): Promise<void> => {
  loading.value = true;
  try {
    const [assignments, gradeList] = await Promise.all([
      gradeService.dudiAssignments(),
      gradeService.listForDudi(),
    ]);
    groups.value = assignments;
    grades.value = gradeList;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const submitGrade = async (): Promise<void> => {
  if (!selectedStudentId.value || scoreDudi.value === null) return;
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    const filled = filledAspects.value.map((a) => ({ label: a.label, score: Number(a.score) }));
    await gradeService.inputGrade({
      studentId: selectedStudentId.value,
      groupId: selectedGroupId.value || null,
      scoreDudi: scoreDudi.value,
      ...(filled.length > 0 ? { aspects: filled } : {}),
      note: gradeNote.value || null,
    });
    success.value = 'Nilai berhasil diinput.';
    selectedStudentId.value = '';
    scoreDudi.value = null;
    gradeNote.value = '';
    aspects.value = DEFAULT_ASPECTS.map((label) => ({ label, score: null }));
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
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Input Nilai Akhir PKL</h2>
      <div v-if="error" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
      <div v-if="success" class="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label class="label">Kelompok PKL</label>
          <select v-model="selectedGroupId" class="input"><option value="">Pilih kelompok</option><option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option></select>
        </div>
        <div>
          <label class="label">Nama Siswa</label>
          <select v-model="selectedStudentId" class="input" :disabled="!selectedGroupId"><option value="">Pilih siswa</option><option v-for="member in selectedGroup?.members ?? []" :key="member.user.id" :value="member.user.id">{{ member.user.studentProfile?.fullName ?? member.user.username }} ({{ member.user.username }})</option></select>
        </div>
        <div>
          <label class="label">Nilai DUDI (0-100)</label>
          <input v-model.number="scoreDudi" type="number" min="0" max="100" class="input" placeholder="Otomatis dari rata-rata indikator" />
          <p class="mt-1 text-xs text-gray-500">Kosongkan agar memakai rata-rata indikator ({{ aspectAverage ?? '-' }}).</p>
        </div>
        <div>
          <label class="label">Catatan (opsional)</label>
          <input v-model="gradeNote" class="input" placeholder="Catatan untuk siswa" />
        </div>
      </div>

      <div class="mt-5 rounded-lg border border-gray-200 p-4">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-gray-700">Indikator Penilaian</h3>
          <span class="text-xs text-gray-500">Terisi {{ filledAspects.length }}/{{ aspects.length }} · Rata-rata: {{ aspectAverage ?? '-' }}</span>
        </div>
        <div class="space-y-2">
          <div v-for="(a, idx) in aspects" :key="a.label" class="flex items-center gap-3">
            <span class="flex-1 text-sm text-gray-700">{{ a.label }}</span>
            <input
              v-model.number="a.score"
              type="number"
              min="0"
              max="100"
              class="input w-28"
              :placeholder="(idx + 1).toString()"
            />
          </div>
        </div>
      </div>

      <button class="btn-primary mt-4" :disabled="saving || !selectedStudentId || scoreDudi === null" @click="submitGrade">
        {{ saving ? 'Menyimpan…' : 'Simpan Nilai' }}
      </button>
    </div>

    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Rekap Nilai</h2>
      <div v-if="loading" class="text-sm text-gray-500">Memuat…</div>
      <table v-else class="table">
        <thead>
          <tr>
            <th>Siswa</th>
            <th>Nilai DUDI</th>
            <th>Indikator</th>
            <th>Nilai Bimbingan</th>
            <th>Nilai Akhir</th>
            <th>Predikat</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in grades" :key="g.id">
            <td>{{ g.student?.studentProfile?.fullName ?? g.student?.username ?? g.studentId }}</td>
            <td>{{ g.scoreDudi ?? '-' }}</td>
            <td>
              <span
                v-if="(g.aspects ?? []).length > 0"
                class="cursor-help text-gray-600 underline decoration-dotted"
                :title="(g.aspects ?? []).map((a) => `${a.label}: ${a.score}`).join('\n')"
              >
                {{ (g.aspects ?? []).length }} aspek
              </span>
              <span v-else class="text-gray-400">-</span>
            </td>
            <td>{{ g.scoreGuidance ?? '-' }}</td>
            <td>{{ g.finalScore ?? '-' }}</td>
            <td><StatusBadge :status="g.predicate ?? '-'" /></td>
          </tr>
          <tr v-if="grades.length === 0">
            <td colspan="6" class="py-4 text-center text-gray-400">Belum ada data nilai.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

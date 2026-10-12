<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { gradeService, type GradeRecord } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import StatusBadge from '@/components/StatusBadge.vue';

/** Baris aspek penilaian dinamis (1–20). */
interface AspectRow {
  label: string;
  score: number | null;
}

const grades = ref<GradeRecord[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');

const aspects = ref<AspectRow[]>([{ label: '', score: null }]);
const scoreDudi = ref<number | null>(null);
const note = ref('');

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    grades.value = await gradeService.myGrades();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const addAspect = (): void => {
  if (aspects.value.length >= 20) return;
  aspects.value.push({ label: '', score: null });
};

const removeAspect = (i: number): void => {
  if (aspects.value.length <= 1) return;
  aspects.value.splice(i, 1);
};

/** Status approval terbaru; default MENUNGGU bila belum ada. */
const approvalLabel = (g: GradeRecord): string => g.approval?.status ?? 'MENUNGGU';

const submit = async (): Promise<void> => {
  error.value = '';
  success.value = '';
  const filled = aspects.value.filter((a) => a.label.trim() || a.score !== null);
  if (scoreDudi.value === null && filled.length === 0) {
    error.value = 'Isi nilai DUDI dan/atau minimal satu aspek penilaian.';
    return;
  }
  for (const [i, a] of filled.entries()) {
    if (!a.label.trim()) {
      error.value = `Aspek ${i + 1}: nama aspek wajib diisi.`;
      return;
    }
    if (a.score === null || a.score < 0 || a.score > 100) {
      error.value = `Aspek ${i + 1}: skor harus 0–100.`;
      return;
    }
  }
  saving.value = true;
  try {
    await gradeService.inputGrade({
      ...(scoreDudi.value !== null ? { scoreDudi: scoreDudi.value } : {}),
      ...(filled.length > 0
        ? { aspects: filled.map((a) => ({ label: a.label.trim(), score: a.score as number })) }
        : {}),
      note: note.value.trim() || null,
    });
    success.value = 'Nilai berhasil disimpan dan menunggu persetujuan guru pembimbing.';
    aspects.value = [{ label: '', score: null }];
    scoreDudi.value = null;
    note.value = '';
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
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <!-- Form Input Nilai -->
    <form class="card space-y-4" @submit.prevent="submit">
      <div>
        <h2 class="text-lg font-semibold text-gray-800">Input Nilai PKL</h2>
        <p class="text-sm text-gray-500">
          Isi nilai DUDI dan/atau aspek penilaian (0–100). Setelah disimpan, nilai akan ditinjau
          dan disetujui oleh guru pembimbing.
        </p>
      </div>

      <!-- Aspek penilaian -->
      <div>
        <div class="mb-2 flex items-center justify-between">
          <label class="label !mb-0">Aspek Penilaian</label>
          <button
            type="button"
            class="btn-secondary !px-3 !py-1 !text-xs"
            :disabled="aspects.length >= 20"
            @click="addAspect"
          >
            + Tambah Aspek
          </button>
        </div>
        <p class="mb-2 text-xs text-gray-400">Minimal 1, maksimal 20 aspek. Skor 0–100.</p>
        <div v-for="(a, i) in aspects" :key="i" class="mb-2 flex items-center gap-2">
          <input
            v-model="a.label"
            class="input flex-1"
            :placeholder="`Aspek ${i + 1} (mis. Disiplin, Kualitas Kerja, dll.)`"
          />
          <input
            v-model.number="a.score"
            class="input w-28"
            type="number"
            min="0"
            max="100"
            step="1"
            placeholder="Skor"
          />
          <button
            v-if="aspects.length > 1"
            type="button"
            class="text-xs text-red-600 hover:underline"
            @click="removeAspect(i)"
          >
            Hapus
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label class="label">Nilai DUDI (opsional)</label>
          <input
            v-model.number="scoreDudi"
            class="input"
            type="number"
            min="0"
            max="100"
            step="1"
            placeholder="0–100"
          />
        </div>
        <div>
          <label class="label">Catatan (opsional)</label>
          <input v-model="note" class="input" placeholder="Catatan tambahan…" />
        </div>
      </div>

      <div>
        <button type="submit" class="btn-primary" :disabled="saving">
          {{ saving ? 'Menyimpan…' : 'Simpan Nilai' }}
        </button>
      </div>
    </form>

    <!-- Nilai Tersimpan -->
    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Nilai Tersimpan</h2>
      <div v-if="loading" class="loading" />
      <table v-else class="table">
        <thead>
          <tr>
            <th>Nilai DUDI</th>
            <th>Nilai Bimbingan</th>
            <th>Nilai Akhir</th>
            <th>Predikat</th>
            <th>Status Approval</th>
            <th>Catatan Approval</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in grades" :key="g.id">
            <td>{{ g.scoreDudi ?? '-' }}</td>
            <td>{{ g.scoreGuidance ?? '-' }}</td>
            <td>{{ g.finalScore ?? '-' }}</td>
            <td>{{ g.predicate ?? '-' }}</td>
            <td><StatusBadge :status="approvalLabel(g)" /></td>
            <td class="text-gray-500">{{ g.approval?.note ?? '-' }}</td>
          </tr>
          <tr v-if="grades.length === 0">
            <td colspan="6" class="py-4 text-center text-gray-400">Belum ada data nilai.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

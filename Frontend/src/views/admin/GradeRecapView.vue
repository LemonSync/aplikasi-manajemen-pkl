<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  gradeService,
  phase4Service,
  type GradeRecapByClass,
  type GradeRecapClass,
  type GradeRecapStudent,
  type PhaseTransitionResult,
} from '@/services/api.service';
import { notify } from '@/composables/useNotify';
import { useCohortStore } from '@/stores/cohort.store';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { confirmDialog } from '@/composables/useDialog';

const recap = ref<GradeRecapByClass | null>(null);
const loading = ref(true);
const saving = ref(false);
const phaseResults = ref<PhaseTransitionResult[]>([]);
const phaseSkipped = ref<Array<{ studentId: string; reason: string }>>([]);

const cohortStore = useCohortStore();
const detailClass = ref<GradeRecapClass | null>(null);
const search = ref('');

// Persetujuan nilai (dulu milik guru pembimbing, kini ranah admin)
const approving = ref<{ gradeId: string; studentName: string } | null>(null);
const approveDecision = ref(true);
const approveNote = ref('');
const submitting = ref(false);

/**
 * Filter rekap per kelas → siswa (FE-side).
 * Kelas cocok nama → tampil semua isinya; jika tidak, tampil hanya
 * siswa yang cocok; kelas tanpa kecocokan disembunyikan.
 */
const filteredClasses = computed<GradeRecapClass[]>(() => {
  const q = search.value.trim().toLowerCase();
  const classes = recap.value?.classes ?? [];
  if (!q) return classes;
  return classes
    .map((cls) => {
      if (cls.className.toLowerCase().includes(q)) return cls;
      const students = cls.students.filter((s) =>
        [s.fullName, s.username, s.nisn ?? '', s.companyName ?? '', s.supervisorName ?? '']
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
      if (students.length === 0) return null;
      return { ...cls, students };
    })
    .filter((cls): cls is GradeRecapClass => cls !== null);
});

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

const classAvg = (cls: GradeRecapClass): number | null => avgOf(cls.students);

const gradedIn = (students: GradeRecapStudent[]): number => students.filter((s) => s.grade !== null).length;

/** Tooltip rincian aspek penilaian (per label: skor). */
const aspectsTitle = (s: GradeRecapStudent): string =>
  (s.grade?.aspects ?? []).map((a) => `${a.label}: ${a.score}`).join('\n');

const allGradedStudents = (): GradeRecapStudent[] =>
  (recap.value?.classes ?? []).flatMap((c) => c.students).filter((s) => s.grade?.finalScore != null);

const load = async (): Promise<void> => {
  loading.value = true;
  const openClassName = detailClass.value?.className ?? null;
  try {
    recap.value = await gradeService.recapByClass(
      cohortStore.activeCohortId ? { cohortId: cohortStore.activeCohortId } : undefined
    );
    // Modal kelas menampilkan snapshot lama — ambil ulang setelah muat agar
    // status approval yang baru diubah langsung terlihat.
    if (openClassName) {
      detailClass.value = recap.value?.classes.find((c) => c.className === openClassName) ?? null;
    }
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    loading.value = false;
  }
};

const exporting = ref(false);

/** Satu file Excel, satu worksheet per kelas — mengikuti gelombang yang aktif. */
const exportExcel = async (): Promise<void> => {
  exporting.value = true;
  notify.clear();
  try {
    await gradeService.exportRecapByClass(cohortStore.activeCohortId ?? undefined);
    notify.success('File Excel rekap nilai telah diunduh.');
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    exporting.value = false;
  }
};

const openApproval = (student: GradeRecapStudent, approved: boolean): void => {
  if (!student.grade) return;
  approving.value = { gradeId: student.grade.id, studentName: student.fullName };
  approveDecision.value = approved;
  approveNote.value = '';
  notify.clear();
};

const closeApproval = (): void => {
  if (submitting.value) return;
  approving.value = null;
  approveNote.value = '';
};

const submitApproval = async (): Promise<void> => {
  const target = approving.value;
  if (!target) return;
  if (!approveDecision.value && !approveNote.value.trim()) {
    notify.error('Tuliskan alasan penolakan agar siswa dapat memperbaiki nilainya.');
    return;
  }
  submitting.value = true;
  notify.clear();
  try {
    await gradeService.approve(target.gradeId, {
      approved: approveDecision.value,
      note: approveNote.value.trim() || null,
    });
    notify.success(
      approveDecision.value
      ? `Nilai ${target.studentName} disetujui.`
      : `Nilai ${target.studentName} ditolak — siswa dapat mengirim ulang nilainya.`
    );
    approving.value = null;
    approveNote.value = '';
    await load();
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    submitting.value = false;
  }
};

const completePhase = async (): Promise<void> => {
  const selectedIds = allGradedStudents().map((s) => s.userId);
  if (selectedIds.length === 0) {
    notify.error('Tidak ada siswa dengan nilai akhir.');
    return;
  }
  const ok = await confirmDialog({
    title: 'Selesaikan Fase PKL',
    message: `Ubah fase ${selectedIds.length} siswa ke PKL_SELESAI?`,
    confirmLabel: 'Ubah fase',
  });
  if (!ok) return;

  saving.value = true;
  notify.clear();
  try {
    const res = await phase4Service.completePhase(selectedIds);
    phaseResults.value = res.results;
    phaseSkipped.value = res.skipped;
    const skippedNote = res.skipped.length > 0 ? ` ${res.skipped.length} dilewati (syarat belum lengkap).` : '';
    notify.success(`${res.results.length} siswa diubah ke PKL_SELESAI.${skippedNote}`);
  } catch (e) {
    notify.error(extractErrorMessage(e));
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

    <div class="card">
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-gray-800">Rekap Nilai</h2>
          <p v-if="recap" class="text-sm text-gray-500">
            {{ recap.totalGraded }}/{{ recap.totalStudents }} siswa dinilai
          </p>
        </div>
        <div class="flex items-center gap-2">
          <input
            v-model="search"
            class="input w-72"
            type="search"
            placeholder="Cari kelas, nama siswa, NISN, perusahaan…"
          />
          <button class="btn-secondary whitespace-nowrap" :disabled="exporting" @click="exportExcel">
            <LoadingSpinner v-if="exporting" inline />
            {{ exporting ? 'Membuat file…' : 'Unduh Excel' }}
          </button>
        </div>
      </div>

      <SkeletonTable v-if="loading" :rows="6" :cols="5" />
      <div v-else-if="!recap || recap.classes.length === 0" class="py-6 text-center text-sm text-gray-400">
        Belum ada data nilai.
      </div>
      <div v-else-if="filteredClasses.length === 0" class="py-6 text-center text-sm text-gray-400">
        Tidak ada data yang cocok dengan pencarian.
      </div>
      <table v-else class="table">
        <thead>
          <tr>
            <th>Kelas</th>
            <th class="text-center">Siswa</th>
            <th class="text-center">Dinilai</th>
            <th class="text-center">Rata-rata</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="cls in filteredClasses"
            :key="cls.className"
            class="cursor-pointer hover:bg-gray-50"
            @click="detailClass = cls"
          >
            <td class="font-medium text-gray-800">{{ cls.className }}</td>
            <td class="text-center">{{ cls.students.length }}</td>
            <td class="text-center">
              {{ gradedIn(cls.students) }}<span class="text-gray-400">/{{ cls.students.length }}</span>
            </td>
            <td class="text-center font-semibold text-gray-800">
              {{ classAvg(cls) !== null ? classAvg(cls)!.toFixed(1) : '—' }}
            </td>
            <td class="text-right text-primary-600">Buka</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal kelas: nilai per siswa -->
    <Modal :open="!!detailClass" :title="detailClass?.className ?? 'Kelas'" size="xl" @close="detailClass = null">
      <template v-if="detailClass">
        <p class="mb-4 text-sm text-gray-500">
          {{ detailClass.students.length }} siswa · {{ gradedIn(detailClass.students) }} dinilai
        </p>

        <table class="table">
          <thead>
            <tr>
              <th>Siswa</th>
              <th>NISN</th>
              <th>Perusahaan</th>
              <th>Pembimbing</th>
              <th class="text-center">Approval</th>
              <th class="text-center">DUDI</th>
              <th class="text-center">Indikator</th>
              <th class="text-center">Akhir</th>
              <th class="text-center">Predikat</th>
              <th>Catatan</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in detailClass.students" :key="s.userId" :class="{ 'opacity-70': !s.grade }">
              <td>
                <div class="font-medium text-gray-800">{{ s.fullName }}</div>
                <div class="font-mono text-xs text-gray-400">{{ s.username }}</div>
              </td>
              <td class="font-mono text-sm text-gray-600">{{ s.nisn ?? '—' }}</td>
              <td class="text-gray-600">{{ s.companyName ?? '—' }}</td>
              <td class="text-gray-600">{{ s.supervisorName ?? '—' }}</td>
              <td class="text-center">
                <StatusBadge v-if="s.approvalStatus" :status="s.approvalStatus" />
                <span v-else class="text-gray-400">—</span>
              </td>
              <template v-if="s.grade">
                <td class="text-center">{{ toNum(s.grade.scoreDudi) ?? '—' }}</td>
                <td class="text-center">
                  <span
                    v-if="(s.grade.aspects ?? []).length > 0"
                    class="cursor-help text-gray-600 underline decoration-dotted"
                    :title="aspectsTitle(s)"
                  >
                    {{ (s.grade.aspects ?? []).length }} aspek
                  </span>
                  <span v-else class="text-gray-400">-</span>
                </td>
                <td class="text-center font-semibold text-gray-800">{{ toNum(s.grade.finalScore) ?? '—' }}</td>
                <td class="text-center"><StatusBadge :status="s.grade.predicate ?? '-'" /></td>
                <td class="text-gray-500">{{ s.grade.note ?? '-' }}</td>
              </template>
              <template v-else>
                <td colspan="5" class="text-center text-sm text-gray-400">Belum dinilai</td>
              </template>
              <td class="whitespace-nowrap text-right">
                <template v-if="s.grade && s.approvalStatus === 'MENUNGGU'">
                  <button class="text-sm text-emerald-600 hover:underline" @click="openApproval(s, true)">
                    Acc
                  </button>
                  <span class="mx-1 text-gray-300">|</span>
                  <button class="text-sm text-red-600 hover:underline" @click="openApproval(s, false)">
                    Tolak
                  </button>
                </template>
                <span v-else class="text-gray-300">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </template>
    </Modal>

    <!-- Modal persetujuan nilai (dulu dikerjakan guru pembimbing, kini admin) -->
    <Modal
      :open="!!approving"
      :title="approveDecision ? 'Setujui Nilai' : 'Tolak Nilai'"
      size="md"
      :busy="submitting"
      @close="closeApproval"
    >
      <template v-if="approving">
        <p class="mb-3 text-sm text-gray-600">
          Nilai PKL <strong>{{ approving.studentName }}</strong>.
        </p>
        <template v-if="approveDecision">
          <p class="text-xs text-gray-500">
            Setelah disetujui, nilai terkunci dan tidak dapat diubah lagi oleh siswa.
          </p>
        </template>
        <template v-else>
          <label class="label" for="approve-note">Alasan Penolakan</label>
          <textarea
            id="approve-note"
            v-model="approveNote"
            rows="3"
            class="input"
            placeholder="Alasan penolakan (wajib diisi)"
          ></textarea>
          <p class="mt-1 text-xs text-gray-500">
            Siswa dapat mengirim ulang nilainya setelah ditolak.
          </p>
        </template>
      </template>
      <template #footer>
        <button class="btn-secondary" :disabled="submitting" @click="closeApproval">Batal</button>
        <button
          :class="approveDecision ? 'btn-success' : 'btn-danger'"
          :disabled="submitting || (!approveDecision && !approveNote.trim())"
          @click="submitApproval"
        >
          <LoadingSpinner v-if="submitting" inline />
          {{ submitting ? 'Memproses…' : approveDecision ? 'Setujui' : 'Tolak' }}
        </button>
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

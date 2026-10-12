<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  gradeService,
  documentService,
  downloadFile,
  type GradeRecord,
  type DocumentRecord,
} from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import type { PaginationMeta } from '@/types';
import Modal from '@/components/Modal.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';
import StatusBadge from '@/components/StatusBadge.vue';

/**
 * Penilaian PKL & approval guru (per siswa, tanpa kelompok / tanpa DUDI).
 * Daftar nilai otomatis dibatasi backend ke siswa bimbingan guru yang login.
 */
const grades = ref<GradeRecord[]>([]);
const meta = ref<PaginationMeta | undefined>(undefined);
const docs = ref<DocumentRecord[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');

const page = ref(1);
const perPage = 10;

// Form input nilai bimbingan
const selectedGradeId = ref('');
const scoreGuidance = ref<number | null>(null);
const guidanceNote = ref('');

// Modal approval (nilai maupun laporan akhir)
type ModalTarget =
  | { kind: 'grade'; id: string }
  | { kind: 'document'; id: string }
  | null;
const modalTarget = ref<ModalTarget>(null);
const modalApproved = ref(true);
const modalNote = ref('');

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    const [gradesData, docsData] = await Promise.all([
      gradeService.list({ page: page.value, perPage }),
      documentService.list('MENUNGGU_VERIFIKASI', undefined, undefined, 1, 100),
    ]);
    grades.value = gradesData.items;
    meta.value = gradesData.meta;
    docs.value = docsData.items.filter((d) => d.type === 'LAPORAN_AKHIR');
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const applyPage = (p: number): void => {
  if (p < 1) return;
  if (meta.value && p > meta.value.totalPages) return;
  page.value = p;
  void load();
};

const openApproval = (target: Exclude<ModalTarget, null>, approved: boolean): void => {
  modalTarget.value = target;
  modalApproved.value = approved;
  modalNote.value = '';
  error.value = '';
};

const closeApproval = (): void => {
  if (saving.value) return;
  modalTarget.value = null;
  modalNote.value = '';
};

const submitApproval = async (): Promise<void> => {
  const target = modalTarget.value;
  if (!target) return;
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    if (target.kind === 'grade') {
      await gradeService.approve(target.id, {
        approved: modalApproved.value,
        note: modalNote.value.trim() || null,
      });
      success.value = modalApproved.value ? 'Nilai disetujui.' : 'Nilai ditolak.';
    } else {
      await documentService.verify(
        target.id,
        modalApproved.value ? 'APPROVE' : 'REJECT',
        modalNote.value.trim() || undefined
      );
      success.value = modalApproved.value ? 'Laporan akhir disetujui.' : 'Laporan akhir ditolak.';
    }
    modalTarget.value = null;
    modalNote.value = '';
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

const submitGuidance = async (): Promise<void> => {
  if (!selectedGradeId.value || scoreGuidance.value === null) return;
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    await gradeService.inputGuidance(selectedGradeId.value, {
      scoreGuidance: scoreGuidance.value,
      note: guidanceNote.value.trim() || null,
    });
    success.value = 'Nilai bimbingan berhasil diinput.';
    selectedGradeId.value = '';
    scoreGuidance.value = null;
    guidanceNote.value = '';
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

const download = async (id: string, title?: string | null): Promise<void> => {
  try {
    await downloadFile(`/documents/${id}/download`, title ? `${title}.pdf` : 'laporan-akhir.pdf');
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

const studentName = (g: GradeRecord): string =>
  g.student?.studentProfile?.fullName ?? g.student?.username ?? g.studentId;

const approvalStatus = (g: GradeRecord): string => g.approval?.status ?? 'MENUNGGU';

const aspectSummary = (g: GradeRecord): string =>
  (g.aspects ?? []).map((a) => `${a.label}: ${a.score}`).join(' · ') || '-';

const modalTitle = computed(() => {
  const kind = modalTarget.value?.kind ?? 'grade';
  const verdict = modalApproved.value ? 'Setujui' : 'Tolak';
  return kind === 'grade' ? `${verdict} Nilai PKL` : `${verdict} Laporan Akhir`;
});

const totalPages = (): number => meta.value?.totalPages ?? 1;

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <!-- Daftar nilai + approval -->
    <div class="card">
      <div class="mb-4">
        <h2 class="text-lg font-semibold text-gray-800">Penilaian Siswa Bimbingan</h2>
        <p class="text-sm text-gray-500">
          Setujui atau tolak nilai yang diinput siswa. Daftar otomatis terbatas pada siswa bimbingan Anda.
        </p>
      </div>

      <SkeletonTable v-if="loading" :rows="5" :cols="7" />
      <table v-else class="table">
        <thead>
          <tr>
            <th>Siswa</th>
            <th>Rincian Aspek</th>
            <th>Nilai Bimbingan</th>
            <th>Nilai Akhir</th>
            <th>Predikat</th>
            <th>Status Approval</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in grades" :key="g.id">
            <td class="font-medium text-gray-800">{{ studentName(g) }}</td>
            <td class="max-w-sm text-xs text-gray-500">{{ aspectSummary(g) }}</td>
            <td>{{ g.scoreGuidance ?? '-' }}</td>
            <td>{{ g.finalScore ?? '-' }}</td>
            <td><StatusBadge :status="g.predicate ?? '-'" /></td>
            <td>
              <StatusBadge :status="approvalStatus(g)" />
              <p v-if="g.approval?.note" class="mt-1 max-w-[14rem] truncate text-xs text-gray-400" :title="g.approval.note">
                {{ g.approval.note }}
              </p>
            </td>
            <td class="text-right whitespace-nowrap">
              <button
                class="mr-3 text-sm text-emerald-600 hover:underline"
                :disabled="saving"
                @click="openApproval({ kind: 'grade', id: g.id }, true)"
              >
                Setujui
              </button>
              <button
                class="text-sm text-red-600 hover:underline"
                :disabled="saving"
                @click="openApproval({ kind: 'grade', id: g.id }, false)"
              >
                Tolak
              </button>
            </td>
          </tr>
          <tr v-if="grades.length === 0">
            <td colspan="7" class="py-4 text-center text-gray-400">Belum ada data nilai siswa bimbingan.</td>
          </tr>
        </tbody>
      </table>

      <div v-if="!loading && grades.length > 0" class="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
        <span>Total {{ meta?.total ?? grades.length }} nilai · Halaman {{ page }} dari {{ totalPages() }}</span>
        <div class="flex items-center gap-2">
          <button class="btn-secondary" :disabled="page <= 1" @click="applyPage(page - 1)">Sebelumnya</button>
          <button class="btn-secondary" :disabled="page >= totalPages()" @click="applyPage(page + 1)">
            Berikutnya
          </button>
        </div>
      </div>
    </div>

    <!-- Input nilai bimbingan -->
    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Input Nilai Bimbingan</h2>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label class="label">Pilih Siswa</label>
          <select v-model="selectedGradeId" class="input">
            <option value="">— Pilih —</option>
            <option v-for="g in grades" :key="g.id" :value="g.id">
              {{ studentName(g) }} — Nilai Akhir: {{ g.finalScore ?? '-' }}
            </option>
          </select>
        </div>
        <div>
          <label class="label">Nilai Bimbingan (0-100)</label>
          <input v-model.number="scoreGuidance" type="number" min="0" max="100" class="input" placeholder="0" />
        </div>
      </div>
      <div class="mt-4">
        <label class="label">Catatan (opsional)</label>
        <input v-model="guidanceNote" class="input" placeholder="Catatan bimbingan" />
      </div>
      <button
        class="btn-primary mt-4"
        :disabled="saving || !selectedGradeId || scoreGuidance === null"
        @click="submitGuidance"
      >
        {{ saving ? 'Menyimpan…' : 'Simpan Nilai Bimbingan' }}
      </button>
    </div>

    <!-- Verifikasi laporan akhir -->
    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Verifikasi Laporan Akhir</h2>
      <div v-if="loading" class="loading" />
      <table v-else class="table">
        <thead>
          <tr>
            <th>Jenis</th>
            <th>Judul</th>
            <th>Status</th>
            <th>Catatan</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in docs" :key="d.id">
            <td>{{ d.type }}</td>
            <td>{{ d.title ?? '-' }}</td>
            <td><StatusBadge :status="d.status" /></td>
            <td class="text-gray-500">{{ d.note ?? '-' }}</td>
            <td class="text-right whitespace-nowrap">
              <button class="mr-3 text-sm text-primary-600 hover:underline" @click="download(d.id, d.title)">
                Unduh
              </button>
              <button
                class="mr-3 text-sm text-emerald-600 hover:underline"
                :disabled="saving"
                @click="openApproval({ kind: 'document', id: d.id }, true)"
              >
                Setujui
              </button>
              <button
                class="text-sm text-red-600 hover:underline"
                :disabled="saving"
                @click="openApproval({ kind: 'document', id: d.id }, false)"
              >
                Tolak
              </button>
            </td>
          </tr>
          <tr v-if="docs.length === 0">
            <td colspan="5" class="py-4 text-center text-gray-400">
              Tidak ada laporan akhir menunggu verifikasi.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal approval -->
    <Modal :open="modalTarget !== null" :title="modalTitle" size="md" :busy="saving" @close="closeApproval">
      <div class="space-y-4">
        <p class="text-sm text-gray-600">
          {{ modalApproved ? 'Setujui' : 'Tolak' }} data ini?
        </p>
        <div>
          <label class="label">Catatan {{ modalApproved ? '(opsional)' : '(opsional, untuk siswa)' }}</label>
          <textarea
            v-model="modalNote"
            class="input"
            rows="3"
            :placeholder="modalApproved ? 'Catatan persetujuan' : 'Alasan penolakan'"
          />
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" :disabled="saving" @click="closeApproval">Batal</button>
        <button
          :class="modalApproved ? 'btn-primary' : 'btn-danger'"
          :disabled="saving"
          @click="submitApproval"
        >
          {{ saving ? 'Menyimpan…' : modalApproved ? 'Setujui' : 'Tolak' }}
        </button>
      </template>
    </Modal>
  </div>
</template>

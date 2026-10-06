<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { gradeService, documentService, groupService, downloadFile, type GradeRecord, type DocumentRecord } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import StatusBadge from '@/components/StatusBadge.vue';

const grades = ref<GradeRecord[]>([]);
const docs = ref<DocumentRecord[]>([]);
const groups = ref<unknown[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');

// Form input nilai bimbingan
const selectedGradeId = ref('');
const scoreGuidance = ref<number | null>(null);
const guidanceNote = ref('');

const load = async (): Promise<void> => {
  loading.value = true;
  try {
    const [gradesData, docsData, groupsData] = await Promise.all([
      gradeService.list(),
      documentService.list('MENUNGGU_VERIFIKASI'),
      groupService.listSupervised(),
    ]);
    grades.value = gradesData.items;
    docs.value = docsData.items.filter((d) => d.type === 'LAPORAN_AKHIR');
    groups.value = groupsData;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const approveDocument = async (id: string): Promise<void> => {
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    await documentService.verify(id, 'APPROVE');
    success.value = 'Dokumen berhasil disetujui.';
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

const rejectDocument = async (id: string): Promise<void> => {
  const note = prompt('Alasan penolakan:');
  if (note === null) return;
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    await documentService.verify(id, 'REJECT', note || undefined);
    success.value = 'Dokumen ditolak.';
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
      note: guidanceNote.value || null,
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

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Verifikasi Laporan Akhir</h2>
      <div v-if="error" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
      <div v-if="success" class="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>
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
            <td class="text-right space-x-2">
              <button class="text-primary-600 hover:underline" @click="download(d.id, d.title)">Unduh</button>
              <button class="text-emerald-600 hover:underline" :disabled="saving" @click="approveDocument(d.id)">Setujui</button>
              <button class="text-red-600 hover:underline" :disabled="saving" @click="rejectDocument(d.id)">Tolak</button>
            </td>
          </tr>
          <tr v-if="docs.length === 0">
            <td colspan="5" class="py-4 text-center text-gray-400">Tidak ada laporan akhir menunggu verifikasi.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Input Nilai Bimbingan</h2>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label class="label">Pilih Grade ID</label>
          <select v-model="selectedGradeId" class="input">
            <option value="">— Pilih —</option>
            <option v-for="g in grades" :key="g.id" :value="g.id">
              {{ g.student?.studentProfile?.fullName ?? g.student?.username ?? g.studentId }} — DUDI: {{ g.scoreDudi ?? '-' }}
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
      <button class="btn-primary mt-4" :disabled="saving || !selectedGradeId || scoreGuidance === null" @click="submitGuidance">
        {{ saving ? 'Menyimpan…' : 'Simpan Nilai Bimbingan' }}
      </button>
    </div>

    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Rekap Nilai (Semua Kelompok)</h2>
      <div v-if="loading" class="loading" />
      <table v-else class="table">
        <thead>
          <tr>
            <th>Siswa</th>
            <th>Nilai DUDI</th>
            <th>Nilai Bimbingan</th>
            <th>Nilai Akhir</th>
            <th>Predikat</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in grades" :key="g.id">
            <td>{{ g.student?.studentProfile?.fullName ?? g.student?.username ?? g.studentId }}</td>
            <td>{{ g.scoreDudi ?? '-' }}</td>
            <td>{{ g.scoreGuidance ?? '-' }}</td>
            <td>{{ g.finalScore ?? '-' }}</td>
            <td><StatusBadge :status="g.predicate ?? '-'" /></td>
          </tr>
          <tr v-if="grades.length === 0">
            <td colspan="5" class="py-4 text-center text-gray-400">Belum ada data nilai.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

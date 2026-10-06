<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { cohortService, type CohortRecord } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';
import StatusBadge from '@/components/StatusBadge.vue';

const cohorts = ref<CohortRecord[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');

const showForm = ref(false);
const formName = ref('');
const formYear = ref('');
const formDesc = ref('');
const formStatus = ref('DRAFT');
const formOriginalStatus = ref('');
const editId = ref('');

const CLOSED_STATES = ['CLOSED', 'ARCHIVED'];

const load = async (): Promise<void> => {
  loading.value = true;
  try {
    const { items } = await cohortService.list();
    cohorts.value = items;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const submit = async (): Promise<void> => {
  if (!formName.value) return;

  const isEdit = !!editId.value;
  const wasClosed = isEdit && CLOSED_STATES.includes(formOriginalStatus.value);
  const willClose = isEdit && CLOSED_STATES.includes(formStatus.value);

  if (!wasClosed && willClose) {
    const ok = confirm(
      `Tutup gelombang "${formName.value}"?\n\n` +
        'Akun siswa, ketua, dan DUDI gelombang ini dinonaktifkan.\n' +
        'Data absensi, jurnal, nilai, dokumen, dan surat tetap tersimpan.\n\n' +
        'Bisa dibuka kembali — akun ikut dipulihkan.'
    );
    if (!ok) return;
  } else if (wasClosed && !willClose) {
    const ok = confirm(`Buka kembali gelombang "${formName.value}"? Akun yang dinonaktifkan akan dipulihkan.`);
    if (!ok) return;
  }

  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    if (editId.value) {
      const res = await cohortService.update(editId.value, {
        name: formName.value,
        academicYear: formYear.value || null,
        description: formDesc.value || null,
        status: formStatus.value,
      });
      if (willClose) {
        success.value = `Gelombang ditutup. ${res.deactivatedUsers ?? 0} akun dinonaktifkan.`;
      } else if (wasClosed) {
        success.value = `Gelombang dibuka. ${res.restoredUsers ?? 0} akun dipulihkan.`;
      } else {
        success.value = 'Gelombang diupdate.';
      }
    } else {
      await cohortService.create({ name: formName.value, academicYear: formYear.value || null, description: formDesc.value || null });
      success.value = 'Gelombang dibuat.';
    }
    resetForm();
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

const edit = (c: CohortRecord): void => {
  editId.value = c.id;
  formName.value = c.name;
  formYear.value = c.academicYear ?? '';
  formDesc.value = c.description ?? '';
  formStatus.value = c.status;
  formOriginalStatus.value = c.status;
  showForm.value = true;
};

const resetForm = (): void => {
  editId.value = '';
  formName.value = '';
  formYear.value = '';
  formDesc.value = '';
  formStatus.value = 'DRAFT';
  formOriginalStatus.value = '';
  showForm.value = false;
};

const openCreate = (): void => {
  resetForm();
  showForm.value = true;
};

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <div class="card">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-800">Gelombang</h2>
        <button class="btn-primary" @click="openCreate">Tambah</button>
      </div>

      <SkeletonTable v-if="loading" :rows="4" :cols="4" />
      <table v-else class="table">
        <thead><tr><th>Nama</th><th>Tahun</th><th>Status</th><th></th></tr></thead>
        <tbody>
          <tr v-for="c in cohorts" :key="c.id">
            <td>{{ c.name }}</td>
            <td>{{ c.academicYear ?? '-' }}</td>
            <td><StatusBadge :status="c.status" /></td>
            <td class="text-right"><button class="text-primary-600 hover:underline" @click="edit(c)">Edit</button></td>
          </tr>
          <tr v-if="cohorts.length === 0"><td colspan="4" class="py-4 text-center text-gray-400">Belum ada gelombang.</td></tr>
        </tbody>
      </table>
    </div>

    <Modal
      :open="showForm"
      :title="editId ? 'Edit Gelombang' : 'Gelombang Baru'"
      size="md"
      :busy="saving"
      @close="showForm = false"
    >
      <div class="space-y-4">
        <div><label class="label">Nama</label><input v-model="formName" class="input" placeholder="Gelombang 1" /></div>
        <div><label class="label">Tahun Akademik</label><input v-model="formYear" class="input" placeholder="2026/2027" /></div>
        <div><label class="label">Deskripsi</label><input v-model="formDesc" class="input" /></div>
        <div v-if="editId">
          <label class="label">Status</label>
          <select v-model="formStatus" class="input">
            <option value="DRAFT">DRAFT</option>
            <option value="OPEN">OPEN (Aktif)</option>
            <option value="CLOSED">CLOSED</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" :disabled="saving" @click="showForm = false">Batal</button>
        <button class="btn-primary" :disabled="saving || !formName" @click="submit">
          <LoadingSpinner v-if="saving" inline />
          {{ saving ? 'Menyimpan…' : editId ? 'Update' : 'Simpan' }}
        </button>
      </template>
    </Modal>
  </div>
</template>

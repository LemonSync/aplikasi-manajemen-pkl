<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { profileService } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';

const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');

const form = ref({
  fatherName: '', fatherJob: '', fatherPhone: '',
  motherName: '', motherJob: '', motherPhone: '',
  guardianName: '', guardianJob: '', guardianPhone: '',
});

const load = async (): Promise<void> => {
  loading.value = true;
  try {
    const data = await profileService.getParentData() as Record<string, string> | null;
    if (data) {
      form.value = {
        fatherName: data.fatherName ?? '', fatherJob: data.fatherJob ?? '', fatherPhone: data.fatherPhone ?? '',
        motherName: data.motherName ?? '', motherJob: data.motherJob ?? '', motherPhone: data.motherPhone ?? '',
        guardianName: data.guardianName ?? '', guardianJob: data.guardianJob ?? '', guardianPhone: data.guardianPhone ?? '',
      };
    }
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const submit = async (): Promise<void> => {
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    await profileService.upsertParentData(form.value);
    success.value = 'Data orang tua berhasil disimpan.';
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
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Data Orang Tua / Wali</h2>
      <div v-if="error" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
      <div v-if="success" class="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>
      <div v-if="loading" class="text-sm text-gray-500">Memuat…</div>

      <div v-else class="space-y-6">
        <div>
          <h3 class="mb-2 font-medium text-gray-700">Ayah</h3>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div><label class="label">Nama</label><input v-model="form.fatherName" class="input" /></div>
            <div><label class="label">Pekerjaan</label><input v-model="form.fatherJob" class="input" /></div>
            <div><label class="label">Telepon</label><input v-model="form.fatherPhone" class="input" /></div>
          </div>
        </div>
        <div>
          <h3 class="mb-2 font-medium text-gray-700">Ibu</h3>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div><label class="label">Nama</label><input v-model="form.motherName" class="input" /></div>
            <div><label class="label">Pekerjaan</label><input v-model="form.motherJob" class="input" /></div>
            <div><label class="label">Telepon</label><input v-model="form.motherPhone" class="input" /></div>
          </div>
        </div>
        <div>
          <h3 class="mb-2 font-medium text-gray-700">Wali (opsional)</h3>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div><label class="label">Nama</label><input v-model="form.guardianName" class="input" /></div>
            <div><label class="label">Pekerjaan</label><input v-model="form.guardianJob" class="input" /></div>
            <div><label class="label">Telepon</label><input v-model="form.guardianPhone" class="input" /></div>
          </div>
        </div>
      </div>

      <button class="btn-primary mt-6" :disabled="saving" @click="submit">
        {{ saving ? 'Menyimpan…' : 'Simpan Data Orang Tua' }}
      </button>
    </div>
  </div>
</template>

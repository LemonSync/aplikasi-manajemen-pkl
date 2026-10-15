<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { profileService } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';

const router = useRouter();
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
  error.value = '';
  success.value = '';
  // Validasi frontend: minimal salah satu nama harus terisi (sinkron dengan backend).
  if (!form.value.fatherName.trim() && !form.value.motherName.trim() && !form.value.guardianName.trim()) {
    error.value = 'Minimal salah satu harus diisi: nama Ayah, Ibu, atau Wali.';
    return;
  }
  saving.value = true;
  try {
    await profileService.upsertParentData(form.value);
    success.value = 'Data orang tua berhasil disimpan. Mengalihkan ke Alur PKL…';
    // Kembali ke halaman alur PKL setelah berhasil menyimpan.
    setTimeout(() => {
      void router.push({ name: 'student-workflow' });
    }, 1200);
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
      <h2 class="mb-1 text-lg font-semibold text-gray-800">Data Orang Tua / Wali</h2>
      <p class="mb-4 text-sm text-gray-500">
        Minimal salah satu harus diisi: nama <strong>Ayah</strong>, <strong>Ibu</strong>, atau <strong>Wali</strong>.
      </p>
      <div v-if="error" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
      <div v-if="success" class="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>
      <div v-if="loading" class="loading" />

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

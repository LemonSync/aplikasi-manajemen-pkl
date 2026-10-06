<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { phaseScheduleService, type PhaseScheduleRecord } from '@/services/api.service';
import { useCohortStore } from '@/stores/cohort.store';
import { extractErrorMessage } from '@/services/http';

const cohortStore = useCohortStore();
const activeCohortName = computed(() => cohortStore.activeCohort?.name ?? '-');
const schedules = ref<PhaseScheduleRecord[]>([]);
const currentPhase = ref<string | null>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');

const PHASES = [
  { value: 'PRA_PKL', label: 'Pra-Pendaftaran PKL' },
  { value: 'NON_PKL', label: 'Pendaftaran Ulang PKL' },
  { value: 'PKL_AKTIF', label: 'Masa PKL' },
  { value: 'PKL_SELESAI', label: 'Pasca-PKL' },
];

// bentuk editable: date input butuh YYYY-MM-DD
const form = ref<Record<string, { start: string; end: string }>>({});

const loadSchedule = async (): Promise<void> => {
  if (!cohortStore.activeCohortId) return;
  loading.value = true;
  error.value = '';
  try {
    const ov = await phaseScheduleService.overview(cohortStore.activeCohortId);
    schedules.value = ov.schedules;
    currentPhase.value = ov.currentPhase;
    const next: Record<string, { start: string; end: string }> = {};
    for (const p of PHASES) {
      const found = ov.schedules.find((s) => s.phase === p.value);
      next[p.value] = {
        start: found?.startDate ? found.startDate.slice(0, 10) : '',
        end: found?.endDate ? found.endDate.slice(0, 10) : '',
      };
    }
    form.value = next;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const save = async (): Promise<void> => {
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    const items = PHASES.filter((p) => form.value[p.value].start || form.value[p.value].end).map((p) => ({
      phase: p.value,
      startDate: form.value[p.value].start ? new Date(form.value[p.value].start).toISOString() : null,
      endDate: form.value[p.value].end ? new Date(form.value[p.value].end).toISOString() : null,
    }));
    await phaseScheduleService.replace(cohortStore.activeCohortId, items);
    success.value = 'Jadwal fase berhasil disimpan.';
    await loadSchedule();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

onMounted(async () => {
  try {
    await cohortStore.ensureLoaded();
    await loadSchedule();
  } catch (e) {
    error.value = extractErrorMessage(e);
    loading.value = false;
  }
});

watch(
  () => cohortStore.activeCohortId,
  () => void loadSchedule()
);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <div class="card">
      <h2 class="mb-2 text-lg font-semibold text-gray-800">Jadwal Fase PKL</h2>

      <div class="mb-4">
        <span class="label">Gelombang</span>
        <p class="text-sm font-medium text-gray-700">{{ activeCohortName }}</p>
      </div>

      <div v-if="currentPhase" class="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
        Fase aktif saat ini:
        <strong>{{ PHASES.find((p) => p.value === currentPhase)?.label ?? currentPhase }}</strong>
      </div>

      <div v-if="loading" class="loading" />
      <table v-else class="table">
        <thead>
          <tr>
            <th>Fase</th>
            <th>Mulai</th>
            <th>Selesai</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in PHASES" :key="p.value">
            <td class="font-medium text-gray-700">{{ p.label }}</td>
            <td><input v-model="form[p.value].start" type="date" class="input" /></td>
            <td><input v-model="form[p.value].end" type="date" class="input" /></td>
          </tr>
        </tbody>
      </table>

      <button class="btn-primary mt-4" :disabled="saving || loading" @click="save">
        {{ saving ? 'Menyimpan...' : 'Simpan Jadwal Fase' }}
      </button>
    </div>
  </div>
</template>
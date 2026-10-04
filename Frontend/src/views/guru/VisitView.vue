<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { groupService, visitService, type VisitRecord } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';

interface SimpleGroup {
  id: string;
  name: string;
}

const groups = ref<SimpleGroup[]>([]);
const visits = ref<VisitRecord[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');

const form = ref({ groupId: '', scheduledAt: '', note: '' });

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    groups.value = (await groupService.listSupervised()) as SimpleGroup[];
    visits.value = await visitService.listMine();
    if (groups.value.length > 0 && !form.value.groupId) {
      form.value.groupId = groups.value[0].id;
    }
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const create = async (): Promise<void> => {
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    await visitService.create({
      groupId: form.value.groupId || null,
      scheduledAt: new Date(form.value.scheduledAt).toISOString(),
      note: form.value.note || null,
    });
    success.value = 'Jadwal kunjungan dibuat.';
    form.value.note = '';
    form.value.scheduledAt = '';
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

const complete = async (id: string): Promise<void> => {
  try {
    const updated = await visitService.complete(id, 'Kunjungan selesai.');
    const idx = visits.value.findIndex((v) => v.id === id);
    if (idx >= 0) visits.value[idx] = updated;
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Jadwalkan Kunjungan</h2>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label class="label">Kelompok</label>
          <select v-model="form.groupId" class="input">
            <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
        </div>
        <div>
          <label class="label">Waktu</label>
          <input v-model="form.scheduledAt" type="datetime-local" class="input" />
        </div>
        <div>
          <label class="label">Catatan</label>
          <input v-model="form.note" class="input" placeholder="Agenda kunjungan" />
        </div>
      </div>
      <button class="btn-primary mt-3" :disabled="saving || !form.groupId || !form.scheduledAt" @click="create">
        {{ saving ? 'Menyimpan…' : 'Buat Jadwal' }}
      </button>
    </div>

    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Jadwal Kunjungan</h2>
      <div v-if="loading" class="text-sm text-gray-500">Memuat…</div>
      <div v-else class="space-y-3">
        <div v-for="v in visits" :key="v.id" class="rounded-lg border border-gray-200 p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-semibold text-gray-800">{{ v.group?.name ?? 'Kelompok' }}</p>
              <p class="text-xs text-gray-500">
                Dijadwalkan: {{ new Date(v.scheduledAt).toLocaleString('id-ID') }}
              </p>
            </div>
            <span
              class="badge"
              :class="v.visitedAt ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'"
            >
              {{ v.visitedAt ? 'Selesai' : 'Terjadwal' }}
            </span>
          </div>
          <p v-if="v.note" class="mt-1 text-sm text-gray-600">{{ v.note }}</p>
          <p v-if="v.visitedAt" class="mt-1 text-xs text-gray-400">
            Selesai: {{ new Date(v.visitedAt).toLocaleString('id-ID') }}
          </p>
          <button v-if="!v.visitedAt" class="mt-2 text-xs text-primary-600 hover:underline" @click="complete(v.id)">
            Tandai selesai
          </button>
        </div>
        <p v-if="visits.length === 0" class="py-4 text-center text-gray-400">Belum ada jadwal kunjungan.</p>
      </div>
    </div>
  </div>
</template>
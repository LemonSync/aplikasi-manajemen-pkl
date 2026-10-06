<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { groupService, journalService, type JournalRecord } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';

interface SimpleGroup {
  id: string;
  name: string;
}

const groups = ref<SimpleGroup[]>([]);
const selectedGroup = ref<string>('');
const journals = ref<JournalRecord[]>([]);
const loading = ref(false);
const error = ref('');

const noteFor = ref<string | null>(null);
const noteText = ref('');

const loadGroups = async (): Promise<void> => {
  try {
    const data = (await groupService.listSupervised()) as SimpleGroup[];
    groups.value = data;
    if (data.length > 0) {
      selectedGroup.value = data[0].id;
      await loadJournals();
    }
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

const loadJournals = async (): Promise<void> => {
  if (!selectedGroup.value) return;
  loading.value = true;
  error.value = '';
  try {
    const { items } = await journalService.list({ groupId: selectedGroup.value });
    journals.value = items;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const saveNote = async (id: string): Promise<void> => {
  if (!noteText.value.trim()) return;
  try {
    const updated = await journalService.addSupervisorNote(id, noteText.value);
    const idx = journals.value.findIndex((j) => j.id === id);
    if (idx >= 0) journals.value[idx] = updated;
    noteFor.value = null;
    noteText.value = '';
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

onMounted(loadGroups);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>

    <div class="card">
      <div class="mb-4 flex items-center gap-3">
        <h2 class="text-lg font-semibold text-gray-800">Monitoring Jurnal</h2>
        <select v-model="selectedGroup" class="input max-w-xs" @change="loadJournals">
          <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
        </select>
      </div>

      <div v-if="loading" class="loading" />
      <div v-else class="space-y-3">
        <div v-for="j in journals" :key="j.id" class="rounded-lg border border-gray-200 p-4">
          <div class="mb-1 flex items-center justify-between">
            <span class="text-sm font-semibold text-gray-800">
              {{ j.user?.studentProfile?.fullName ?? j.user?.username }} · {{ new Date(j.date).toLocaleDateString('id-ID') }}
            </span>
          </div>
          <p class="text-sm text-gray-700">{{ j.activity }}</p>
          <p v-if="j.result" class="mt-1 text-xs text-gray-500">Hasil: {{ j.result }}</p>
          <p v-if="j.obstacles" class="mt-1 text-xs text-gray-500">Kendala: {{ j.obstacles }}</p>
          <p v-if="j.supervisorNote" class="mt-2 rounded bg-primary-50 px-2 py-1 text-xs text-primary-700">
            Catatan Anda: {{ j.supervisorNote }}
          </p>

          <div v-if="noteFor === j.id" class="mt-2 flex gap-2">
            <input v-model="noteText" class="input" placeholder="Catatan untuk siswa…" />
            <button class="btn-secondary" @click="saveNote(j.id)">Simpan</button>
          </div>
          <button v-else class="mt-2 text-xs text-primary-600 hover:underline" @click="noteFor = j.id; noteText = ''">
            {{ j.supervisorNote ? 'Ubah catatan' : 'Beri catatan' }}
          </button>
        </div>
        <p v-if="journals.length === 0" class="py-4 text-center text-gray-400">Belum ada jurnal.</p>
      </div>
    </div>
  </div>
</template>
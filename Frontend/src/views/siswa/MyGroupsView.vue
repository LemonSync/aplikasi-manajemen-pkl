<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { groupService, phase4Service, type LetterRecord } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';

interface GroupItem {
  id: string;
  name: string;
  code: string;
  status: string;
  company?: { name: string } | null;
  major?: { name: string } | null;
  members?: Array<{ user?: { username: string }; isLeader: boolean }>;
}

const groups = ref<GroupItem[]>([]);
const lettersByGroup = ref<Record<string, LetterRecord[]>>({});
const loading = ref(true);
const error = ref('');
const downloadingId = ref('');

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    groups.value = (await groupService.listMine()) as unknown as GroupItem[];
    await Promise.all(
      groups.value.map(async (g) => {
        try {
          lettersByGroup.value[g.id] = await phase4Service.listLetters({ groupId: g.id });
        } catch {
          lettersByGroup.value[g.id] = [];
        }
      })
    );
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const download = async (letter: LetterRecord): Promise<void> => {
  downloadingId.value = letter.id;
  error.value = '';
  try {
    await phase4Service.downloadLetter(letter);
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    downloadingId.value = '';
  }
};

onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <div v-if="loading" class="loading" />
    <div v-else-if="error" class="card text-sm text-red-600">{{ error }}</div>
    <div v-else-if="groups.length === 0" class="card text-sm text-gray-500">
      Anda belum tergabung dalam kelompok PKL mana pun.
    </div>

    <div v-for="g in groups" :key="g.id" class="card">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-800">{{ g.name }}</h2>
        <span class="badge bg-primary-100 text-primary-700">{{ g.code }}</span>
      </div>
      <dl class="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div><dt class="text-gray-500">Perusahaan</dt><dd class="font-medium">{{ g.company?.name ?? '-' }}</dd></div>
        <div><dt class="text-gray-500">Jurusan</dt><dd class="font-medium">{{ g.major?.name ?? '-' }}</dd></div>
        <div><dt class="text-gray-500">Status</dt><dd class="font-medium">{{ g.status }}</dd></div>
      </dl>

      <div class="mt-4 border-t border-gray-100 pt-3">
        <h3 class="mb-2 text-sm font-medium text-gray-700">Surat Kelompok</h3>
        <div v-if="(lettersByGroup[g.id] ?? []).length === 0" class="text-xs text-gray-400">
          Belum ada surat terbit untuk kelompok ini.
        </div>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="text-left text-gray-500">
              <th>Tanggal</th>
              <th>Jenis</th>
              <th>Nomor</th>
              <th class="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in lettersByGroup[g.id]" :key="l.id" class="border-t">
              <td>{{ new Date(l.createdAt).toLocaleDateString('id-ID') }}</td>
              <td>{{ l.type.replace(/_/g, ' ') }}</td>
              <td class="font-mono">{{ l.number ?? '-' }}</td>
              <td class="text-right">
                <button
                  class="text-primary-600 hover:underline disabled:opacity-50"
                  :disabled="downloadingId === l.id"
                  @click="download(l)"
                >
                  {{ downloadingId === l.id ? 'Mengunduh…' : 'Unduh PDF' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
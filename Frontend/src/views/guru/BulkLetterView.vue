<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  phase4Service,
  userManageService,
  type BulkLetterResult,
  type LetterRecord,
  type UserRecord,
} from '@/services/api.service';
import { useAuthStore } from '@/stores/auth.store';
import { extractErrorMessage } from '@/services/http';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';
import StatusBadge from '@/components/StatusBadge.vue';

type LetterType = 'SURAT_PENGANTAR' | 'SURAT_MONITORING' | 'SURAT_PENJEMPUTAN';

const TYPE_OPTIONS: Array<{ value: LetterType; label: string }> = [
  { value: 'SURAT_PENGANTAR', label: 'Surat Pengantar' },
  { value: 'SURAT_MONITORING', label: 'Surat Monitoring' },
  { value: 'SURAT_PENJEMPUTAN', label: 'Surat Penjemputan' },
];

const auth = useAuthStore();

/** Guru menerbitkan atas nama sendiri; admin/super admin memilih guru pembimbing. */
const canPickSupervisor = computed(() => auth.hasRole('ADMIN', 'SUPER_ADMIN'));

const form = ref<{ type: LetterType; number: string; subject: string; supervisorId: string }>({
  type: 'SURAT_PENGANTAR',
  number: '',
  subject: '',
  supervisorId: '',
});
const saving = ref(false);
const result = ref<BulkLetterResult | null>(null);
const error = ref('');
const success = ref('');

const teachers = ref<UserRecord[]>([]);
const teachersLoading = ref(false);

// Daftar surat terbit
const letters = ref<LetterRecord[]>([]);
const lettersLoading = ref(false);
const typeFilter = ref('');

const loadTeachers = async (): Promise<void> => {
  if (!canPickSupervisor.value) return;
  teachersLoading.value = true;
  try {
    const res = await userManageService.list({ role: 'GURU_PEMBIMBING', perPage: 100 });
    teachers.value = res.items;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    teachersLoading.value = false;
  }
};

const loadLetters = async (): Promise<void> => {
  lettersLoading.value = true;
  try {
    letters.value = await phase4Service.listLetters(
      typeFilter.value ? { type: typeFilter.value } : undefined
    );
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    lettersLoading.value = false;
  }
};

const generate = async (): Promise<void> => {
  saving.value = true;
  error.value = '';
  success.value = '';
  result.value = null;
  try {
    const payload: {
      type: LetterType;
      number?: string | null;
      subject?: string | null;
      supervisorId?: string;
    } = {
      type: form.value.type,
      number: form.value.number.trim() || null,
      subject: form.value.subject.trim() || null,
    };
    if (canPickSupervisor.value) payload.supervisorId = form.value.supervisorId;

    result.value = await phase4Service.generateBulkLetter(payload);
    success.value = 'Surat berhasil digenerate.';
    form.value.number = '';
    form.value.subject = '';
    await loadLetters();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

const downloadLetter = async (letter: LetterRecord): Promise<void> => {
  error.value = '';
  try {
    await phase4Service.downloadLetter(letter);
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

// Guru menerbitkan atas nama sendiri (tanpa supervisorId); admin wajib memilih guru.
const canGenerate = computed(
  () => !saving.value && (!canPickSupervisor.value || form.value.supervisorId !== '')
);

const fmtDateTime = (v: string): string => new Date(v).toLocaleString('id-ID');

onMounted(() => {
  void loadTeachers();
  void loadLetters();
});
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <!-- Generate surat bulk -->
    <div class="card">
      <h2 class="mb-1 text-lg font-semibold text-gray-800">Generate Surat</h2>
      <p class="mb-4 text-sm text-gray-500">
        Satu kali generate berisi daftar seluruh siswa bimbingan guru terkait (beserta tempat PKL-nya).
      </p>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label class="label">Jenis Surat</label>
          <select v-model="form.type" class="input">
            <option v-for="t in TYPE_OPTIONS" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>
        </div>
        <div>
          <label class="label">Nomor Surat</label>
          <input v-model="form.number" class="input" placeholder="Opsional" />
        </div>
        <div>
          <label class="label">Perihal / Subjek</label>
          <input v-model="form.subject" class="input" placeholder="Opsional (default mengikuti jenis surat)" />
        </div>
        <div v-if="canPickSupervisor" class="sm:col-span-3">
          <label class="label">Guru Pembimbing</label>
          <select v-model="form.supervisorId" class="input" :disabled="teachersLoading">
            <option value="">-- Pilih guru pembimbing --</option>
            <option v-for="t in teachers" :key="t.id" :value="t.id">
              {{ t.teacherProfile?.fullName ?? t.username }}
            </option>
          </select>
          <p class="mt-1 text-xs text-gray-400">
            Surat akan memuat seluruh siswa bimbingan guru yang dipilih.
          </p>
        </div>
      </div>

      <button class="btn-primary mt-4" :disabled="!canGenerate" @click="generate">
        <LoadingSpinner v-if="saving" inline />
        {{ saving ? 'Menggenerate…' : 'Generate Surat' }}
      </button>

      <!-- Hasil generate -->
      <div v-if="result" class="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
        <p class="text-sm font-semibold text-emerald-800">Surat berhasil terbit</p>
        <ul class="mt-1 list-inside list-disc text-sm text-emerald-700">
          <li>Jumlah siswa: <b>{{ result.studentCount }}</b></li>
          <li>Notifikasi terkirim: <b>{{ result.notified }}</b></li>
          <li>Penanda tangan: {{ result.signerName }}</li>
        </ul>
      </div>
    </div>

    <!-- Daftar surat terbit -->
    <div class="card">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-gray-800">Surat Terbit</h2>
          <p class="text-sm text-gray-500">Hasil generate surat pengantar, monitoring, dan penjemputan.</p>
        </div>
        <div class="flex items-center gap-2">
          <select v-model="typeFilter" class="input w-auto" @change="loadLetters">
            <option value="">Semua Jenis</option>
            <option v-for="t in TYPE_OPTIONS" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>
          <button class="btn-secondary" :disabled="lettersLoading" @click="loadLetters">Muat Ulang</button>
        </div>
      </div>

      <SkeletonTable v-if="lettersLoading" :rows="5" :cols="8" />
      <table v-else class="table">
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Jenis</th>
            <th>Nomor</th>
            <th>Perihal</th>
            <th>Penanda Tangan</th>
            <th>Pembimbing</th>
            <th>Jumlah Siswa</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in letters" :key="l.id">
            <td>{{ fmtDateTime(l.createdAt) }}</td>
            <td><StatusBadge :status="l.type" /></td>
            <td class="font-mono">{{ l.number ?? '-' }}</td>
            <td>{{ l.subject ?? '-' }}</td>
            <td>{{ l.signerName }}</td>
            <td>{{ l.supervisorName ?? '-' }}</td>
            <td>{{ l.studentCount }}</td>
            <td class="text-right">
              <button class="text-sm text-primary-600 hover:underline" @click="downloadLetter(l)">
                Unduh
              </button>
            </td>
          </tr>
          <tr v-if="letters.length === 0">
            <td colspan="8" class="py-4 text-center text-gray-400">Belum ada surat terbit.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

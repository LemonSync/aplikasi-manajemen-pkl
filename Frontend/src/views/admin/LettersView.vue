<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { groupService, phase4Service, type LetterRecord } from '@/services/api.service';
import { useCohortStore } from '@/stores/cohort.store';
import { extractErrorMessage } from '@/services/http';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';
import StatusBadge from '@/components/StatusBadge.vue';

interface GroupOption {
  id: string;
  name: string;
  code?: string;
}

interface GroupDetail {
  id: string;
  supervisors?: Array<{
    userId: string;
    user?: { username: string; teacherProfile?: { fullName?: string } | null };
  }>;
  members?: Array<{
    userId: string;
    isLeader?: boolean;
    user?: { username: string; studentProfile?: { fullName?: string; nisn?: string } | null };
  }>;
}

const cohortStore = useCohortStore();
const groups = ref<GroupOption[]>([]);
const loading = ref(true);
const saving = ref('');
const error = ref('');
const success = ref('');

// --- Pengantar & Penugasan ---
const introGroupId = ref('');
const introDetail = ref<GroupDetail | null>(null);
const introLoading = ref(false);
const letterNumber = ref('');
const assignmentSupervisorId = ref('');

// --- Penarikan ---
const withdrawGroupId = ref('');
const withdrawMembers = ref<NonNullable<GroupDetail['members']>>([]);
const withdrawSelectedIds = ref<string[]>([]);
const withdrawLoading = ref(false);
const withdrawNumber = ref('');

// --- Surat Terbit ---
const letters = ref<LetterRecord[]>([]);
const lettersLoading = ref(false);
const letterFilter = ref('');

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    await cohortStore.ensureLoaded();
    const g = await groupService.list(cohortStore.activeCohortId ? { cohortId: cohortStore.activeCohortId } : {});
    groups.value = g.items as unknown as GroupOption[];
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const loadLetters = async (): Promise<void> => {
  lettersLoading.value = true;
  try {
    letters.value = await phase4Service.listLetters(letterFilter.value ? { type: letterFilter.value } : undefined);
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    lettersLoading.value = false;
  }
};

// --- Pengantar & Penugasan ---
watch(introGroupId, async (id) => {
  introDetail.value = null;
  assignmentSupervisorId.value = '';
  if (!id) return;
  introLoading.value = true;
  try {
    introDetail.value = (await groupService.getById(id)) as unknown as GroupDetail;
    assignmentSupervisorId.value = introDetail.value?.supervisors?.[0]?.userId ?? '';
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    introLoading.value = false;
  }
});

const generateIntroAssignment = async (kind: 'PENGANTAR' | 'PENUGASAN'): Promise<void> => {
  if (!introGroupId.value) return;
  saving.value = kind;
  error.value = '';
  success.value = '';
  try {
    if (kind === 'PENGANTAR') {
      await phase4Service.generateIntroductionLetter({
        groupId: introGroupId.value,
        number: letterNumber.value || null,
      });
      success.value = 'Surat Pengantar PKL berhasil digenerate.';
    } else {
      if (!assignmentSupervisorId.value) {
        error.value = 'Tetapkan guru pembimbing pada detail kelompok terlebih dahulu untuk Surat Penugasan.';
        return;
      }
      await phase4Service.generateAssignmentLetter({
        groupId: introGroupId.value,
        supervisorId: assignmentSupervisorId.value,
        number: letterNumber.value || null,
      });
      success.value = 'Surat Penugasan PKL berhasil digenerate.';
    }
    letterNumber.value = '';
    await loadLetters();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = '';
  }
};

// --- Penarikan ---
watch(withdrawGroupId, async (id) => {
  withdrawMembers.value = [];
  withdrawSelectedIds.value = [];
  if (!id) return;
  withdrawLoading.value = true;
  try {
    const detail = (await groupService.getById(id)) as unknown as GroupDetail;
    withdrawMembers.value = detail.members ?? [];
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    withdrawLoading.value = false;
  }
});

const toggleMember = (userId: string, checked: boolean): void => {
  withdrawSelectedIds.value = checked
    ? [...withdrawSelectedIds.value, userId]
    : withdrawSelectedIds.value.filter((id) => id !== userId);
};

const generateWithdrawal = async (): Promise<void> => {
  if (!withdrawGroupId.value || withdrawSelectedIds.value.length === 0) return;
  saving.value = 'PENARIKAN';
  error.value = '';
  success.value = '';
  try {
    await phase4Service.generateWithdrawalLetter({
      groupId: withdrawGroupId.value,
      studentIds: withdrawSelectedIds.value,
      number: withdrawNumber.value || null,
    });
    success.value = `Surat Penarikan untuk ${withdrawSelectedIds.value.length} siswa digenerate.`;
    withdrawSelectedIds.value = [];
    withdrawNumber.value = '';
    await loadLetters();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = '';
  }
};

const downloadLetter = async (letter: LetterRecord): Promise<void> => {
  try {
    await phase4Service.downloadLetter(letter);
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

onMounted(() => {
  void load();
  void loadLetters();
});
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <!-- Generate Surat Pengantar & Penugasan -->
    <div class="card">
      <h2 class="text-lg font-semibold text-gray-800">Surat Pengantar &amp; Penugasan</h2>
      <p class="mb-4 text-sm text-gray-500">
        <b>Pengantar</b> — surat pengantar sekolah agar siswa diterima melapor ke perusahaan tempat PKL.
        <br />
        <b>Penugasan</b> — penugasan resmi guru pembimbing untuk mengawasi kelompok selama PKL.
      </p>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label class="label">Kelompok</label>
          <select v-model="introGroupId" class="input">
            <option value="">-- Pilih --</option>
            <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.code ?? '' }} {{ g.name }}</option>
          </select>
        </div>
        <div>
          <label class="label">Nomor Surat</label>
          <input v-model="letterNumber" class="input" placeholder="Opsional" />
        </div>
        <div v-if="(introDetail?.supervisors?.length ?? 0) > 1">
          <label class="label">Guru Pembimbing (untuk Penugasan)</label>
          <select v-model="assignmentSupervisorId" class="input">
            <option
              v-for="s in introDetail?.supervisors ?? []"
              :key="s.userId"
              :value="s.userId"
            >
              {{ s.user?.teacherProfile?.fullName ?? s.user?.username ?? s.userId }}
            </option>
          </select>
        </div>
      </div>

      <LoadingSpinner v-if="introLoading" label="Memuat detail kelompok…" class="mt-4" />
      <p v-else-if="introGroupId && (introDetail?.supervisors?.length ?? 0) === 0" class="mt-3 text-sm text-amber-600">
        Kelompok ini belum punya guru pembimbing — tetapkan dulu di menu Kelompok untuk bisa membuat Surat Penugasan.
      </p>

      <div class="mt-4 flex flex-wrap gap-2">
        <button
          class="btn-primary"
          :disabled="saving !== '' || !introGroupId"
          @click="generateIntroAssignment('PENGANTAR')"
        >
          <LoadingSpinner v-if="saving === 'PENGANTAR'" inline />
          Generate Pengantar
        </button>
        <button
          class="btn-primary"
          :disabled="saving !== '' || !introGroupId || !assignmentSupervisorId"
          :title="!assignmentSupervisorId ? 'Tetapkan guru pembimbing dahulu' : ''"
          @click="generateIntroAssignment('PENUGASAN')"
        >
          <LoadingSpinner v-if="saving === 'PENUGASAN'" inline />
          Generate Penugasan
        </button>
      </div>
    </div>

    <!-- Generate Surat Penarikan -->
    <div class="card">
      <h2 class="text-lg font-semibold text-gray-800">Surat Penarikan Siswa</h2>
      <p class="mb-4 text-sm text-gray-500">
        Surat resmi penarikan siswa dari perusahaan — dipakai saat PKL selesai atau siswa ditarik lebih awal.
      </p>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label class="label">Kelompok</label>
          <select v-model="withdrawGroupId" class="input">
            <option value="">-- Pilih --</option>
            <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.code ?? '' }} {{ g.name }}</option>
          </select>
        </div>
        <div>
          <label class="label">Nomor Surat</label>
          <input v-model="withdrawNumber" class="input" placeholder="Opsional" />
        </div>
      </div>

      <LoadingSpinner v-if="withdrawLoading" label="Memuat anggota…" class="mt-4" />
      <div v-else-if="withdrawGroupId && withdrawMembers.length > 0" class="mt-4">
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label
            v-for="m in withdrawMembers"
            :key="m.userId"
            class="flex items-center gap-2 border border-gray-200 px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              :checked="withdrawSelectedIds.includes(m.userId)"
              @change="toggleMember(m.userId, ($event.target as HTMLInputElement).checked)"
            />
            <span>
              {{ m.user?.studentProfile?.fullName ?? m.user?.username ?? m.userId }}
              <span v-if="m.isLeader" class="text-amber-600">(Ketua)</span>
            </span>
          </label>
        </div>
      </div>
      <p v-else-if="withdrawGroupId" class="mt-4 text-sm text-gray-500">Kelompok tanpa anggota.</p>

      <button
        class="btn-primary mt-4"
        :disabled="saving !== '' || !withdrawGroupId || withdrawSelectedIds.length === 0"
        @click="generateWithdrawal"
      >
        <LoadingSpinner v-if="saving === 'PENARIKAN'" inline />
        {{ saving === 'PENARIKAN' ? 'Menggenerate…' : `Generate Penarikan (${withdrawSelectedIds.length})` }}
      </button>
    </div>

    <!-- Daftar Surat Terbit -->
    <div class="card">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-gray-800">Surat Terbit</h2>
          <p class="text-sm text-gray-500">Semua surat yang sudah digenerate sistem (Pengantar, Penugasan, Penarikan).</p>
        </div>
        <div class="flex items-center gap-2">
          <select v-model="letterFilter" class="input w-auto" @change="loadLetters">
            <option value="">Semua Jenis</option>
            <option value="PENGANTAR">Pengantar</option>
            <option value="PENUGASAN">Penugasan</option>
            <option value="PENARIKAN">Penarikan</option>
          </select>
          <button class="btn-secondary" :disabled="lettersLoading" @click="loadLetters">Muat Ulang</button>
        </div>
      </div>

      <SkeletonTable v-if="lettersLoading" :rows="5" :cols="6" />
      <table v-else class="table">
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Jenis</th>
            <th>Nomor</th>
            <th>Perihal</th>
            <th>Penanda Tangan</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in letters" :key="l.id">
            <td>{{ new Date(l.createdAt).toLocaleDateString('id-ID') }}</td>
            <td><StatusBadge :status="l.type" /></td>
            <td class="font-mono">{{ l.number ?? '-' }}</td>
            <td>{{ l.subject ?? '-' }}</td>
            <td>{{ l.signerName }}</td>
            <td class="text-right">
              <button class="text-sm text-primary-600 hover:underline" @click="downloadLetter(l)">Unduh</button>
            </td>
          </tr>
          <tr v-if="letters.length === 0">
            <td colspan="6" class="py-4 text-center text-gray-400">Belum ada surat terbit.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

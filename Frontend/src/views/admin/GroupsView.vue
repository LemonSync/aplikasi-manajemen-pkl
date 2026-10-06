<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import {
  groupService,
  masterService,
  registrationService,
  userManageService,
  phase4Service,
  pickActiveCohortId,
  type MasterLookups,
  type Registration,
  type UserRecord,
  type LetterRecord,
} from '@/services/api.service';
import { useCohortStore } from '@/stores/cohort.store';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';

interface MemberInfo {
  userId: string;
  isLeader: boolean;
  user?: {
    id: string;
    username: string;
    studentProfile?: { fullName: string; nisn: string } | null;
  };
}

interface GroupItem {
  id: string;
  name: string;
  code: string;
  status: string;
  company?: { name: string; mentors?: Array<{ userId: string; fullName: string; user?: { username: string } }> } | null;
  major?: { name: string } | null;
  members?: MemberInfo[];
  supervisors?: Array<{ userId: string; isPrimary?: boolean; user?: { username: string; studentProfile?: { fullName: string } | null } }>;
  dudiMentors?: Array<{ dudiUserId: string; isPrimary: boolean; dudi: { username: string } }>;
}

interface TeacherOption {
  id: string;
  username: string;
  fullName: string;
}

const groups = ref<GroupItem[]>([]);
const lookups = ref<MasterLookups | null>(null);
const approvedRegs = ref<Registration[]>([]);
const loading = ref(true);
const creating = ref(false);
const error = ref('');
const success = ref('');

// Filter daftar kelompok: mengikuti konteks global di header (cohortStore).
const cohortStore = useCohortStore();

const form = ref({
  name: '',
  cohortId: '',
  majorId: '',
  registrationId: '',
});

const confirmDelete = ref<GroupItem | null>(null);
const showDetail = ref<GroupItem | null>(null);
const detailData = ref<GroupItem | null>(null);
const credentials = ref<{ students: Array<{ userId: string; username: string; password: string; fullName: string; isLeader: boolean }>; dudi: Array<{ userId: string; username: string; password: string; fullName: string }> } | null>(null);
const loadingDetail = ref(false);
const resetPasswordResult = ref<{ userId: string; password: string } | null>(null);
const dudiAssignments = ref<Array<{ dudiUserId: string; isPrimary: boolean }>>([]);
const savingDudi = ref(false);
const teachers = ref<TeacherOption[]>([]);
const supervisorIds = ref<string[]>([]);
const savingSupervisors = ref(false);

// Surat per kelompok
const groupLetters = ref<LetterRecord[]>([]);
const generatingLetter = ref('');
const letterNumber = ref('');
const assignmentSupervisorId = ref('');
const lettersLoading = ref(false);

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    await cohortStore.ensureLoaded();
    const lk = await masterService.lookups();
    lookups.value = lk;

    const [g, regs, teachersData] = await Promise.all([
      groupService.list(cohortStore.activeCohortId ? { cohortId: cohortStore.activeCohortId } : {}),
      registrationService.list('DISETUJUI'),
      userManageService.list({ role: 'GURU_PEMBIMBING' }),
    ]);
    groups.value = g.items as unknown as GroupItem[];
    approvedRegs.value = regs.items;
    teachers.value = (teachersData.items as UserRecord[]).map((t) => ({
      id: t.id,
      username: t.username,
      fullName: t.teacherProfile?.fullName ?? t.username,
    }));
    if (lk.cohorts.length > 0 && !form.value.cohortId) {
      form.value.cohortId = lk.cohorts.some((c) => c.id === cohortStore.activeCohortId)
        ? cohortStore.activeCohortId
        : pickActiveCohortId(lk.cohorts);
    }
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const onSelectRegistration = (): void => {
  const reg = approvedRegs.value.find((r) => r.id === form.value.registrationId);
  if (reg) {
    form.value.name = reg.groupName;
    form.value.cohortId = reg.cohortId;
    form.value.majorId = reg.majorId ?? '';
  }
};

const create = async (): Promise<void> => {
  creating.value = true;
  error.value = '';
  success.value = '';
  try {
    await groupService.create({
      name: form.value.name,
      cohortId: form.value.cohortId,
      majorId: form.value.majorId || null,
      registrationId: form.value.registrationId || null,
      memberUserIds: [],
    });
    success.value = 'Kelompok berhasil dibentuk. Akun anggota sudah dibuat otomatis.';
    form.value.name = '';
    form.value.registrationId = '';
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    creating.value = false;
  }
};

// --- Detail ---
const openDetail = async (g: GroupItem): Promise<void> => {
  showDetail.value = g;
  loadingDetail.value = true;
  resetPasswordResult.value = null;
  try {
    const [detail, credentialData] = await Promise.all([groupService.getById(g.id), groupService.credentials(g.id)]);
    detailData.value = detail as unknown as GroupItem;
    credentials.value = credentialData;
    dudiAssignments.value = detailData.value.dudiMentors?.map((m) => ({ dudiUserId: m.dudiUserId, isPrimary: m.isPrimary })) ?? [];
    supervisorIds.value = detailData.value.supervisors?.map((s) => s.userId) ?? [];
    assignmentSupervisorId.value = supervisorIds.value[0] ?? '';
    void loadGroupLetters(g.id);
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loadingDetail.value = false;
  }
};

const toggleDudi = (userId: string, checked: boolean): void => {
  dudiAssignments.value = checked
    ? [...dudiAssignments.value, { dudiUserId: userId, isPrimary: dudiAssignments.value.length === 0 }]
    : dudiAssignments.value.filter((item) => item.dudiUserId !== userId);
};
const setPrimaryDudi = (userId: string): void => { dudiAssignments.value = dudiAssignments.value.map((item) => ({ ...item, isPrimary: item.dudiUserId === userId })); };
const saveDudiAssignments = async (): Promise<void> => {
  if (!detailData.value || dudiAssignments.value.length === 0) { error.value = 'Pilih minimal satu DUDI.'; return; }
  savingDudi.value = true;
  try { await groupService.setDudiMentors(detailData.value.id, dudiAssignments.value); success.value = 'Penugasan DUDI berhasil disimpan.'; await openDetail(detailData.value); }
  catch (e) { error.value = extractErrorMessage(e); }
  finally { savingDudi.value = false; }
};

const toggleSupervisor = (userId: string, checked: boolean): void => {
  supervisorIds.value = checked
    ? [...supervisorIds.value, userId]
    : supervisorIds.value.filter((id) => id !== userId);
};
const saveSupervisors = async (): Promise<void> => {
  if (!detailData.value) return;
  if (supervisorIds.value.length === 0) { error.value = 'Pilih minimal satu guru pembimbing.'; return; }
  savingSupervisors.value = true;
  error.value = '';
  success.value = '';
  try {
    await groupService.setSupervisors(detailData.value.id, supervisorIds.value);
    success.value = 'Penugasan guru pembimbing berhasil disimpan.';
    await openDetail(detailData.value);
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    savingSupervisors.value = false;
  }
};

const closeDetail = (): void => {
  showDetail.value = null;
  detailData.value = null;
  credentials.value = null;
  resetPasswordResult.value = null;
  supervisorIds.value = [];
  groupLetters.value = [];
  letterNumber.value = '';
  assignmentSupervisorId.value = '';
};

// --- Surat kelompok ---
const loadGroupLetters = async (groupId: string): Promise<void> => {
  lettersLoading.value = true;
  try {
    groupLetters.value = await phase4Service.listLetters({ groupId });
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    lettersLoading.value = false;
  }
};

const generateLetter = async (kind: 'PENGANTAR' | 'PENUGASAN'): Promise<void> => {
  if (!detailData.value) return;
  generatingLetter.value = kind;
  error.value = '';
  success.value = '';
  try {
    if (kind === 'PENGANTAR') {
      await phase4Service.generateIntroductionLetter({
        groupId: detailData.value.id,
        number: letterNumber.value || null,
      });
      success.value = 'Surat Pengantar PKL berhasil digenerate.';
    } else {
      const supervisorId = assignmentSupervisorId.value || supervisorIds.value[0] || '';
      if (!supervisorId) {
        error.value = 'Tetapkan guru pembimbing terlebih dahulu untuk Surat Penugasan.';
        return;
      }
      await phase4Service.generateAssignmentLetter({
        groupId: detailData.value.id,
        supervisorId,
        number: letterNumber.value || null,
      });
      success.value = 'Surat Penugasan PKL berhasil digenerate.';
    }
    letterNumber.value = '';
    await loadGroupLetters(detailData.value.id);
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    generatingLetter.value = '';
  }
};

const downloadLetter = async (letter: LetterRecord): Promise<void> => {
  try {
    await phase4Service.downloadLetter(letter);
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

const resetPassword = async (userId: string): Promise<void> => {
  try {
    const result = await userManageService.resetPassword(userId, { generateRandom: true });
    resetPasswordResult.value = { userId, password: result.plainPassword };
    success.value = 'Password berhasil direset.';
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

// --- Delete ---
const askDelete = (g: GroupItem): void => { confirmDelete.value = g; };
const cancelDelete = (): void => { confirmDelete.value = null; };
const doDelete = async (): Promise<void> => {
  if (!confirmDelete.value) return;
  creating.value = true;
  error.value = '';
  success.value = '';
  try {
    await groupService.remove(confirmDelete.value.id);
    success.value = `Kelompok "${confirmDelete.value.name}" dan akun semua anggota berhasil dihapus.`;
    confirmDelete.value = null;
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    creating.value = false;
  }
};

onMounted(load);

watch(
  () => cohortStore.activeCohortId,
  () => void load()
);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Bentuk Kelompok dari Pendaftaran</h2>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label class="label">Pilih Pendaftaran (Disetujui)</label>
          <select v-model="form.registrationId" class="input" @change="onSelectRegistration">
            <option value="">-- Pilih --</option>
            <option v-for="r in approvedRegs" :key="r.id" :value="r.id">
              {{ r.code }} -- {{ r.groupName }} ({{ r.companyName }})
            </option>
          </select>
        </div>
        <div>
          <label class="label">Nama Kelompok</label>
          <input v-model="form.name" class="input" placeholder="Nama kelompok resmi" />
        </div>
        <div>
          <label class="label">Gelombang</label>
          <select v-model="form.cohortId" class="input">
            <option v-for="c in lookups?.cohorts ?? []" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div>
          <label class="label">Jurusan</label>
          <select v-model="form.majorId" class="input">
            <option value="">-- Pilih --</option>
            <option v-for="m in lookups?.majors ?? []" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
        </div>
      </div>
      <button class="btn-primary mt-4" :disabled="creating || !form.name || !form.registrationId" @click="create">
        <LoadingSpinner v-if="creating" inline />
        {{ creating ? 'Menyimpan…' : 'Bentuk Kelompok' }}
      </button>
    </div>

    <div class="card">
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 class="text-lg font-semibold text-gray-800">Daftar Kelompok</h2>
      </div>
      <div v-if="loading" class="loading" />
      <table v-else class="table">
        <thead>
          <tr>
            <th>Kode</th>
            <th>Nama</th>
            <th>Perusahaan</th>
            <th>Anggota</th>
            <th>Status</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in groups" :key="g.id">
            <td class="font-medium">{{ g.code }}</td>
            <td>{{ g.name }}</td>
            <td>{{ g.company?.name ?? '-' }}</td>
            <td>{{ g.members?.length ?? 0 }} orang</td>
            <td>{{ g.status }}</td>
            <td class="text-right">
              <button class="text-sm text-primary-600 hover:underline" @click="openDetail(g)">Detail</button>
              <span class="mx-1 text-gray-300">|</span>
              <button class="text-sm text-red-600 hover:underline" @click="askDelete(g)">Hapus</button>
            </td>
          </tr>
          <tr v-if="groups.length === 0">
            <td colspan="6" class="py-4 text-center text-gray-400">Belum ada kelompok.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal Detail Kelompok -->
    <Modal
      :open="!!showDetail"
      :title="`Detail Kelompok: ${showDetail?.name ?? ''}`"
      size="xl"
      :busy="savingSupervisors || savingDudi || generatingLetter !== ''"
      @close="closeDetail"
    >
        <div v-if="loadingDetail" class="loading" />

        <template v-else-if="detailData">
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div><span class="text-gray-500">Kode:</span> {{ detailData.code }}</div>
            <div><span class="text-gray-500">Status:</span> {{ detailData.status }}</div>
            <div><span class="text-gray-500">Perusahaan:</span> {{ detailData.company?.name ?? '-' }}</div>
            <div><span class="text-gray-500">Jurusan:</span> {{ detailData.major?.name ?? '-' }}</div>
          </div>

          <!-- Guru Pembimbing -->
          <div class="border-t pt-3">
            <h4 class="mb-2 font-medium text-gray-700">Guru Pembimbing</h4>
            <div v-if="teachers.length === 0" class="text-sm text-amber-600">
              Belum ada akun Guru Pembimbing.
            </div>
            <div v-else class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label
                v-for="t in teachers"
                :key="t.id"
                class="flex items-center gap-2 border border-gray-200 px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  :checked="supervisorIds.includes(t.id)"
                  @change="toggleSupervisor(t.id, ($event.target as HTMLInputElement).checked)"
                />
                <span>{{ t.fullName }} <span class="font-mono text-gray-500">({{ t.username }})</span></span>
              </label>
            </div>
            <button class="btn-primary mt-2" :disabled="savingSupervisors || supervisorIds.length === 0" @click="saveSupervisors">
              <LoadingSpinner v-if="savingSupervisors" inline />
              {{ savingSupervisors ? 'Menyimpan…' : 'Simpan Guru Pembimbing' }}
            </button>
          </div>

          <!-- Surat PKL -->
          <div class="border-t pt-3">
            <h4 class="mb-2 font-medium text-gray-700">Surat PKL</h4>
            <div class="flex flex-wrap items-end gap-3">
              <div class="w-48">
                <label class="label">Nomor Surat</label>
                <input v-model="letterNumber" class="input" placeholder="Opsional" />
              </div>
              <div v-if="supervisorIds.length > 1" class="w-56">
                <label class="label">Penugasan Surat</label>
                <select v-model="assignmentSupervisorId" class="input">
                  <option v-for="t in teachers.filter((x) => supervisorIds.includes(x.id))" :key="t.id" :value="t.id">
                    {{ t.fullName }}
                  </option>
                </select>
              </div>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                class="btn-primary"
                :disabled="generatingLetter !== ''"
                @click="generateLetter('PENGANTAR')"
              >
                <LoadingSpinner v-if="generatingLetter === 'PENGANTAR'" inline />
                Pengantar
              </button>
              <button
                class="btn-primary"
                :disabled="generatingLetter !== '' || supervisorIds.length === 0"
                :title="supervisorIds.length === 0 ? 'Tetapkan guru pembimbing dahulu' : ''"
                @click="generateLetter('PENUGASAN')"
              >
                <LoadingSpinner v-if="generatingLetter === 'PENUGASAN'" inline />
                Penugasan
              </button>
            </div>

            <div class="mt-4">
              <div class="mb-2 flex items-center justify-between">
                <p class="text-sm font-medium text-gray-700">Surat Terbit</p>
                <button class="text-sm text-primary-600 hover:underline" @click="loadGroupLetters(detailData.id)">Muat Ulang</button>
              </div>
              <div v-if="lettersLoading" class="loading" />
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
                  <tr v-for="l in groupLetters" :key="l.id" class="border-t">
                    <td>{{ new Date(l.createdAt).toLocaleDateString('id-ID') }}</td>
                    <td>{{ l.type }}</td>
                    <td class="font-mono">{{ l.number ?? '-' }}</td>
                    <td class="text-right">
                      <button class="text-primary-600 hover:underline" @click="downloadLetter(l)">Unduh</button>
                    </td>
                  </tr>
                  <tr v-if="groupLetters.length === 0">
                    <td colspan="4" class="py-3 text-center text-gray-400">Belum ada surat.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Info DUDI -->
          <div v-if="detailData.company?.mentors && detailData.company.mentors.length > 0" class="border-t pt-3">
            <h4 class="mb-1 font-medium text-gray-700">Penugasan DUDI</h4>
            <div v-for="mentor in detailData.company.mentors" :key="mentor.userId" class="mb-2 flex items-center gap-3 text-sm">
              <input type="checkbox" :checked="dudiAssignments.some(x => x.dudiUserId === mentor.userId)" @change="toggleDudi(mentor.userId, ($event.target as HTMLInputElement).checked)" />
              <span>{{ mentor.fullName }} <span class="font-mono text-gray-500">({{ mentor.user?.username ?? '-' }})</span></span>
              <label v-if="dudiAssignments.some(x => x.dudiUserId === mentor.userId)" class="ml-auto"><input type="radio" name="primaryDudi" :checked="dudiAssignments.find(x => x.dudiUserId === mentor.userId)?.isPrimary" @change="setPrimaryDudi(mentor.userId)" /> Utama</label>
            </div>
            <button class="btn-primary mt-2" :disabled="savingDudi" @click="saveDudiAssignments">
              <LoadingSpinner v-if="savingDudi" inline />
              {{ savingDudi ? 'Menyimpan…' : 'Simpan Penugasan DUDI' }}
            </button>
          </div>
          <div v-else class="border-t pt-3">
            <p class="text-sm text-amber-600">Akun DUDI belum ditautkan ke perusahaan ini.</p>
          </div>

          <div class="border-t pt-3">
            <h4 class="mb-2 font-medium text-gray-700">Anggota ({{ detailData.members?.length ?? 0 }})</h4>
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-gray-500">
                  <th>Role</th>
                  <th>Nama</th>
                  <th>Username</th>
                  <th>Password</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="m in detailData.members ?? []" :key="m.userId" class="border-t">
                  <td>
                    <span v-if="m.isLeader" class="badge bg-amber-100 text-amber-700">Ketua</span>
                    <span v-else class="badge bg-gray-100 text-gray-600">Anggota</span>
                  </td>
                  <td>{{ m.user?.studentProfile?.fullName ?? m.user?.username ?? '-' }}</td>
                  <td class="font-mono">{{ m.user?.username ?? '-' }}</td>
                  <td>
                    <template v-if="resetPasswordResult?.userId === m.userId">
                      <span class="font-mono text-sm font-bold text-emerald-600">{{ resetPasswordResult.password }}</span>
                    </template>
                    <template v-else>{{ credentials?.students.find(x => x.userId === m.userId)?.password ?? '-' }}</template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
    </Modal>

    <!-- Modal Hapus Kelompok -->
    <Modal
      :open="!!confirmDelete"
      title="Hapus Kelompok"
      size="sm"
      :busy="creating"
      @close="cancelDelete"
    >
      <p class="text-sm text-gray-600">
        Hapus <strong>{{ confirmDelete?.name }}</strong> ({{ confirmDelete?.code }})?
        <br /><br />
        <span class="font-medium text-red-600">Semua akun anggota juga dihapus. Tidak dapat dibatalkan.</span>
      </p>
      <template #footer>
        <button class="btn-secondary" :disabled="creating" @click="cancelDelete">Batal</button>
        <button class="btn-danger" :disabled="creating" @click="doDelete">
          <LoadingSpinner v-if="creating" inline />
          {{ creating ? 'Menghapus…' : 'Hapus Semua' }}
        </button>
      </template>
    </Modal>
  </div>
</template>

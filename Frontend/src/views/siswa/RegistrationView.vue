<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  masterService,
  registrationService,
  downloadFile,
  studentRegistryService,
  type MasterLookups,
  type Registration,
  type StudentRegistryRecord,
} from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import StatusBadge from '@/components/StatusBadge.vue';
import { useAuthStore } from '@/stores/auth.store';

const auth = useAuthStore();

/** Gelombang sudah ditentukan Admin saat membuat akun ketua → tidak bisa diganti. */
const assignedCohortId = computed(() => auth.user?.cohortId ?? null);
const assignedCohortName = computed(() => {
  const id = assignedCohortId.value;
  if (!id) return '';
  return lookups.value?.cohorts.find((c) => c.id === id)?.name ?? 'Gelombang terdaftar';
});

const lookups = ref<MasterLookups | null>(null);
const existing = ref<Registration | null>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');

const form = ref({
  groupName: '',
  cohortId: '',
  companyName: '',
  companyAddress: '',
  companyIndustry: '',
  companyPhone: '',
  companyCity: '',
});

type MemberStatus = 'idle' | 'checking' | 'found' | 'notfound';
interface MemberRow {
  name: string;
  nisn: string;
  className: string;
  phone: string;
  status: MemberStatus;
}

const memberNames = ref<MemberRow[]>([{ name: '', nisn: '', className: '', phone: '', status: 'idle' }]);
const lookupTimers: Record<number, number> = {};
const pendingLookups = new Set<Promise<void>>();

const makeMember = (): MemberRow => ({ name: '', nisn: '', className: '', phone: '', status: 'idle' });

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    const [lk, reg] = await Promise.all([
      masterService.lookups(),
      registrationService.getMy(),
    ]);
    lookups.value = lk;
    existing.value = reg;
    if (reg) {
      form.value = {
        groupName: reg.groupName,
        cohortId: assignedCohortId.value ?? reg.cohortId,
        companyName: reg.companyName,
        companyAddress: reg.companyAddress,
        companyIndustry: reg.companyIndustry ?? '',
        companyPhone: reg.companyPhone ?? '',
        companyCity: reg.companyCity ?? '',
      };
      // Load nama anggota dari members
      if (reg.members && reg.members.length > 0) {
        memberNames.value = reg.members.map((m) => ({
          name: m.fullName,
          nisn: m.nisn ?? '',
          className: m.className ?? '',
          phone: m.phone ?? '',
          status: m.fullName && m.className ? 'found' : 'idle',
        }));
      }
    } else if (assignedCohortId.value) {
      form.value.cohortId = assignedCohortId.value;
    } else if (lk.cohorts.length > 0) {
      form.value.cohortId = lk.cohorts[0].id;
    }
    if (memberNames.value.length === 0) memberNames.value = [makeMember()];
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const addMember = (): void => { memberNames.value.push(makeMember()); };
const removeMember = (i: number): void => {
  if (memberNames.value.length <= 1) return;
  if (lookupTimers[i]) window.clearTimeout(lookupTimers[i]);
  memberNames.value.splice(i, 1);
};

const hasChecking = computed(() => memberNames.value.some((m) => m.status === 'checking'));

/** Lookup NISN ke Master Siswa → isi nama & kelas otomatis. */
const lookupStudent = async (i: number): Promise<void> => {
  const row = memberNames.value[i];
  if (!row) return;
  const nisn = row.nisn.trim();
  const cohortId = form.value.cohortId;
  row.name = '';
  row.className = '';
  row.status = 'idle';
  if (!/^\d{10}$/.test(nisn) || !cohortId) return;

  row.status = 'checking';
  const task = (async () => {
    try {
      const student = await studentRegistryService.lookup(nisn, cohortId);
      const cur = memberNames.value[i];
      if (!cur || cur.nisn.trim() !== nisn) return; // baris sudah berubah → abaikan hasil lama
      if (student && student.fullName) {
        cur.name = student.fullName;
        cur.className = student.className;
        cur.status = 'found';
      } else {
        cur.status = 'notfound';
        error.value = `NISN ${nisn} tidak ditemukan di Master Siswa gelombang ini.`;
      }
    } catch (e) {
      const cur = memberNames.value[i];
      if (cur && cur.nisn.trim() === nisn) cur.status = 'notfound';
      error.value = extractErrorMessage(e);
    }
  })();
  pendingLookups.add(task);
  try {
    await task;
  } finally {
    pendingLookups.delete(task);
  }
};

/** Dipanggil tiap kali NISN diketik: reset hasil lama + lookup dengan debounce. */
const onNisnInput = (i: number, ev: Event): void => {
  const el = ev.target as HTMLInputElement;
  const raw = el.value.replace(/\D/g, '').slice(0, 10);
  if (el.value !== raw) el.value = raw;

  const row = memberNames.value[i];
  if (!row) return;
  row.nisn = raw;
  if (lookupTimers[i]) window.clearTimeout(lookupTimers[i]);
  row.name = '';
  row.className = '';
  row.status = raw.length === 10 ? 'checking' : 'idle';
  if (row.status !== 'checking') return;
  lookupTimers[i] = window.setTimeout(() => {
    void lookupStudent(i);
  }, 450);
};

/** Validasi semua anggota sebelum kirim; tunggu lookup yang masih berjalan. */
const validateMembers = async (): Promise<string | null> => {
  await Promise.all([...pendingLookups]);
  const rows = memberNames.value.filter((m) => m.nisn.trim() || m.name.trim());
  if (rows.length === 0) return 'Minimal 1 anggota harus diisi.';
  const seen = new Set<string>();
  for (const [idx, m] of rows.entries()) {
    const nisn = m.nisn.trim();
    const label = `Anggota ${idx + 1}`;
    if (!/^\d{10}$/.test(nisn)) return `${label}: NISN harus 10 digit angka.`;
    if (seen.has(nisn)) return `${label}: NISN ${nisn} duplikat dengan anggota lain.`;
    seen.add(nisn);
    if (m.status !== 'found' || !m.name.trim() || !m.className.trim()) {
      return `${label}: nama/kelas belum terisi otomatis dari NISN ${nisn}. Pastikan NISN terdaftar di Master Siswa gelombang ini.`;
    }
  }
  return null;
};

/** Validasi + simpan draft. Return null bila gagal (pesan sudah di-set ke `error`). */
/** Ganti gelombang → lookup ulang semua NISN (data master per gelombang). */
const onCohortChange = (): void => {
  memberNames.value.forEach((row, i) => {
    if (/^\d{10}$/.test(row.nisn.trim())) void lookupStudent(i);
  });
};

const saveDraftNow = async (): Promise<Registration | null> => {
  const invalid = await validateMembers();
  if (invalid) {
    error.value = invalid;
    return null;
  }
  const members = memberNames.value
    .filter((m) => m.nisn.trim() || m.name.trim())
    .map((m, i) => ({
      fullName: m.name.trim(),
      nisn: m.nisn.trim() || null,
      className: m.className.trim() || null,
      phone: m.phone.trim() || null,
      isLeader: i === 0,
    }));
  const payload = {
    ...form.value,
    cohortId: assignedCohortId.value ?? form.value.cohortId,
    companyIndustry: form.value.companyIndustry || null,
    companyContacts: [],
    members,
  };
  return registrationService.saveDraft(payload);
};

const save = async (): Promise<void> => {
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    const saved = await saveDraftNow();
    if (!saved) return;
    existing.value = saved;
    success.value = 'Draft pendaftaran berhasil disimpan.';
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

const submit = async (): Promise<void> => {
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    // Selalu simpan dulu agar data terbaru (termasuk hasil lookup NISN) yang diajukan
    const saved = await saveDraftNow();
    if (!saved) return;
    existing.value = saved;
    await registrationService.submit(saved.id);
    success.value = 'Pendaftaran diajukan. Surat Permohonan akan dibuat setelah disetujui Admin.';
    await auth.fetchMe();
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

const downloadSurat = async (): Promise<void> => {
  if (!existing.value?.document) return;
  try {
    await downloadFile(`/documents/${existing.value.document.id}/download`, `surat-permohonan-${existing.value.code}.pdf`);
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div v-if="loading" class="loading" />

    <template v-else>
      <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
      <div v-if="success" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

      <!-- Sudah submit / disetujui -->
      <div v-if="existing && existing.status !== 'DRAFT'" class="card">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold text-gray-800">Pendaftaran: {{ existing.code }}</h2>
            <p class="text-sm text-gray-500">Status pengajuan kelompok Anda.</p>
          </div>
          <StatusBadge :status="existing.status" />
        </div>
        <div v-if="existing.status === 'DISETUJUI' && existing.document" class="mt-4 rounded-lg bg-emerald-50 p-4">
          <p class="text-sm font-medium text-emerald-800">Pendaftaran disetujui! Surat Permohonan sudah dibuat.</p>
          <p class="mt-1 text-sm text-emerald-700">Download, cetak, dan serahkan ke perusahaan.</p>
          <button class="btn-primary mt-3" @click="downloadSurat">Download Surat Permohonan (PDF)</button>
        </div>
        <div v-else-if="existing.status === 'DIAJUKAN'" class="mt-4 rounded-lg bg-amber-50 p-4">
          <p class="text-sm text-amber-700">Menunggu persetujuan admin...</p>
        </div>
      </div>

      <!-- Form pra-pendaftaran -->
      <form v-else class="space-y-6" @submit.prevent="save">
        <!-- Data Perusahaan -->
        <div class="card">
          <h2 class="mb-4 text-lg font-semibold text-gray-800">Data Perusahaan Tujuan</h2>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label class="label">Nama Kelompok</label>
              <input v-model="form.groupName" class="input" required placeholder="Nama kelompok (wajib sama dengan anggota)" />
            </div>
            <div>
              <label class="label">Gelombang</label>
              <select
                v-if="!assignedCohortId"
                v-model="form.cohortId"
                class="input"
                required
                @change="onCohortChange"
              >
                <option v-for="c in lookups?.cohorts ?? []" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
              <div v-else class="input cursor-default bg-gray-50 text-gray-700">
                {{ assignedCohortName }}
                <span class="text-xs text-gray-400">(mengikuti gelombang akun Anda)</span>
              </div>
            </div>
            <div>
              <label class="label">Nama Perusahaan</label>
              <input v-model="form.companyName" class="input" required />
            </div>
            <div>
              <label class="label">Bidang Industri</label>
              <input v-model="form.companyIndustry" class="input" />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Alamat Perusahaan</label>
              <input v-model="form.companyAddress" class="input" required />
            </div>
            <div>
              <label class="label">Kota</label>
              <input v-model="form.companyCity" class="input" />
            </div>
            <div>
              <label class="label">Telepon</label>
              <input v-model="form.companyPhone" class="input" />
            </div>
          </div>
        </div>

        <!-- Data Anggota -->
        <div class="card">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-lg font-semibold text-gray-800">Anggota Kelompok</h2>
            <button type="button" class="btn-secondary" @click="addMember">+ Tambah Anggota</button>
          </div>
          <p class="mb-3 text-sm text-gray-500">Masukkan data seluruh siswa, termasuk siswa ketua kelompok. NISN wajib diisi karena menjadi username akun SISWA. Akun KETUA yang sedang dipakai hanya akun sementara.</p>
          <div v-for="(m, i) in memberNames" :key="i" class="mb-3 rounded-lg border border-gray-200 p-3">
            <div class="mb-2 flex items-center justify-between">
              <span class="text-sm font-medium text-gray-600">{{ i === 0 ? 'Siswa Ketua Kelompok' : `Siswa Anggota ${i + 1}` }}</span>
              <button v-if="memberNames.length > 1" type="button" class="text-xs text-red-600 hover:underline" @click="removeMember(i)">Hapus</button>
            </div>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <input :value="m.name" class="input" placeholder="Nama (otomatis dari NISN)" readonly />
              <input
                :value="m.nisn"
                class="input"
                inputmode="numeric"
                pattern="[0-9]{10}"
                maxlength="10"
                placeholder="NISN (10 digit)"
                required
                @input="onNisnInput(i, $event)"
                @blur="lookupStudent(i)"
              />
              <input :value="m.className" class="input" placeholder="Kelas (otomatis dari NISN)" readonly />
              <input v-model="m.phone" class="input" placeholder="No. HP" />
            </div>
            <p v-if="m.status === 'checking'" class="mt-2 text-xs text-amber-600">
              Memeriksa NISN {{ m.nisn }} ke Master Siswa…
            </p>
            <p v-else-if="m.status === 'found'" class="mt-2 text-xs text-emerald-600">
              Nama &amp; kelas terisi otomatis dari Master Siswa.
            </p>
            <p v-else-if="m.status === 'notfound'" class="mt-2 text-xs text-red-600">
              NISN {{ m.nisn }} tidak ditemukan pada Master Siswa gelombang ini. Periksa kembali NISN-nya (pastikan sudah diimport admin).
            </p>
            <p v-else class="mt-2 text-xs text-gray-400">
              Masukkan NISN 10 digit — nama &amp; kelas akan terisi otomatis.
            </p>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <button type="submit" class="btn-secondary" :disabled="saving || hasChecking">Simpan Draft</button>
          <button type="button" class="btn-primary" :disabled="saving || hasChecking" @click="submit">
            Ajukan Pendaftaran
          </button>
          <span v-if="hasChecking" class="text-xs text-gray-500">Masih memeriksa NISN…</span>
        </div>
      </form>
    </template>
  </div>
</template>

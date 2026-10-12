<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  teacherRegistryService,
  type TeacherRegistryRecord,
  type TeacherRegistryImportResult,
  type TeacherProvisionedAccount,
} from '@/services/api.service';
import { useCohortStore } from '@/stores/cohort.store';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';

const cohortStore = useCohortStore();
// Mengikuti konteks gelombang global di header.
const selectedCohort = computed<string>({
  get: () => cohortStore.activeCohortId,
  set: (v) => {
    cohortStore.activeCohortId = v;
  },
});
const activeCohortName = computed(() => cohortStore.activeCohort?.name ?? '-');
const teachers = ref<TeacherRegistryRecord[]>([]);
const loading = ref(false);
const importing = ref(false);
const deletingId = ref('');
const error = ref('');
const success = ref('');
const importResult = ref<TeacherRegistryImportResult | null>(null);
const selectedFile = ref<File | null>(null);
const search = ref('');

const showAdd = ref(false);
const adding = ref(false);
const addForm = ref({ nip: '', fullName: '', majorCode: '' });

// Modal pemetaan nama header kolom (nama kolom beda antar file Excel)
const showMapping = ref(false);
const inspecting = ref(false);
const mapHeaders = ref<string[]>([]);
const mapForm = ref({ nip: '', fullName: '', majorCode: '' });

// Modal hasil akun otomatis (username = NIP, password acak — tampilkan sekali)
const accountsModal = ref<{
  title: string;
  accounts: TeacherProvisionedAccount[];
  skipped: number;
  errors: { nip: string; reason: string }[];
} | null>(null);

const normalizeNip = (raw: string): string => raw.replace(/\s+/g, '');
const nipValid = (raw: string): boolean => /^\d{18}$/.test(normalizeNip(raw));

const loadTeachers = async (): Promise<void> => {
  if (!selectedCohort.value) return;
  loading.value = true;
  error.value = '';
  try {
    const { items } = await teacherRegistryService.list(selectedCohort.value, {
      page: 1,
      perPage: 100,
      search: search.value.trim() || undefined,
    });
    teachers.value = items;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(search, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadTeachers, 400);
});

const onFileChange = (event: Event): void => {
  const input = event.target as HTMLInputElement;
  selectedFile.value = input.files?.[0] ?? null;
};

const openMapping = async (): Promise<void> => {
  if (!selectedFile.value || !selectedCohort.value) return;
  inspecting.value = true;
  error.value = '';
  success.value = '';
  importResult.value = null;
  try {
    const result = await teacherRegistryService.inspect(selectedFile.value);
    mapHeaders.value = result.headers.filter((h) => h);
    mapForm.value = {
      nip: result.detected.nip ?? '',
      fullName: result.detected.fullName ?? '',
      majorCode: result.detected.majorCode ?? '',
    };
    showMapping.value = true;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    inspecting.value = false;
  }
};

const closeMapping = (): void => {
  showMapping.value = false;
};

const confirmImport = async (): Promise<void> => {
  if (!selectedFile.value || !selectedCohort.value) return;
  const m = mapForm.value;
  if (!m.nip.trim() || !m.fullName.trim()) {
    error.value = 'Nama header kolom NIP dan Nama wajib diisi';
    return;
  }
  importing.value = true;
  error.value = '';
  try {
    const result = await teacherRegistryService.importExcel(selectedCohort.value, selectedFile.value, {
      nip: m.nip.trim(),
      fullName: m.fullName.trim(),
      majorCode: m.majorCode.trim() || undefined,
    });
    showMapping.value = false;
    importResult.value = result;
    const dupText = result.duplicates.length > 0 ? `, ${result.duplicates.length} duplikat dilewati` : '';
    const akunText = result.accounts.created.length > 0 ? `, ${result.accounts.created.length} akun dibuat otomatis` : '';
    success.value = `Import selesai: ${result.created} baru, ${result.updated} diperbarui${dupText}${akunText}.`;
    selectedFile.value = null;
    await loadTeachers();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    importing.value = false;
  }
};

const openAdd = (): void => {
  addForm.value = { nip: '', fullName: '', majorCode: '' };
  error.value = '';
  showAdd.value = true;
};

const closeAdd = (): void => {
  showAdd.value = false;
};

const submitAdd = async (): Promise<void> => {
  if (!selectedCohort.value) return;
  const form = addForm.value;
  if (!nipValid(form.nip)) {
    error.value = 'NIP harus terdiri dari 18 digit angka';
    return;
  }
  if (!form.fullName.trim()) {
    error.value = 'Nama lengkap wajib diisi';
    return;
  }
  adding.value = true;
  error.value = '';
  try {
    const result = await teacherRegistryService.create({
      cohortId: selectedCohort.value,
      nip: normalizeNip(form.nip),
      fullName: form.fullName.trim(),
      majorCode: form.majorCode.trim() || undefined,
    });
    showAdd.value = false;
    success.value = `Data guru ${result.record.fullName} (${result.record.nip}) ditambahkan ke Master Guru.`;
    if (result.account) {
      accountsModal.value = {
        title: 'Akun Guru Dibuat Otomatis',
        accounts: [result.account],
        skipped: 0,
        errors: [],
      };
    }
    await loadTeachers();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    adding.value = false;
  }
};

/** Tambal akun untuk baris master yang belum punya akun (idempoten). */
const ensureAccounts = async (): Promise<void> => {
  if (!selectedCohort.value) return;
  importing.value = true;
  error.value = '';
  try {
    const result = await teacherRegistryService.ensureAccounts(selectedCohort.value);
    accountsModal.value = {
      title: 'Hasil Pembuatan Akun',
      accounts: result.created,
      skipped: result.skipped,
      errors: result.errors,
    };
    if (result.created.length === 0 && result.errors.length === 0) {
      success.value = `Semua ${result.skipped} guru di gelombang ini sudah punya akun.`;
    }
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    importing.value = false;
  }
};

const removeTeacher = async (t: TeacherRegistryRecord): Promise<void> => {
  const ok = window.confirm(
    `Hapus guru "${t.fullName}" (NIP ${t.nip})?\n\n` +
      '1. Baris master disembunyikan — dipulihkan dengan import ulang Excel.\n' +
      '2. AKUN guru beserta datanya DIHAPUS PERMANEN: penugasan bimbingan siswa ' +
      'dan kunjungan monitoring ikut terhapus.\n\n' +
      'Tindakan ini TIDAK BISA dibatalkan. Lanjutkan?'
  );
  if (!ok) return;
  deletingId.value = t.id;
  error.value = '';
  success.value = '';
  try {
    const result = await teacherRegistryService.remove(t.id);
    let extra = '';
    if (result.accounts > 0) {
      extra =
        ` ${result.accounts} akun beserta ${result.supervisions} penugasan bimbingan, ` +
        `${result.visits} kunjungan dihapus permanen.`;
    }
    success.value = `Data ${t.fullName} (${t.nip}) dihapus dari Master Guru.${extra}`;
    await loadTeachers();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    deletingId.value = '';
  }
};

const copyAccounts = async (): Promise<void> => {
  const accounts = accountsModal.value?.accounts ?? [];
  if (!accounts.length) return;
  const lines = [
    'NIP\tNama\tUsername\tPassword',
    ...accounts.map((a) => `${a.nip}\t${a.fullName}\t${a.username}\t${a.password}`),
  ];
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    success.value = 'Daftar akun disalin ke clipboard.';
  } catch {
    error.value = 'Gagal menyalin ke clipboard.';
  }
};

onMounted(async () => {
  await cohortStore.ensureLoaded();
  await loadTeachers();
});

watch(
  () => cohortStore.activeCohortId,
  () => void loadTeachers()
);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <!-- Import Excel -->
    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Import Data Guru dari Excel</h2>
      <p class="mb-4 text-sm text-gray-500">
        Format kolom Excel: <strong>NIP</strong> (18 digit) | <strong>Nama Lengkap</strong> | <strong>Jurusan</strong> (opsional, kode jurusan).
        Akun login (username = NIP) <strong>dibuat otomatis</strong> — password acak ditampilkan sekali setelah import.
      </p>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label class="label">Gelombang</label>
          <p class="text-sm font-medium text-gray-700">{{ activeCohortName }} (dipilih di header)</p>
        </div>
        <div>
          <label class="label">File Excel</label>
          <input class="input" type="file" accept=".xlsx,.xls,.csv" @change="onFileChange" />
        </div>
        <div class="flex items-end">
          <button class="btn-primary" :disabled="inspecting || importing || !selectedFile || !selectedCohort" @click="openMapping">
            {{ inspecting ? 'Membaca header...' : 'Import Excel' }}
          </button>
        </div>
      </div>

      <p class="mt-3 text-xs text-gray-400">
        Nama header kolom tiap file bisa berbeda — setelah memilih file, akan muncul modal untuk memetakan kolom NIP, Nama &amp; Jurusan.
      </p>

      <!-- Hasil Import -->
      <div v-if="importResult" class="mt-4 rounded-lg bg-gray-50 p-4 text-sm">
        <p><strong>Hasil Import:</strong></p>
        <p>Total baris valid: {{ importResult.total }}</p>
        <p>
          Baru: {{ importResult.created }} | Diperbarui: {{ importResult.updated }} |
          Duplikat dilewati: {{ importResult.duplicates.length }} |
          Akun dibuat: {{ importResult.accounts.created.length }}
        </p>

        <!-- Akun otomatis + password (tampilkan sekali) -->
        <div v-if="importResult.accounts.created.length > 0" class="mt-3">
          <p class="font-medium text-emerald-700">
            Akun login dibuat otomatis ({{ importResult.accounts.created.length }}) —
            catat/salin password sekarang, hanya ditampilkan sekali:
          </p>
          <div class="mt-2 overflow-x-auto rounded border border-gray-200 bg-white">
            <table class="min-w-full text-left text-xs">
              <thead class="bg-gray-50 text-gray-500">
                <tr>
                  <th class="px-3 py-2">NIP</th>
                  <th class="px-3 py-2">Nama</th>
                  <th class="px-3 py-2">Username</th>
                  <th class="px-3 py-2">Password</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr v-for="a in importResult.accounts.created" :key="a.userId">
                  <td class="px-3 py-1.5 font-mono">{{ a.nip }}</td>
                  <td class="px-3 py-1.5">{{ a.fullName }}</td>
                  <td class="px-3 py-1.5 font-mono">{{ a.username }}</td>
                  <td class="px-3 py-1.5 font-mono">{{ a.password }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="importResult.accounts.skipped > 0" class="mt-1 text-xs text-gray-500">
            {{ importResult.accounts.skipped }} guru sudah punya akun (dilewati).
          </p>
        </div>

        <div v-if="importResult.duplicates.length > 0" class="mt-2">
          <p class="font-medium text-amber-700">Data sama tidak diduplikasi ({{ importResult.duplicates.length }}):</p>
          <ul class="list-disc pl-5 text-amber-700">
            <li v-for="(d, i) in importResult.duplicates.slice(0, 20)" :key="i">
              <span class="font-mono">{{ d.nip }}</span> — {{ d.fullName }} <span class="text-amber-600">({{ d.reason }})</span>
            </li>
          </ul>
          <p v-if="importResult.duplicates.length > 20" class="text-amber-600">
            ... dan {{ importResult.duplicates.length - 20 }} duplikat lainnya.
          </p>
        </div>
        <div v-if="importResult.errors.length > 0" class="mt-2">
          <p class="font-medium text-red-600">Error ({{ importResult.errors.length }}):</p>
          <ul class="list-disc pl-5 text-red-600">
            <li v-for="(err, i) in importResult.errors" :key="i">{{ err }}</li>
          </ul>
        </div>
        <div v-if="importResult.accounts.errors.length > 0" class="mt-2">
          <p class="font-medium text-red-600">Gagal membuat akun ({{ importResult.accounts.errors.length }}):</p>
          <ul class="list-disc pl-5 text-red-600">
            <li v-for="(a, i) in importResult.accounts.errors" :key="i">
              <span class="font-mono">{{ a.nip }}</span> — {{ a.reason }}
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Daftar Master Guru -->
    <div class="card">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-3">
          <h2 class="text-lg font-semibold text-gray-800">Master Guru ({{ teachers.length }} data)</h2>
          <button class="btn-secondary" :disabled="importing" @click="ensureAccounts">Buat Akun Tertinggal</button>
          <button class="btn-primary" @click="openAdd">+ Tambah Guru</button>
        </div>
        <input
          v-model="search"
          class="input w-72"
          type="search"
          placeholder="Cari NIP atau nama…"
        />
      </div>
      <div v-if="loading" class="loading" />
      <div v-else-if="teachers.length === 0" class="text-sm text-gray-400">
        {{
          search.trim()
            ? 'Tidak ada guru yang cocok dengan pencarian.'
            : 'Belum ada data. Import Excel atau klik "+ Tambah Guru".'
        }}
      </div>
      <table v-else class="table">
        <thead>
          <tr>
            <th>NIP</th>
            <th>Nama</th>
            <th>Jurusan</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in teachers" :key="t.id">
            <td class="font-mono">{{ t.nip }}</td>
            <td>{{ t.fullName }}</td>
            <td>{{ t.major?.name ?? '-' }}</td>
            <td class="text-right">
              <button class="btn-danger" :disabled="deletingId === t.id" @click="removeTeacher(t)">
                {{ deletingId === t.id ? 'Menghapus...' : 'Hapus' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal Pemetaan Header Kolom Excel -->
    <Modal :open="showMapping" title="Pemetaan Kolom Excel" size="md" :busy="importing" @close="closeMapping">
      <p class="mb-3 text-sm text-gray-500">
        <span class="font-medium text-gray-700">{{ selectedFile?.name }}</span>
      </p>

      <div v-if="mapHeaders.length > 0">
        <p class="label">Header terdeteksi</p>
        <div class="flex flex-wrap gap-1.5">
          <span v-for="(h, i) in mapHeaders" :key="i" class="bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{{ h }}</span>
        </div>
      </div>

      <div class="mt-3 space-y-3">
        <div>
          <label class="label">Kolom NIP</label>
          <input v-model="mapForm.nip" class="input" placeholder="NIP" />
        </div>
        <div>
          <label class="label">Kolom Nama Guru</label>
          <input v-model="mapForm.fullName" class="input" placeholder="Nama Lengkap" />
        </div>
        <div>
          <label class="label">Kolom Jurusan (opsional)</label>
          <input v-model="mapForm.majorCode" class="input" placeholder="Jurusan" />
          <p class="mt-1 text-xs text-gray-400">Kosongkan bila tidak ada kolom jurusan.</p>
        </div>
      </div>

      <template #footer>
        <button class="btn-secondary" :disabled="importing" @click="closeMapping">Batal</button>
        <button class="btn-primary" :disabled="importing" @click="confirmImport">
          <LoadingSpinner v-if="importing" inline />
          {{ importing ? 'Mengimport…' : 'Import' }}
        </button>
      </template>
    </Modal>

    <!-- Modal Tambah Guru -->
    <Modal :open="showAdd" title="Tambah Guru" size="sm" :busy="adding" @close="closeAdd">
      <div class="space-y-3">
        <div>
          <label class="label">Gelombang</label>
          <p class="text-sm font-medium text-gray-700">{{ activeCohortName }}</p>
        </div>

        <div>
          <label class="label">NIP (18 digit)</label>
          <input v-model="addForm.nip" class="input font-mono" inputmode="numeric" maxlength="18" placeholder="197503152005011001" />
        </div>

        <div>
          <label class="label">Nama Lengkap</label>
          <input v-model="addForm.fullName" class="input" placeholder="Nama sesuai induk guru" />
        </div>

        <div>
          <label class="label">Jurusan (opsional)</label>
          <input v-model="addForm.majorCode" class="input" placeholder="RPL" />
        </div>

        <p class="text-xs text-gray-400">
          Akun login (username = NIP) dibuat otomatis — password acak ditampilkan setelah simpan.
        </p>
      </div>

      <template #footer>
        <button class="btn-secondary" :disabled="adding" @click="closeAdd">Batal</button>
        <button class="btn-primary" :disabled="adding" @click="submitAdd">
          <LoadingSpinner v-if="adding" inline />
          {{ adding ? 'Menyimpan…' : 'Tambah Guru' }}
        </button>
      </template>
    </Modal>

    <!-- Modal Hasil Akun Otomatis -->
    <Modal :open="!!accountsModal" title="Akun Guru Dibuat Otomatis" size="lg" @close="accountsModal = null">
      <div v-if="accountsModal" class="space-y-4 text-sm">
        <p class="text-gray-800">
          <b>{{ accountsModal.accounts.length }}</b> akun dibuat (username = NIP, wajib ganti password saat login)
          <span v-if="accountsModal.skipped > 0"> · {{ accountsModal.skipped }} sudah punya akun</span>
          <span v-if="accountsModal.errors.length > 0"> · {{ accountsModal.errors.length }} gagal</span>.
          <b>Catat/salin password sekarang — hanya ditampilkan sekali.</b>
        </p>
        <div v-if="accountsModal.accounts.length" class="overflow-x-auto rounded border border-gray-200">
          <table class="min-w-full text-left text-xs">
            <thead class="bg-gray-50 text-gray-500">
              <tr>
                <th class="px-3 py-2">NIP</th>
                <th class="px-3 py-2">Nama</th>
                <th class="px-3 py-2">Username</th>
                <th class="px-3 py-2">Password</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="a in accountsModal.accounts" :key="a.userId">
                <td class="px-3 py-1.5 font-mono">{{ a.nip }}</td>
                <td class="px-3 py-1.5">{{ a.fullName }}</td>
                <td class="px-3 py-1.5 font-mono">{{ a.username }}</td>
                <td class="px-3 py-1.5 font-mono">{{ a.password }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="accountsModal.errors.length" class="rounded border border-red-200 bg-red-50 p-3">
          <p class="mb-1 font-medium text-red-700">Gagal membuat akun:</p>
          <ul class="space-y-0.5 text-xs text-red-700">
            <li v-for="(a, i) in accountsModal.errors" :key="i">
              <span class="font-mono">{{ a.nip }}</span> — {{ a.reason }}
            </li>
          </ul>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="accountsModal = null">Tutup</button>
        <button class="btn-primary" :disabled="!accountsModal?.accounts.length" @click="copyAccounts">
          Salin Semua
        </button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { studentRegistryService, type StudentRegistryRecord, type StudentRegistryImportResult } from '@/services/api.service';
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
const students = ref<StudentRegistryRecord[]>([]);
const loading = ref(false);
const importing = ref(false);
const deletingId = ref('');
const error = ref('');
const success = ref('');
const importResult = ref<StudentRegistryImportResult | null>(null);
const selectedFile = ref<File | null>(null);
const search = ref('');

const showAdd = ref(false);
const adding = ref(false);
const addForm = ref({ nisn: '', fullName: '', className: '', majorCode: '' });

// Modal pemetaan nama header kolom (nama kolom beda antar file Excel)
const showMapping = ref(false);
const inspecting = ref(false);
const mapHeaders = ref<string[]>([]);
const mapForm = ref({ nisn: '', fullName: '', className: '', majorCode: '' });

const loadStudents = async (): Promise<void> => {
  if (!selectedCohort.value) return;
  loading.value = true;
  error.value = '';
  try {
    const { items } = await studentRegistryService.list(selectedCohort.value, {
      page: 1,
      perPage: 100,
      search: search.value.trim() || undefined,
    });
    students.value = items;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(search, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadStudents, 400);
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
    const result = await studentRegistryService.inspect(selectedFile.value);
    mapHeaders.value = result.headers.filter((h) => h);
    mapForm.value = {
      nisn: result.detected.nisn ?? '',
      fullName: result.detected.fullName ?? '',
      className: result.detected.className ?? '',
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
  if (!m.nisn.trim() || !m.fullName.trim() || !m.className.trim()) {
    error.value = 'Nama header kolom NISN, Nama, dan Kelas wajib diisi';
    return;
  }
  importing.value = true;
  error.value = '';
  try {
    const result = await studentRegistryService.importExcel(selectedCohort.value, selectedFile.value, {
      nisn: m.nisn.trim(),
      fullName: m.fullName.trim(),
      className: m.className.trim(),
      majorCode: m.majorCode.trim() || undefined,
    });
    showMapping.value = false;
    importResult.value = result;
    const dupText = result.duplicates.length > 0 ? `, ${result.duplicates.length} duplikat dilewati` : '';
    success.value = `Import selesai: ${result.created} baru, ${result.updated} diperbarui${dupText}.`;
    selectedFile.value = null;
    await loadStudents();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    importing.value = false;
  }
};

const openAdd = (): void => {
  addForm.value = { nisn: '', fullName: '', className: '', majorCode: '' };
  error.value = '';
  showAdd.value = true;
};

const closeAdd = (): void => {
  showAdd.value = false;
};

const submitAdd = async (): Promise<void> => {
  if (!selectedCohort.value) return;
  const form = addForm.value;
  if (!/^\d{10}$/.test(form.nisn.trim())) {
    error.value = 'NISN harus terdiri dari 10 digit angka';
    return;
  }
  if (!form.fullName.trim()) {
    error.value = 'Nama lengkap wajib diisi';
    return;
  }
  if (!form.className.trim()) {
    error.value = 'Kelas wajib diisi (format XII-RPL-2)';
    return;
  }
  adding.value = true;
  error.value = '';
  try {
    const record = await studentRegistryService.create({
      cohortId: selectedCohort.value,
      nisn: form.nisn.trim(),
      fullName: form.fullName.trim(),
      className: form.className.trim(),
      majorCode: form.majorCode.trim() || undefined,
    });
    showAdd.value = false;
    success.value = `Data siswa ${record.fullName} (${record.nisn}) ditambahkan ke Master Siswa.`;
    await loadStudents();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    adding.value = false;
  }
};

const removeStudent = async (s: StudentRegistryRecord): Promise<void> => {
  const ok = window.confirm(
    `Hapus siswa "${s.fullName}" (NISN ${s.nisn})?\n\n` +
      '1. Baris master disembunyikan — dipulihkan dengan import ulang Excel.\n' +
      '2. AKUN siswa beserta SEMUA datanya DIHAPUS PERMANEN: absensi, jurnal, ' +
      'nilai, surat/dokumen, keanggotaan kelompok, dan pendaftaran yang diajukannya.\n\n' +
      'Tindakan ini TIDAK BISA dibatalkan. Lanjutkan?'
  );
  if (!ok) return;
  deletingId.value = s.id;
  error.value = '';
  success.value = '';
  try {
    const result = await studentRegistryService.remove(s.id);
    let extra = '';
    if (result.accounts > 0) {
      extra =
        ` ${result.accounts} akun beserta ${result.attendance} absensi, ` +
        `${result.journals} jurnal, ${result.grades} nilai, ${result.documents} dokumen ` +
        `dihapus permanen.`;
    }
    success.value = `Data ${s.fullName} (${s.nisn}) dihapus dari Master Siswa.${extra}`;
    await loadStudents();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    deletingId.value = '';
  }
};

onMounted(async () => {
  await cohortStore.ensureLoaded();
  await loadStudents();
});

watch(
  () => cohortStore.activeCohortId,
  () => void loadStudents()
);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <!-- Import Excel -->
    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Import Data Siswa dari Excel</h2>
      <p class="mb-4 text-sm text-gray-500">
        Format kolom Excel: <strong>NISN</strong> | <strong>Nama Lengkap</strong> | <strong>Kelas</strong> (XII-RPL-2) | <strong>Jurusan</strong> (opsional, kode jurusan).
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
        Nama header kolom tiap file bisa berbeda — setelah memilih file, akan muncul modal untuk memetakan kolom NISN, Nama &amp; Kelas.
      </p>

      <!-- Hasil Import -->
      <div v-if="importResult" class="mt-4 rounded-lg bg-gray-50 p-4 text-sm">
        <p><strong>Hasil Import:</strong></p>
        <p>Total baris valid: {{ importResult.total }}</p>
        <p>Baru: {{ importResult.created }} | Diperbarui: {{ importResult.updated }} | Duplikat dilewati: {{ importResult.duplicates.length }}</p>
        <div v-if="importResult.duplicates.length > 0" class="mt-2">
          <p class="font-medium text-amber-700">Data sama tidak diduplikasi ({{ importResult.duplicates.length }}):</p>
          <ul class="list-disc pl-5 text-amber-700">
            <li v-for="(d, i) in importResult.duplicates.slice(0, 20)" :key="i">
              <span class="font-mono">{{ d.nisn }}</span> — {{ d.fullName }} <span class="text-amber-600">({{ d.reason }})</span>
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
      </div>
    </div>

    <!-- Daftar Master Siswa -->
    <div class="card">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-3">
          <h2 class="text-lg font-semibold text-gray-800">Master Siswa ({{ students.length }} data)</h2>
          <button class="btn-primary" @click="openAdd">+ Tambah Siswa</button>
        </div>
        <input
          v-model="search"
          class="input w-72"
          type="search"
          placeholder="Cari NISN, nama, atau kelas…"
        />
      </div>
      <div v-if="loading" class="loading" />
      <div v-else-if="students.length === 0" class="text-sm text-gray-400">
        {{
          search.trim()
            ? 'Tidak ada siswa yang cocok dengan pencarian.'
            : 'Belum ada data. Import Excel atau klik "+ Tambah Siswa".'
        }}
      </div>
      <table v-else class="table">
        <thead>
          <tr>
            <th>NISN</th>
            <th>Nama</th>
            <th>Kelas</th>
            <th>Jurusan</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in students" :key="s.id">
            <td class="font-mono">{{ s.nisn }}</td>
            <td>{{ s.fullName }}</td>
            <td>{{ s.className }}</td>
            <td>{{ s.major?.name ?? '-' }}</td>
            <td class="text-right">
              <button class="btn-danger" :disabled="deletingId === s.id" @click="removeStudent(s)">
                {{ deletingId === s.id ? 'Menghapus...' : 'Hapus' }}
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
          <label class="label">Kolom NISN</label>
          <input v-model="mapForm.nisn" class="input" placeholder="NISN" />
        </div>
        <div>
          <label class="label">Kolom Nama Siswa</label>
          <input v-model="mapForm.fullName" class="input" placeholder="Nama Lengkap" />
        </div>
        <div>
          <label class="label">Kolom Kelas Siswa</label>
          <input v-model="mapForm.className" class="input" placeholder="Kelas" />
        </div>
        <div>
          <label class="label">Kolom Jurusan (opsional)</label>
          <input v-model="mapForm.majorCode" class="input" placeholder="Jurusan" />
          <p class="mt-1 text-xs text-gray-400">Kosongkan = deteksi otomatis dari kelas.</p>
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

    <!-- Modal Tambah Siswa -->
    <Modal :open="showAdd" title="Tambah Siswa" size="sm" :busy="adding" @close="closeAdd">
      <div class="space-y-3">
        <div>
          <label class="label">Gelombang</label>
          <p class="text-sm font-medium text-gray-700">{{ activeCohortName }}</p>
        </div>

        <div>
          <label class="label">NISN (10 digit)</label>
          <input v-model="addForm.nisn" class="input font-mono" inputmode="numeric" maxlength="10" placeholder="1234567890" />
        </div>

        <div>
          <label class="label">Nama Lengkap</label>
          <input v-model="addForm.fullName" class="input" placeholder="Nama sesuai induk siswa" />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Kelas</label>
            <input v-model="addForm.className" class="input" placeholder="XII-RPL-2" />
          </div>
          <div>
            <label class="label">Jurusan</label>
            <input v-model="addForm.majorCode" class="input" placeholder="RPL" />
          </div>
        </div>
      </div>

      <template #footer>
        <button class="btn-secondary" :disabled="adding" @click="closeAdd">Batal</button>
        <button class="btn-primary" :disabled="adding" @click="submitAdd">
          <LoadingSpinner v-if="adding" inline />
          {{ adding ? 'Menyimpan…' : 'Tambah Siswa' }}
        </button>
      </template>
    </Modal>
  </div>
</template>

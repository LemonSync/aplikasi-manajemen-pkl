<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { companyService, masterService, type MasterLookups } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';

interface CompanyItem {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  industry?: { id?: string; name: string } | null;
  quota: number | null;
  terpakai: number;
  sisa: number | null;
}

const companies = ref<CompanyItem[]>([]);
const lookups = ref<MasterLookups | null>(null);
const loading = ref(true);
const saving = ref(false);
const deletingId = ref('');
const error = ref('');
const success = ref('');
const search = ref('');
const industryFilter = ref('');
const showForm = ref(false);
// '' = mode tambah; terisi = mode ubah (companyService.update)
const editingId = ref('');

const emptyForm = () => ({ name: '', address: '', industryId: '', phone: '', email: '', city: '', website: '', quota: '' as string | number });
const form = ref(emptyForm());

const safeWebsite = (value: string | null): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    const [c, lk] = await Promise.all([
      companyService.list({
        search: search.value.trim() || undefined,
        industryId: industryFilter.value || undefined,
        perPage: 100,
      }),
      masterService.lookups(),
    ]);
    companies.value = c.items as unknown as CompanyItem[];
    lookups.value = lk;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const hasFilters = (): boolean => Boolean(search.value.trim() || industryFilter.value);

const resetFilters = (): void => {
  search.value = '';
  industryFilter.value = '';
  void load();
};

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(search, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(load, 400);
});
watch(industryFilter, () => {
  clearTimeout(searchTimer);
  void load();
});

const openForm = (c?: CompanyItem): void => {
  editingId.value = c?.id ?? '';
  form.value = c
    ? {
        name: c.name,
        address: c.address ?? '',
        industryId: c.industry?.id ?? '',
        phone: c.phone ?? '',
        email: c.email ?? '',
        city: c.city ?? '',
        website: c.website ?? '',
        quota: c.quota === null || c.quota === undefined ? '' : String(c.quota),
      }
    : emptyForm();
  error.value = '';
  showForm.value = true;
};

const closeForm = (): void => {
  showForm.value = false;
  editingId.value = '';
};

/** Kuota dikirim sebagai angka; kosong = tanpa batas (null). */
const buildPayload = (): Record<string, unknown> | null => {
  // Input type=number dapat mengubah v-model menjadi number saat diisi.
  const raw = String(form.value.quota ?? '').trim();
  if (raw !== '') {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      error.value = 'Kuota harus berupa bilangan bulat positif (atau kosong = tanpa batas).';
      return null;
    }
  }
  return {
    name: form.value.name,
    address: form.value.address || null,
    industryId: form.value.industryId || null,
    phone: form.value.phone || null,
    email: form.value.email || null,
    city: form.value.city || null,
    website: form.value.website.trim() || null,
    quota: raw === '' ? null : Number(raw),
  };
};

const submit = async (): Promise<void> => {
  if (!form.value.name.trim()) {
    error.value = 'Nama perusahaan wajib diisi.';
    return;
  }
  const payload = buildPayload();
  if (!payload) return;
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    if (editingId.value) {
      await companyService.update(editingId.value, payload);
      success.value = 'Perusahaan diperbarui.';
    } else {
      await companyService.create(payload);
      success.value = 'Perusahaan ditambahkan.';
    }
    closeForm();
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

const removeCompany = async (company: CompanyItem): Promise<void> => {
  if (!confirm(`Hapus perusahaan "${company.name}"? Data perusahaan disembunyikan dari pilihan baru, tetapi riwayat tetap dipertahankan.`)) return;
  deletingId.value = company.id;
  error.value = '';
  success.value = '';
  try {
    await companyService.remove(company.id);
    success.value = `Perusahaan ${company.name} berhasil dihapus.`;
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    deletingId.value = '';
  }
};

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <div class="card">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-gray-800">Perusahaan (DUDI)</h2>
        <div class="flex flex-wrap items-center gap-2">
          <input
            v-model="search"
            class="input w-56"
            type="search"
            placeholder="Cari nama atau kota…"
          />
          <select v-model="industryFilter" class="input w-auto">
            <option value="">Semua Industri</option>
            <option v-for="i in lookups?.industries ?? []" :key="i.id" :value="i.id">{{ i.name }}</option>
          </select>
          <button v-if="hasFilters()" class="btn-secondary" @click="resetFilters">Reset</button>
          <button class="btn-primary" @click="openForm()">Tambah</button>
        </div>
      </div>

      <SkeletonTable v-if="loading" :rows="6" :cols="6" />
      <table v-else class="table">
        <thead>
          <tr>
            <th>Nama</th>
            <th>Industri</th>
            <th>Kota</th>
            <th class="text-center">Kuota</th>
            <th class="text-center">Terpakai</th>
            <th class="text-center">Sisa</th>
            <th>Website</th>
            <th>Alamat</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in companies" :key="c.id">
            <td class="font-medium">{{ c.name }}</td>
            <td>{{ c.industry?.name ?? '-' }}</td>
            <td>{{ c.city ?? '-' }}</td>
            <td class="text-center">
              <span v-if="c.quota === null" class="text-gray-400">Tanpa batas</span>
              <span v-else class="font-mono">{{ c.quota }}</span>
            </td>
            <td class="text-center font-mono">{{ c.terpakai }}</td>
            <td class="text-center">
              <span v-if="c.sisa === null" class="badge bg-gray-100 text-gray-600">∞</span>
              <span v-else-if="c.sisa === 0" class="badge bg-red-100 text-red-700">0</span>
              <span v-else class="badge bg-emerald-100 text-emerald-700">{{ c.sisa }}</span>
            </td>
            <td>
              <a
                v-if="safeWebsite(c.website)"
                :href="safeWebsite(c.website) ?? undefined"
                target="_blank"
                rel="noopener noreferrer"
                class="text-primary-600 hover:underline"
              >
                {{ safeWebsite(c.website)?.replace(/^https?:\/\//, '') }}
              </a>
              <span v-else class="text-gray-400">-</span>
            </td>
            <td class="text-gray-500">{{ c.address ?? '-' }}</td>
            <td class="text-right">
              <button class="text-sm text-primary-600 hover:underline" @click="openForm(c)">Ubah</button>
              <button class="ml-3 text-sm text-red-600 hover:underline" :disabled="deletingId === c.id" @click="removeCompany(c)">
                {{ deletingId === c.id ? 'Menghapus...' : 'Hapus' }}
              </button>
            </td>
          </tr>
          <tr v-if="companies.length === 0">
            <td colspan="9" class="py-4 text-center text-gray-400">
              {{ hasFilters() ? 'Tidak ada perusahaan yang cocok dengan filter.' : 'Belum ada data.' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Modal
      :open="showForm"
      :title="editingId ? 'Ubah Perusahaan' : 'Tambah Perusahaan'"
      size="md"
      :busy="saving"
      @close="closeForm"
    >
      <form id="company-form" class="grid grid-cols-1 gap-4 sm:grid-cols-2" @submit.prevent="submit">
        <div class="sm:col-span-2">
          <label class="label">Nama Perusahaan</label>
          <input v-model="form.name" class="input" required />
        </div>
        <div>
          <label class="label">Bidang Industri</label>
          <select v-model="form.industryId" class="input">
            <option value="">— Pilih —</option>
            <option v-for="i in lookups?.industries ?? []" :key="i.id" :value="i.id">{{ i.name }}</option>
          </select>
        </div>
        <div>
          <label class="label">Kota</label>
          <input v-model="form.city" class="input" />
        </div>
        <div>
          <label class="label">Telepon</label>
          <input v-model="form.phone" class="input" />
        </div>
        <div>
          <label class="label">Email</label>
          <input v-model="form.email" class="input" type="email" />
        </div>
        <div>
          <label class="label">Kuota Siswa (opsional)</label>
          <input
            v-model="form.quota"
            class="input"
            type="number"
            min="0"
            step="1"
            placeholder="Kosong = tanpa batas"
          />
          <p class="mt-1 text-xs text-gray-400">
            Jumlah siswa PKL yang boleh diterima. Kuota penuh saat sisa 0.
          </p>
        </div>
        <div class="sm:col-span-2">
          <label class="label">Alamat</label>
          <input v-model="form.address" class="input" />
        </div>
        <div class="sm:col-span-2">
          <label class="label">Website (opsional)</label>
          <input v-model="form.website" class="input" inputmode="url" placeholder="https://www.contoh-perusahaan.com" />
        </div>
      </form>

      <template #footer>
        <button class="btn-secondary" :disabled="saving" @click="closeForm">Batal</button>
        <button class="btn-primary" type="button" :disabled="saving" @click="submit">
          <LoadingSpinner v-if="saving" inline />
          {{ saving ? 'Menyimpan…' : 'Simpan' }}
        </button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
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
  website: string | null;
  industry?: { name: string } | null;
}

const companies = ref<CompanyItem[]>([]);
const lookups = ref<MasterLookups | null>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');
const search = ref('');
const showForm = ref(false);

const form = ref({
  name: '',
  address: '',
  industryId: '',
  phone: '',
  email: '',
  city: '',
  website: '',
});

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    const [c, lk] = await Promise.all([companyService.list(search.value || undefined), masterService.lookups()]);
    companies.value = c.items as unknown as CompanyItem[];
    lookups.value = lk;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const openForm = (): void => {
  form.value = { name: '', address: '', industryId: '', phone: '', email: '', city: '', website: '' };
  showForm.value = true;
};

const create = async (): Promise<void> => {
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    await companyService.create({
      name: form.value.name,
      address: form.value.address || null,
      industryId: form.value.industryId || null,
      phone: form.value.phone || null,
      email: form.value.email || null,
      city: form.value.city || null,
      website: form.value.website.trim() || null,
    });
    success.value = 'Perusahaan ditambahkan.';
    showForm.value = false;
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <div class="card">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-800">Perusahaan (DUDI)</h2>
        <div class="flex gap-2">
          <input v-model="search" class="input" placeholder="Cari…" @keyup.enter="load" />
          <button class="btn-primary" @click="openForm">Tambah</button>
        </div>
      </div>

      <SkeletonTable v-if="loading" :rows="6" :cols="5" />
      <table v-else class="table">
        <thead>
          <tr>
            <th>Nama</th>
            <th>Industri</th>
            <th>Kota</th>
            <th>Website</th>
            <th>Alamat</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in companies" :key="c.id">
            <td class="font-medium">{{ c.name }}</td>
            <td>{{ c.industry?.name ?? '-' }}</td>
            <td>{{ c.city ?? '-' }}</td>
            <td>
              <a
                v-if="c.website"
                :href="c.website"
                target="_blank"
                rel="noopener noreferrer"
                class="text-primary-600 hover:underline"
              >
                {{ c.website.replace(/^https?:\/\//, '') }}
              </a>
              <span v-else class="text-gray-400">-</span>
            </td>
            <td class="text-gray-500">{{ c.address ?? '-' }}</td>
          </tr>
          <tr v-if="companies.length === 0">
            <td colspan="5" class="py-4 text-center text-gray-400">Belum ada data.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <Modal :open="showForm" title="Tambah Perusahaan" size="md" :busy="saving" @close="showForm = false">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <div class="sm:col-span-2">
          <label class="label">Alamat</label>
          <input v-model="form.address" class="input" />
        </div>
        <div class="sm:col-span-2">
          <label class="label">Website (opsional)</label>
          <input v-model="form.website" class="input" inputmode="url" placeholder="https://www.contoh-perusahaan.com" />
        </div>
      </div>

      <template #footer>
        <button class="btn-secondary" :disabled="saving" @click="showForm = false">Batal</button>
        <button class="btn-primary" :disabled="saving || !form.name" @click="create">
          <LoadingSpinner v-if="saving" inline />
          {{ saving ? 'Menyimpan…' : 'Simpan' }}
        </button>
      </template>
    </Modal>
  </div>
</template>

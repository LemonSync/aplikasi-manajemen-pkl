<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  companyRequestService,
  masterService,
  type CompanyRequestRecord,
  type MasterLookups,
} from '@/services/api.service';
import { notify } from '@/composables/useNotify';
import { extractErrorMessage } from '@/services/http';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import HostStrip from '@/components/host/HostStrip.vue';

const router = useRouter();

const loading = ref(true);
const submitting = ref(false);

const lookups = ref<MasterLookups | null>(null);
const requests = ref<CompanyRequestRecord[]>([]);

// Nama perusahaan selalu KAPITAL — transformasi on-input.
const name = ref('');
const address = ref('');
const industryId = ref('');
const phone = ref('');
const email = ref('');
const website = ref('');

const onNameInput = (event: Event): void => {
  const el = event.target as HTMLInputElement;
  const upper = el.value.toUpperCase();
  if (el.value !== upper) el.value = upper;
  name.value = upper;
};

const hasPending = computed(() => requests.value.some((r) => r.status === 'MENUNGGU'));

const STATUS_META: Record<CompanyRequestRecord['status'], { label: string; cls: string }> = {
  MENUNGGU: { label: 'Menunggu Review', cls: 'bg-amber-100 text-amber-700' },
  DISETUJUI: { label: 'Disetujui', cls: 'bg-emerald-100 text-emerald-700' },
  DITOLAK: { label: 'Ditolak', cls: 'bg-red-100 text-red-700' },
};

const formatDate = (value: string): string =>
  new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

const load = async (): Promise<void> => {
  loading.value = true;
  notify.clear();
  try {
    const [lk, mine] = await Promise.all([masterService.lookups(), companyRequestService.mine()]);
    lookups.value = lk;
    requests.value = mine;
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    loading.value = false;
  }
};

const resetForm = (): void => {
  name.value = '';
  address.value = '';
  industryId.value = '';
  phone.value = '';
  email.value = '';
  website.value = '';
};

const submit = async (): Promise<void> => {
  notify.clear();

  if (name.value.trim().length < 2) {
    notify.error('Nama perusahaan minimal 2 karakter.');
    return;
  }
  if (!address.value.trim()) {
    notify.error('Alamat perusahaan wajib diisi.');
    return;
  }
  if (email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
    notify.error('Format email tidak valid.');
    return;
  }

  submitting.value = true;
  try {
    const created = await companyRequestService.create({
      name: name.value.trim().toUpperCase(),
      address: address.value.trim(),
      industryId: industryId.value || null,
      phone: phone.value.trim() || null,
      email: email.value.trim() || null,
      website: website.value.trim() || null,
    });
    notify.success(`Usulan "${created.name}" terkirim. Admin sekolah akan menghubungi perusahaan tersebut.`);
    resetForm();
    requests.value = await companyRequestService.mine();
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    submitting.value = false;
  }
};

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6">
    <HostStrip action="usulkan" />

    <div v-if="loading" class="loading" />

    <template v-else>
      <!-- Form usulan -->
      <form class="card space-y-4" @submit.prevent="submit">
        <div>
          <h2 class="text-lg font-semibold text-gray-800">Usulkan Tempat PKL</h2>
          <p class="text-sm text-gray-500">
            Tidak menemukan perusahaan yang diinginkan di daftar? Usulkan di sini.
            Admin sekolah akan menghubungi perusahaan terlebih dahulu untuk memastikan
            menerima siswa PKL, lalu memutuskan apakah usulan disetujui atau ditolak.
          </p>
        </div>

        <div v-if="hasPending" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Anda sudah memiliki usulan yang sedang menunggu review admin. Satu usulan diproses pada satu waktu.
        </div>

        <div>
          <label class="label">Nama Perusahaan <span class="text-red-500">*</span></label>
          <input
            :value="name"
            type="text"
            class="input"
            maxlength="200"
            placeholder="otomatis menjadi HURUF KAPITAL"
            required
            @input="onNameInput"
          />
        </div>

        <div>
          <label class="label">Alamat Perusahaan <span class="text-red-500">*</span></label>
          <textarea v-model="address" class="input" rows="3" maxlength="500" placeholder="Jalan, nomor, kecamatan/kota" required />
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label class="label">Bidang Usaha</label>
            <select v-model="industryId" class="input">
              <option value="">— Pilih bidang (opsional) —</option>
              <option v-for="i in lookups?.industries ?? []" :key="i.id" :value="i.id">{{ i.name }}</option>
            </select>
          </div>
          <div>
            <label class="label">Nomor Telepon</label>
            <input v-model="phone" type="text" class="input" maxlength="30" placeholder="mis. 081234567890" />
          </div>
          <div>
            <label class="label">Email</label>
            <input v-model="email" type="email" class="input" maxlength="190" placeholder="info@perusahaan.co.id" />
          </div>
          <div>
            <label class="label">Website <span class="text-xs text-gray-400">(opsional)</span></label>
            <input v-model="website" type="url" class="input" maxlength="255" placeholder="https://www.perusahaan.co.id" />
          </div>
        </div>

        <div class="flex items-center gap-3">
          <button type="submit" class="btn-primary" :disabled="submitting || hasPending">
            <LoadingSpinner v-if="submitting" inline />
            {{ submitting ? 'Mengirim…' : 'Kirim Usulan' }}
          </button>
          <button type="button" class="btn-secondary" @click="router.push({ name: 'registration' })">
            Kembali ke Pendaftaran
          </button>
        </div>
      </form>

      <!-- Riwayat usulan -->
      <div class="card">
        <h2 class="mb-4 text-lg font-semibold text-gray-800">Riwayat Usulan</h2>
        <p v-if="requests.length === 0" class="text-sm text-gray-400">Belum ada usulan yang dikirim.</p>
        <ul v-else class="divide-y divide-gray-100">
          <li v-for="r in requests" :key="r.id" class="py-3">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="font-medium text-gray-800">{{ r.name }}</p>
                <p class="mt-0.5 text-sm text-gray-500">{{ r.address }}</p>
                <p class="mt-0.5 text-xs text-gray-400">
                  Dikirim {{ formatDate(r.createdAt) }}
                  <span v-if="r.industry"> · {{ r.industry.name }}</span>
                </p>
                <p v-if="r.status === 'DISETUJUI' && r.company" class="mt-1 text-xs text-emerald-600">
                  Kini tersedia di daftar perusahaan — silakan pilih saat pendaftaran.
                </p>
                <p v-if="r.status === 'DITOLAK' && r.reviewNote" class="mt-1 text-xs text-red-500">
                  Catatan admin: {{ r.reviewNote }}
                </p>
              </div>
              <span class="badge shrink-0" :class="STATUS_META[r.status].cls">{{ STATUS_META[r.status].label }}</span>
            </div>
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>

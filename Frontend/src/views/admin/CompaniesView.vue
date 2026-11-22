<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import {
  companyService,
  companyRequestService,
  masterService,
  type CompanyRequestRecord,
  type MasterLookups,
} from '@/services/api.service';
import { notify } from '@/composables/useNotify';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';
import { confirmDialog } from '@/composables/useDialog';

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
  notify.clear();
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
    notify.error(extractErrorMessage(e));
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
  notify.clear();
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
      notify.error('Kuota harus berupa bilangan bulat positif (atau kosong = tanpa batas).');
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
    notify.error('Nama perusahaan wajib diisi.');
    return;
  }
  const payload = buildPayload();
  if (!payload) return;
  saving.value = true;
  notify.clear();
  try {
    if (editingId.value) {
      await companyService.update(editingId.value, payload);
      notify.success('Perusahaan diperbarui.');
    } else {
      await companyService.create(payload);
      notify.success('Perusahaan ditambahkan.');
    }
    closeForm();
    await load();
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    saving.value = false;
  }
};

const removeCompany = async (company: CompanyItem): Promise<void> => {
  const ok = await confirmDialog({
    title: 'Hapus Perusahaan',
    message:
      `Hapus perusahaan "${company.name}"? Perusahaan hanya dapat dihapus bila tidak lagi dipakai pendaftaran siswa. Riwayat data tetap dipertahankan.`,
    confirmLabel: 'Hapus',
    danger: true,
  });
  if (!ok) return;
  deletingId.value = company.id;
  notify.clear();
  try {
    await companyService.remove(company.id);
    notify.success(`Perusahaan ${company.name} berhasil dihapus.`);
    await load();
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    deletingId.value = '';
  }
};

// ============================================================================
// Permintaan tempat PKL dari siswa (fase 1) — ACC otomatis menjadi Company
// ============================================================================

const requests = ref<CompanyRequestRecord[]>([]);
const requestsLoading = ref(false);
type RequestStatusFilter = '' | 'MENUNGGU' | 'DISETUJUI' | 'DITOLAK';
type ReviewTarget = { req: CompanyRequestRecord; action: 'APPROVE' | 'REJECT' };
const requestStatusFilter = ref<RequestStatusFilter>('');
const reviewing = ref(false);
// Review target: ACC pakai modal konfirmasi, Tolak pakai modal catatan.
const reviewTarget = ref<ReviewTarget | null>(null);
const reviewNote = ref('');

const REQUEST_STATUS_META: Record<CompanyRequestRecord['status'], { label: string; cls: string }> = {
  MENUNGGU: { label: 'Menunggu', cls: 'bg-amber-100 text-amber-700' },
  DISETUJUI: { label: 'Disetujui', cls: 'bg-emerald-100 text-emerald-700' },
  DITOLAK: { label: 'Ditolak', cls: 'bg-red-100 text-red-700' },
};

const pendingCount = ref(0);

const loadRequests = async (): Promise<void> => {
  requestsLoading.value = true;
  try {
    const res = await companyRequestService.list({
      status: requestStatusFilter.value || undefined,
      perPage: 100,
    });
    requests.value = res.items;
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    requestsLoading.value = false;
  }
};

const loadPendingCount = async (): Promise<void> => {
  try {
    const res = await companyRequestService.list({ status: 'MENUNGGU', perPage: 1 });
    pendingCount.value = res.meta?.total ?? res.items.length;
  } catch {
    pendingCount.value = 0;
  }
};

const openReview = (req: CompanyRequestRecord, action: 'APPROVE' | 'REJECT'): void => {
  reviewTarget.value = { req, action };
  reviewNote.value = '';
};

const closeReview = (): void => {
  if (reviewing.value) return;
  reviewTarget.value = null;
  reviewNote.value = '';
};

const confirmReview = async (): Promise<void> => {
  const target = reviewTarget.value;
  if (!target) return;
  reviewing.value = true;
  notify.clear();
  try {
    const result = await companyRequestService.review(
      target.req.id,
      target.action,
      target.action === 'REJECT' ? reviewNote.value.trim() || undefined : undefined
    );
    notify.success(
      target.action === 'APPROVE'
        ? `Usulan disetujui — "${result.company?.name}" kini tersedia di daftar perusahaan.`
        : `Usulan "${target.req.name}" ditolak.`
    );
    reviewTarget.value = null;
    reviewNote.value = '';
    await Promise.all([loadRequests(), loadPendingCount(), load()]);
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    reviewing.value = false;
  }
};

watch(requestStatusFilter, () => {
  void loadRequests();
});

const allLoaded = (): Promise<void> => Promise.all([load(), loadRequests(), loadPendingCount()]).then(() => undefined);

onMounted(() => {
  void allLoaded();
});
</script>

<template>
  <div class="space-y-6">

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
            <th class="text-center" title="Jumlah siswa pada gelombang aktif yang sudah diterima di perusahaan ini">
              Terpakai (gel. aktif)
            </th>
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

    <!-- Permintaan tempat PKL dari siswa -->
    <div class="card">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-semibold text-gray-800">Permintaan Tempat PKL</h2>
          <span v-if="pendingCount > 0" class="badge bg-amber-100 text-amber-700">{{ pendingCount }} menunggu</span>
        </div>
        <div class="flex items-center gap-2">
          <select v-model="requestStatusFilter" class="input w-auto">
            <option value="">Semua Status</option>
            <option value="MENUNGGU">Menunggu</option>
            <option value="DISETUJUI">Disetujui</option>
            <option value="DITOLAK">Ditolak</option>
          </select>
        </div>
      </div>
      <p class="mb-3 text-xs text-gray-500">
        Usulan dari siswa fase 1. Hubungi perusahaan terlebih dahulu untuk memastikan menerima siswa PKL,
        lalu ACC (otomatis menjadi perusahaan aktif di daftar) atau Tolak.
      </p>

      <SkeletonTable v-if="requestsLoading" :rows="4" :cols="5" />
      <table v-else class="table">
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Siswa</th>
            <th>Perusahaan yang Diusulkan</th>
            <th>Bidang</th>
            <th>Kontak</th>
            <th>Status</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in requests" :key="r.id">
            <td class="whitespace-nowrap text-gray-500">{{ new Date(r.createdAt).toLocaleDateString('id-ID') }}</td>
            <td class="font-medium">
              {{ r.student?.studentProfile?.fullName ?? r.student?.username ?? '-' }}
              <span v-if="r.student?.studentProfile?.nisn" class="block text-xs font-normal text-gray-400">
                NISN {{ r.student.studentProfile.nisn }}
              </span>
            </td>
            <td>
              <span class="font-medium">{{ r.name }}</span>
              <span class="block max-w-xs truncate text-xs text-gray-500">{{ r.address }}</span>
              <a
                v-if="r.website"
                :href="r.website"
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs text-primary-600 hover:underline"
              >{{ r.website.replace(/^https?:\/\//, '') }}</a>
            </td>
            <td>{{ r.industry?.name ?? '-' }}</td>
            <td class="text-xs text-gray-500">
              <span v-if="r.phone" class="block">{{ r.phone }}</span>
              <span v-if="r.email" class="block">{{ r.email }}</span>
              <span v-if="!r.phone && !r.email">-</span>
            </td>
            <td>
              <span class="badge" :class="REQUEST_STATUS_META[r.status].cls">
                {{ REQUEST_STATUS_META[r.status].label }}
              </span>
              <span v-if="r.status === 'DISETUJUI' && r.company" class="block text-xs text-emerald-600">
                → {{ r.company.name }}
              </span>
              <span v-if="r.status === 'DITOLAK' && r.reviewNote" class="block max-w-[12rem] truncate text-xs text-red-500" :title="r.reviewNote">
                {{ r.reviewNote }}
              </span>
            </td>
            <td class="text-right">
              <template v-if="r.status === 'MENUNGGU'">
                <button class="text-sm text-emerald-600 hover:underline" @click="openReview(r, 'APPROVE')">ACC</button>
                <button class="ml-3 text-sm text-red-600 hover:underline" @click="openReview(r, 'REJECT')">Tolak</button>
              </template>
              <span v-else class="text-xs text-gray-400">
                oleh {{ r.reviewedBy?.username ?? 'admin' }}
              </span>
            </td>
          </tr>
          <tr v-if="requests.length === 0">
            <td colspan="7" class="py-4 text-center text-gray-400">
              {{ requestStatusFilter ? 'Tidak ada permintaan dengan status tersebut.' : 'Belum ada permintaan dari siswa.' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal review: ACC / Tolak -->
    <Modal
      :open="!!reviewTarget"
      :title="reviewTarget?.action === 'APPROVE' ? 'Setujui Permintaan' : 'Tolak Permintaan'"
      size="md"
      :busy="reviewing"
      @close="closeReview"
    >
      <template v-if="reviewTarget">
        <p class="text-sm text-gray-700">
          <strong>{{ reviewTarget.req.name }}</strong> — diusulkan oleh
          {{ reviewTarget.req.student?.studentProfile?.fullName ?? reviewTarget.req.student?.username }}.
        </p>
        <p class="mt-1 text-sm text-gray-500">{{ reviewTarget.req.address }}</p>

        <div v-if="reviewTarget.action === 'APPROVE'" class="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Perusahaan akan otomatis ditambahkan ke daftar dan langsung muncul di pilihan pendaftaran semua siswa.
          Pastikan sudah menghubungi perusahaan dan memastikan mereka menerima siswa PKL.
        </div>

        <div v-else class="mt-4">
          <label class="label">Catatan Penolakan <span class="text-xs text-gray-400">(opsional)</span></label>
          <textarea
            v-model="reviewNote"
            class="input"
            rows="3"
            maxlength="1000"
            placeholder="mis. perusahaan belum menerima siswa PKL tahun ini"
          />
        </div>
      </template>

      <template #footer>
        <button class="btn-secondary" :disabled="reviewing" @click="closeReview">Batal</button>
        <button
          :class="reviewTarget?.action === 'APPROVE' ? 'btn-success' : 'btn-danger'"
          type="button"
          :disabled="reviewing"
          @click="confirmReview"
        >
          <LoadingSpinner v-if="reviewing" inline />
          {{ reviewing ? 'Memproses…' : reviewTarget?.action === 'APPROVE' ? 'ACC & Tambahkan' : 'Tolak Permintaan' }}
        </button>
      </template>
    </Modal>

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
            Jumlah siswa PKL yang boleh diterima per gelombang. Kuota penuh saat sisa 0, dan
            pemakaian mulai dari nol lagi ketika gelombang baru dibuka.
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

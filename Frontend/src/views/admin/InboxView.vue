<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  companyRequestService,
  documentService,
  downloadFile,
  gradeService,
  inboxService,
  registrationService,
  type InboxItem,
  type InboxKind,
} from '@/services/api.service';
import { notify } from '@/composables/useNotify';
import { useCohortStore } from '@/stores/cohort.store';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';
import EmptyState from '@/components/EmptyState.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';

const cohortStore = useCohortStore();

const loading = ref(true);
const busy = ref(false);
const search = ref('');
const order = ref<'OLDEST' | 'NEWEST'>('OLDEST');

const items = ref<InboxItem[]>([]);
const counts = ref<Record<InboxKind | 'TOTAL', number>>({
  TOTAL: 0,
  REGISTRASI: 0,
  DOKUMEN: 0,
  USULAN_PERUSAHAAN: 0,
  NILAI: 0,
});

type Tab = 'SEMUA' | InboxKind;

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'SEMUA', label: 'Semua' },
  { value: 'REGISTRASI', label: 'Pendaftaran' },
  { value: 'DOKUMEN', label: 'Surat & Dokumen' },
  { value: 'USULAN_PERUSAHAAN', label: 'Usulan Tempat PKL' },
  { value: 'NILAI', label: 'Persetujuan Nilai' },
];

const KIND_LABEL: Record<InboxKind, string> = {
  REGISTRASI: 'Pendaftaran',
  DOKUMEN: 'Dokumen',
  USULAN_PERUSAHAAN: 'Usulan tempat PKL',
  NILAI: 'Nilai PKL',
};

/** Halaman asal satu jenis antrean — untuk case yang butuh detail lengkap. */
const SOURCE_PAGE: Record<InboxKind, { name: string; label: string }> = {
  REGISTRASI: { name: 'admin-registrations', label: 'Halaman Pendaftaran' },
  DOKUMEN: { name: 'admin-documents', label: 'Halaman Verifikasi Dokumen' },
  USULAN_PERUSAHAAN: { name: 'admin-companies', label: 'Halaman Perusahaan' },
  NILAI: { name: 'admin-grade-recap', label: 'Rekap Penilaian' },
};

const activeTab = ref<Tab>('SEMUA');

const load = async (): Promise<void> => {
  loading.value = true;
  notify.clear();
  try {
    const result = await inboxService.list({
      cohortId: cohortStore.activeCohortId || undefined,
      order: order.value,
    });
    items.value = result.items;
    counts.value = result.counts;
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    loading.value = false;
  }
};

const fmtDateTime = (v: string): string =>
  new Date(v).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Sudah berapa lama item menunggu keputusan admin. */
const waitingAge = (v: string): string => {
  const days = Math.floor((Date.now() - new Date(v).getTime()) / 86_400_000);
  if (days <= 0) return 'hari ini';
  if (days === 1) return '1 hari';
  return `${days} hari`;
};

const visible = computed<InboxItem[]>(() => {
  const q = search.value.trim().toLowerCase();
  const list = activeTab.value === 'SEMUA' ? items.value : items.value.filter((i) => i.kind === activeTab.value);
  if (!q) return list;
  return list.filter((i) =>
    [
      i.label,
      i.student?.fullName ?? '',
      i.student?.username ?? '',
      i.student?.nisn ?? '',
      i.student?.className ?? '',
      i.student?.majorName ?? '',
      i.company ?? '',
      i.detail ?? '',
    ]
      .join(' ')
      .toLowerCase()
      .includes(q)
  );
});

// --- Keputusan setujui / tolak (inline, memakai endpoint sumber masing-masing) ---
const decision = ref<{ item: InboxItem; action: 'APPROVE' | 'REJECT' } | null>(null);
const note = ref('');
const letterNumber = ref('');

const openDecision = (item: InboxItem, action: 'APPROVE' | 'REJECT'): void => {
  decision.value = { item, action };
  note.value = '';
  letterNumber.value = '';
  notify.clear();
};

const closeDecision = (): void => {
  if (busy.value) return;
  decision.value = null;
  note.value = '';
  letterNumber.value = '';
};

const decide = async (): Promise<void> => {
  const target = decision.value;
  if (!target) return;
  const reason = note.value.trim();
  if (target.action === 'REJECT' && !reason) {
    notify.error('Alasan penolakan wajib diisi.');
    return;
  }
  const number = letterNumber.value.trim();
  if (number.length > 80) {
    notify.error('Nomor surat maksimal 80 karakter.');
    return;
  }

  busy.value = true;
  notify.clear();
  try {
    const { item, action } = target;
    if (item.kind === 'REGISTRASI' && action === 'APPROVE') {
      await registrationService.review(item.id, 'APPROVE', undefined, number || null);
    } else if (item.kind === 'REGISTRASI') {
      await registrationService.review(item.id, 'REJECT', reason);
    } else if (item.kind === 'DOKUMEN') {
      await documentService.verify(item.id, action, reason || undefined);
    } else if (item.kind === 'USULAN_PERUSAHAAN') {
      await companyRequestService.review(item.id, action, reason || undefined);
    } else {
      await gradeService.approve(item.id, { approved: action === 'APPROVE', note: reason || null });
    }
    notify.success(`${KIND_LABEL[item.kind]} ${action === 'APPROVE' ? 'disetujui' : 'ditolak'}.`);
    decision.value = null;
    note.value = '';
    letterNumber.value = '';
    await load();
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    busy.value = false;
  }
};

const downloadDoc = async (item: InboxItem): Promise<void> => {
  notify.clear();
  try {
    await downloadFile(`/documents/${item.id}/download`, item.detail ?? undefined);
  } catch (e) {
    notify.error(extractErrorMessage(e));
  }
};

onMounted(async () => {
  await cohortStore.ensureLoaded();
  await load();
});

watch(() => cohortStore.activeCohortId, () => void load());
watch(order, () => void load());
</script>

<template>
  <div class="space-y-6">

    <div class="card">
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-gray-800">Inbox Verifikasi</h2>
          <p class="text-sm text-gray-500">
            Semua hal yang menunggu keputusan Anda dalam satu daftar: pendaftaran, surat balasan perusahaan,
            surat pernyataan, laporan, usulan tempat PKL, dan persetujuan nilai. Hanya jurusan yang Anda awasi.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <input
            v-model="search"
            class="input w-64"
            type="search"
            placeholder="Cari nama, NISN, perusahaan…"
          />
          <select v-model="order" class="input w-auto">
            <option value="OLDEST">Terlama dulu</option>
            <option value="NEWEST">Terbaru dulu</option>
          </select>
        </div>
      </div>

      <div class="mb-4 flex flex-wrap gap-1 border border-gray-200 p-1">
        <button
          v-for="tab in TABS"
          :key="tab.value"
          class="px-3 py-1.5 text-xs font-semibold transition"
          :class="
            activeTab === tab.value
              ? 'bg-primary-600 text-white'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
          "
          @click="activeTab = tab.value"
        >
          {{ tab.label }}
          <span class="ml-1 font-mono" :class="activeTab === tab.value ? 'text-primary-100' : 'text-gray-400'">
            {{ tab.value === 'SEMUA' ? counts.TOTAL : counts[tab.value] }}
          </span>
        </button>
      </div>

      <SkeletonTable v-if="loading" :rows="6" :cols="5" />
      <EmptyState
        v-else-if="visible.length === 0"
        icon="inbox"
        :title="search.trim() ? 'Tidak ada yang cocok dengan pencarian.' : 'Tidak ada yang menunggu keputusan'"
        description="Semua ajuan pada jurusan Anda sudah ditinjau. Daftar ini terisi otomatis saat ada siswa atau perusahaan yang mengirim berkas baru."
      />
      <table v-else class="table">
        <thead>
          <tr>
            <th>Menunggu</th>
            <th>Perlu Ditinjau</th>
            <th>Siswa</th>
            <th>Tempat / Keterangan</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="i in visible" :key="`${i.kind}-${i.id}`">
            <td class="whitespace-nowrap">
              <p class="text-sm">{{ fmtDateTime(i.queuedAt) }}</p>
              <p class="text-xs text-gray-400">{{ waitingAge(i.queuedAt) }}</p>
            </td>
            <td>
              <p class="font-medium text-gray-800">{{ i.label }}</p>
              <StatusBadge :status="i.status" />
            </td>
            <td>
              <template v-if="i.student">
                <p class="font-medium">{{ i.student.fullName ?? i.student.username }}</p>
                <p class="text-xs text-gray-400">
                  {{ i.student.username }}
                  <template v-if="i.student.nisn"> · NISN {{ i.student.nisn }}</template>
                  <template v-if="i.student.className"> · {{ i.student.className }}</template>
                </p>
                <p v-if="i.student.majorName" class="text-xs text-gray-500">{{ i.student.majorName }}</p>
              </template>
              <span v-else class="text-gray-400">-</span>
            </td>
            <td>
              <p v-if="i.company">{{ i.company }}</p>
              <p v-if="i.detail" class="break-all font-mono text-xs text-gray-400">{{ i.detail }}</p>
              <p v-if="i.cohortName" class="text-xs text-gray-400">{{ i.cohortName }}</p>
              <span v-if="!i.company && !i.detail && !i.cohortName" class="text-gray-400">-</span>
            </td>
            <td class="whitespace-nowrap text-right">
              <button class="text-sm text-emerald-600 hover:underline" @click="openDecision(i, 'APPROVE')">
                Setujui
              </button>
              <span class="mx-1 text-gray-300">|</span>
              <button class="text-sm text-red-600 hover:underline" @click="openDecision(i, 'REJECT')">Tolak</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Modal
      :open="!!decision"
      :title="decision?.action === 'APPROVE' ? 'Setujui' : 'Tolak'"
      size="md"
      :busy="busy"
      @close="closeDecision"
    >
      <template v-if="decision">
        <p class="mb-1 text-sm text-gray-600">
          <strong>{{ KIND_LABEL[decision.item.kind] }}</strong> —
          {{ decision.item.student?.fullName ?? decision.item.student?.username ?? 'siswa tidak ditemukan' }}
          <template v-if="decision.item.company"> · {{ decision.item.company }}</template>
        </p>
        <p class="mb-4 text-xs text-gray-400">
          Menunggu sejak {{ fmtDateTime(decision.item.queuedAt) }} ({{ waitingAge(decision.item.queuedAt) }})
        </p>

        <template v-if="decision.action === 'APPROVE' && decision.item.kind === 'REGISTRASI'">
          <label class="label" for="inbox-number">Nomor Surat Permohonan (opsional)</label>
          <input
            id="inbox-number"
            v-model="letterNumber"
            class="input font-mono"
            maxlength="80"
            placeholder="421/123/SMKN-9MDN/2026"
          />
          <p class="mt-1 text-xs text-gray-500">Kosongkan bila nomor belum tersedia — surat tetap terbit tanpa nomor.</p>
        </template>

        <template v-if="decision.action === 'REJECT' || decision.item.kind !== 'REGISTRASI'">
          <label class="label" for="inbox-note">{{ decision.action === 'REJECT' ? 'Alasan Penolakan' : 'Catatan (opsional)' }}</label>
          <textarea
            id="inbox-note"
            v-model="note"
            rows="3"
            class="input"
            :placeholder="decision.action === 'REJECT' ? 'Wajib diisi — terlihat oleh siswa' : 'Catatan untuk siswa'"
          ></textarea>
        </template>

        <div class="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <button
            v-if="decision.item.kind === 'DOKUMEN'"
            class="text-primary-600 hover:underline"
            @click="downloadDoc(decision.item)"
          >
            Unduh berkas
          </button>
          <RouterLink
            :to="{ name: SOURCE_PAGE[decision.item.kind].name }"
            class="text-gray-500 hover:underline"
            >Buka {{ SOURCE_PAGE[decision.item.kind].label }}</RouterLink
          >
        </div>
      </template>

      <template #footer>
        <button class="btn-secondary" :disabled="busy" @click="closeDecision">Batal</button>
        <button
          :class="decision?.action === 'APPROVE' ? 'btn-success' : 'btn-danger'"
          :disabled="busy || (decision?.action === 'REJECT' && !note.trim())"
          @click="decide"
        >
          <LoadingSpinner v-if="busy" inline />
          {{ busy ? 'Mengirim…' : decision?.action === 'APPROVE' ? 'Setujui' : 'Kirim Tolak' }}
        </button>
      </template>
    </Modal>
  </div>
</template>

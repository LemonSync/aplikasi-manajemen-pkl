<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { attendanceService, type AttendanceRecord } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import { useGeolocation } from '@/composables/useGeolocation';
import StatusBadge from '@/components/StatusBadge.vue';
import AppIcon from '@/components/AppIcon.vue';
import PageHeader from '@/components/PageHeader.vue';
import DataTable from '@/components/DataTable.vue';
import { confirmDialog } from '@/composables/useDialog';
import { notify } from '@/composables/useNotify';

type AttendanceStatus = 'HADIR' | 'IZIN' | 'SAKIT' | 'ALPHA';

const today = ref<AttendanceRecord | null>(null);
const history = ref<AttendanceRecord[]>([]);
const loading = ref(true);
const submitting = ref(false);
const status = ref<AttendanceStatus>('HADIR');
const activity = ref('');
const sickProof = ref<File | null>(null);
const { locate, loading: locating } = useGeolocation();

const STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: 'HADIR', label: 'Hadir' },
  { value: 'IZIN', label: 'Izin' },
  { value: 'SAKIT', label: 'Sakit' },
  { value: 'ALPHA', label: 'Absen' },
];

/** Check-in hanya memakai keterangan untuk Izin/Sakit; kegiatan Hadir diisi saat pulang. */
const ACTIVITY_LABEL: Record<AttendanceStatus, string> = {
  HADIR: '',
  IZIN: 'Keterangan Izin',
  SAKIT: 'Keterangan Sakit (opsional)',
  ALPHA: '',
};

const ACTIVITY_PLACEHOLDER: Record<AttendanceStatus, string> = {
  HADIR: '',
  IZIN: 'mis. mengurus administrasi di sekolah, keperluan keluarga, dll.',
  SAKIT: 'mis. demam, flu berat — boleh dikosongkan',
  ALPHA: '',
};

const CHECKOUT_ACTIVITY_PLACEHOLDER = 'mis. membantu konfigurasi jaringan kantor, input data, desain grafis, dll.';

const hasSubmitted = computed(() => Boolean(today.value));

/** Check-out manual hanya untuk status Hadir yang belum check-out. */
const canCheckOut = computed(
  () => today.value?.status === 'HADIR' && Boolean(today.value?.checkInAt) && !today.value?.checkOutAt
);

/** Hari Hadir yang ditutup sistem (lewat jam 17:00) tanpa uraian kegiatan — boleh disusulkan. */
const needsLateActivity = computed(
  () => today.value?.status === 'HADIR' && Boolean(today.value?.checkOutAt) && !today.value?.activity?.trim()
);

const checkingOut = ref(false);
const checkOutActivity = ref('');
const lateActivity = ref('');
const savingActivity = ref(false);

const load = async (): Promise<void> => {
  loading.value = true;
  notify.clear();
  try {
    const [t, h] = await Promise.all([attendanceService.today(), attendanceService.listMine({ perPage: 50 })]);
    today.value = t;
    history.value = h;
    // Absensi lama mengisinya saat check-in: dipakai sebagai awal tulisan, bukan hilang tertimpa.
    if (t?.status === 'HADIR' && !t.checkOutAt && !checkOutActivity.value) checkOutActivity.value = t.activity ?? '';
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    loading.value = false;
  }
};

const pickSickProof = (event: Event): void => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  if (!file) {
    sickProof.value = null;
    return;
  }
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
  if (!allowed.includes(file.type)) {
    notify.error('Bukti sakit harus berupa foto JPG/PNG atau PDF.');
    input.value = '';
    sickProof.value = null;
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    notify.error('Ukuran bukti sakit maksimal 5 MB.');
    input.value = '';
    sickProof.value = null;
    return;
  }
  notify.clear();
  sickProof.value = file;
};

const submit = async (): Promise<void> => {
  notify.clear();

  if (status.value === 'IZIN' && !activity.value.trim()) {
    notify.error('Keterangan izin wajib diisi saat status Izin.');
    return;
  }
  if (status.value === 'ALPHA') {
    const ok = await confirmDialog({
      title: 'Absen (Alpha)',
      message:
        'Anda memilih status Absen (Alpha). Absensi akan langsung tercatat tanpa konfirmasi Guru Pembimbing. Lanjutkan?',
      confirmLabel: 'Kirim absen',
      danger: true,
    });
    if (!ok) return;
  }

  submitting.value = true;
  try {
    let geo: { lat: number; long: number; accuracy: number } | undefined;
    if (status.value === 'HADIR') {
      // HADIR: lokasi GPS wajib — hanya status ini yang merekam lokasi.
      const pos = await locate();
      geo = { lat: pos.lat, long: pos.long, accuracy: pos.accuracy };
    }
    await attendanceService.submit({
      status: status.value,
      activity: status.value === 'HADIR' ? undefined : activity.value.trim() || undefined,
      geo,
      sickProof: status.value === 'SAKIT' && sickProof.value ? sickProof.value : undefined,
    });
    notify.success(
      status.value === 'ALPHA'
        ? 'Absensi Alpha berhasil dicatat otomatis.'
        : 'Absensi berhasil dikirim dan menunggu konfirmasi Guru Pembimbing.'
    );
    activity.value = '';
    sickProof.value = null;
    const fileInput = document.querySelector<HTMLInputElement>('#sick-proof-input');
    if (fileInput) fileInput.value = '';
    await load();
    await loadCalendar();
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    submitting.value = false;
  }
};

const formatTime = (value: string | null): string =>
  value ? new Date(value).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';

/** Check-out manual: uraikan kegiatan hari ini, rekam lokasi GPS, lalu tutup absensi. */
const doCheckOut = async (): Promise<void> => {
  notify.clear();
  if (checkOutActivity.value.trim().length < 3) {
    notify.error('Pelaksanaan kegiatan wajib diisi sebelum absen keluar.');
    return;
  }
  checkingOut.value = true;
  try {
    const pos = await locate();
    await attendanceService.checkOut({
      lat: pos.lat,
      long: pos.long,
      accuracy: pos.accuracy,
      activity: checkOutActivity.value.trim(),
    });
    notify.success('Absen keluar berhasil. Kegiatan, waktu, dan lokasi Anda tercatat.');
    checkOutActivity.value = '';
    await load();
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    checkingOut.value = false;
  }
};

/** Susulan kegiatan untuk hari yang sudah ditutup otomatis — jam pulang tidak berubah. */
const sendLateActivity = async (): Promise<void> => {
  notify.clear();
  if (lateActivity.value.trim().length < 3) {
    notify.error('Pelaksanaan kegiatan minimal 3 karakter.');
    return;
  }
  savingActivity.value = true;
  try {
    await attendanceService.saveActivity(lateActivity.value.trim());
    notify.success('Pelaksanaan kegiatan tersimpan. Absen keluar Anda tetap tercatat otomatis.');
    lateActivity.value = '';
    await load();
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    savingActivity.value = false;
  }
};

const verifyLabel = (rec: AttendanceRecord): string => {
  if (rec.status === 'ALPHA') return 'Terekam Otomatis';
  if (rec.verifiedById && rec.anomalyNote?.startsWith('Ditolak')) return 'Ditolak Pembimbing';
  return rec.verifiedById ? 'Terkonfirmasi' : 'Menunggu Pembimbing';
};

// --- Kalender sidebar ---
const now = new Date();
const calYear = ref(now.getFullYear());
const calMonth = ref(now.getMonth()); // 0-11
const calRecords = ref<AttendanceRecord[]>([]);
const calLoading = ref(false);

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

const toIsoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const calMonthLabel = computed(() => `${MONTH_NAMES[calMonth.value]} ${calYear.value}`);

const statusByDate = computed<Map<string, AttendanceRecord>>(() => {
  const map = new Map<string, AttendanceRecord>();
  for (const r of calRecords.value) {
    map.set(toIsoDate(new Date(r.date)), r);
  }
  return map;
});

const calDays = computed<Array<{ day: number; iso: string; rec?: AttendanceRecord; weekend: boolean; isToday: boolean }>>(() => {
  const first = new Date(calYear.value, calMonth.value, 1);
  const daysInMonth = new Date(calYear.value, calMonth.value + 1, 0).getDate();
  // Index Senin=0 ... Minggu=6
  const leading = (first.getDay() + 6) % 7;
  const cells: Array<{ day: number; iso: string; rec?: AttendanceRecord; weekend: boolean; isToday: boolean }> = [];
  const todayIso = toIsoDate(new Date());
  for (let i = 0; i < leading; i++) {
    cells.push({ day: 0, iso: '', weekend: false, isToday: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(calYear.value, calMonth.value, d);
    const iso = toIsoDate(date);
    const dow = date.getDay();
    cells.push({
      day: d,
      iso,
      rec: statusByDate.value.get(iso),
      weekend: dow === 0 || dow === 6,
      isToday: iso === todayIso,
    });
  }
  return cells;
});

const calSummary = computed(() => {
  const counts = { HADIR: 0, IZIN: 0, SAKIT: 0, ALPHA: 0 };
  for (const r of calRecords.value) {
    if (r.status in counts) counts[r.status as AttendanceStatus] += 1;
  }
  return counts;
});

const DOT_COLOR: Record<string, string> = {
  HADIR: 'bg-info',
  IZIN: 'bg-warn-400',
  SAKIT: 'bg-ink-400',
  ALPHA: 'bg-no',
};

const historyColumns = [
  { key: 'date', label: 'Tanggal' },
  { key: 'in', label: 'Masuk' },
  { key: 'out', label: 'Pulang' },
  { key: 'status', label: 'Status' },
  { key: 'activity', label: 'Kegiatan / Keterangan' },
  { key: 'supervisor', label: 'Pembimbing' },
];

const loadCalendar = async (): Promise<void> => {
  calLoading.value = true;
  try {
    const from = `${calYear.value}-${String(calMonth.value + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(calYear.value, calMonth.value + 1, 0).getDate();
    const to = `${calYear.value}-${String(calMonth.value + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    calRecords.value = await attendanceService.listMine({ from, to, perPage: 100 });
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    calLoading.value = false;
  }
};

const prevMonth = (): void => {
  if (calMonth.value === 0) {
    calMonth.value = 11;
    calYear.value -= 1;
  } else {
    calMonth.value -= 1;
  }
};

const nextMonth = (): void => {
  if (calMonth.value === 11) {
    calMonth.value = 0;
    calYear.value += 1;
  } else {
    calMonth.value += 1;
  }
};

watch([calYear, calMonth], () => {
  void loadCalendar();
});

onMounted(() => {
  void load();
  void loadCalendar();
});
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Absensi Harian" subtitle="Catat kehadiran PKL hari ini dan lihat riwayat satu bulan." />

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div class="space-y-6 lg:col-span-2">
        <div class="card">
          <h2 class="mb-4 text-lg font-semibold text-gray-800">Absensi Hari Ini</h2>
          <div v-if="loading" class="loading" />
          <template v-else>
            <div v-if="hasSubmitted" class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div class="rounded-lg border border-gray-200 p-3">
                <p class="text-xs text-gray-500">Status</p>
                <p class="text-sm font-medium"><StatusBadge :status="today?.status ?? '-'" /></p>
              </div>
              <div class="rounded-lg border border-gray-200 p-3">
                <p class="text-xs text-gray-500">Absen Masuk</p>
                <p class="text-sm font-medium">{{ formatTime(today?.checkInAt ?? null) }}</p>
              </div>
              <div class="rounded-lg border border-gray-200 p-3">
                <p class="text-xs text-gray-500">Absen Keluar</p>
                <p class="text-sm font-medium">
                  {{ formatTime(today?.checkOutAt ?? null) }}
                  <span
                    v-if="today?.checkOutAt && !today.checkOutLat"
                    class="ml-1 text-xs font-normal text-gray-400"
                  >(otomatis)</span>
                </p>
              </div>
              <div class="rounded-lg border border-gray-200 p-3">
                <p class="text-xs text-gray-500">Konfirmasi Pembimbing</p>
                <p class="text-sm font-medium">{{ today ? verifyLabel(today) : '-' }}</p>
              </div>
            </div>

            <div v-else-if="today?.activity" class="mb-4 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
              <strong>{{ today?.status === 'IZIN' ? 'Keterangan izin:' : today?.status === 'SAKIT' ? 'Keterangan sakit:' : 'Pelaksanaan kegiatan:' }}</strong>
              {{ today.activity }}
            </div>

            <div
              v-if="today?.status === 'SAKIT' && today.sickProofPath"
              class="mb-4 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700"
            >
              <strong>Bukti sakit:</strong> {{ today.sickProofName ?? 'terlampir' }}
            </div>

            <div v-if="today?.isAnomaly" class="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Perhatian: {{ today.anomalyNote ?? 'Lokasi terdeteksi anomali.' }}
            </div>

            <div v-if="!hasSubmitted">
              <div class="mb-3">
                <label class="label">Status Kehadiran</label>
                <select v-model="status" class="input h-11">
                  <option v-for="o in STATUS_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </div>

              <div v-if="status === 'IZIN' || status === 'SAKIT'" class="mb-3">
                <label class="label">
                  {{ ACTIVITY_LABEL[status] }}
                  <span v-if="status === 'IZIN'" class="text-red-500">*</span>
                </label>
                <textarea
                  v-model="activity"
                  class="input"
                  rows="3"
                  :placeholder="ACTIVITY_PLACEHOLDER[status]"
                />
              </div>

              <div v-if="status === 'SAKIT'" class="mb-3">
                <label class="label">Unggah Bukti Sakit <span class="text-xs text-gray-400">(opsional — foto JPG/PNG atau PDF, maks. 5 MB)</span></label>
                <input
                  id="sick-proof-input"
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,application/pdf"
                  class="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
                  @change="pickSickProof"
                />
              </div>

              <div v-if="status === 'ALPHA'" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                Status Absen (Alpha) akan langsung tercatat hari ini tanpa konfirmasi Guru Pembimbing.
              </div>

              <div v-if="status === 'HADIR'" class="mb-3 text-xs text-gray-500">
                Lokasi GPS wajib direkam untuk status Hadir. Pelaksanaan kegiatan tidak ditanyakan sekarang — isi saat absen keluar.
              </div>

              <button class="btn-primary h-12 w-full text-[15px] sm:w-auto sm:px-6" :disabled="submitting || locating" @click="submit">
                {{
                  locating
                    ? 'Mengambil lokasi...'
                    : submitting
                      ? 'Mengirim...'
                      : status === 'ALPHA'
                        ? 'Catat Absen'
                        : 'Kirim Absensi'
                }}
              </button>
            </div>
            <div v-else class="space-y-3">
              <div class="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
                Anda sudah mengirim absensi hari ini. Absensi tidak dapat diubah atau dirapel.
              </div>

              <div v-if="canCheckOut" class="rounded-lg border border-gray-200 p-4">
                <p class="text-sm font-semibold text-gray-800">Absen Keluar</p>
                <p class="mt-1 text-sm text-gray-600">
                  Saat selesai kegiatan di tempat PKL, lakukan absen keluar. Lokasi GPS Anda akan ikut direkam.
                </p>
                <label class="label mt-3">
                  Pelaksanaan Kegiatan Hari Ini
                  <span class="text-red-500">*</span>
                </label>
                <textarea
                  v-model="checkOutActivity"
                  class="input"
                  rows="3"
                  maxlength="2000"
                  :placeholder="CHECKOUT_ACTIVITY_PLACEHOLDER"
                />
                <button
                  class="btn-primary mt-3 h-12 w-full text-[15px] sm:w-auto sm:px-6"
                  :disabled="checkingOut || locating || checkOutActivity.trim().length < 3"
                  @click="doCheckOut"
                >
                  {{ locating ? 'Mengambil lokasi...' : checkingOut ? 'Menyimpan...' : 'Check-Out Sekarang' }}
                </button>
              </div>

              <div v-else-if="needsLateActivity" class="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p class="text-sm font-semibold text-amber-800">Isi Pelaksanaan Kegiatan</p>
                <p class="mt-1 text-sm text-amber-700">
                  Absen keluar Anda ditutup otomatis oleh sistem sehingga uraian kegiatan belum tercatat. Jam pulang tetap
                  otomatis — yang disimpan di sini hanya kegiatannya.
                </p>
                <textarea
                  v-model="lateActivity"
                  class="input mt-3"
                  rows="3"
                  maxlength="2000"
                  :placeholder="CHECKOUT_ACTIVITY_PLACEHOLDER"
                />
                <button
                  class="btn-primary mt-3 h-12 w-full text-[15px] sm:w-auto sm:px-6"
                  :disabled="savingActivity || lateActivity.trim().length < 3"
                  @click="sendLateActivity"
                >
                  {{ savingActivity ? 'Menyimpan...' : 'Simpan Kegiatan' }}
                </button>
              </div>
            </div>
            <p class="mt-2 text-xs text-gray-400">
              Absensi Hadir diperiksa lokasinya lalu dikonfirmasi Guru Pembimbing. Kegiatan harian diisi saat absen keluar; status Alpha tercatat otomatis.
            </p>
          </template>
        </div>

        <div class="card">
          <h2 class="mb-4 text-lg font-semibold text-gray-800">Riwayat Absensi</h2>
          <DataTable :columns="historyColumns" :rows="history" :loading="loading" empty-title="Belum ada riwayat.">
            <template #cell-date="{ row }">{{ new Date(row.date).toLocaleDateString('id-ID') }}</template>
            <template #cell-in="{ row }">{{ formatTime(row.checkInAt) }}</template>
            <template #cell-out="{ row }">
              {{ formatTime(row.checkOutAt) }}
              <span
                v-if="row.checkOutAt && !row.checkOutLat"
                class="text-xs text-gray-400"
                title="Ditutup otomatis oleh sistem"
              >(otomatis)</span>
            </template>
            <template #cell-status="{ row }"><StatusBadge :status="row.status" /></template>
            <template #cell-activity="{ row }">
              <span class="block max-w-xs truncate text-gray-600" :title="row.activity ?? ''">{{ row.activity ?? '-' }}</span>
            </template>
            <template #cell-supervisor="{ row }"><span class="text-gray-600">{{ verifyLabel(row) }}</span></template>
          </DataTable>
        </div>
      </div>

      <!-- Kalender sidebar -->
      <div class="lg:col-span-1">
        <div class="card lg:sticky lg:top-6">
          <div class="mb-3 flex items-center justify-between">
            <button class="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-gray-600 transition hover:bg-ink-50" aria-label="Bulan sebelumnya" @click="prevMonth">
              <AppIcon name="chevronLeft" :size="16" />
            </button>
            <h3 class="text-sm font-semibold text-gray-800">{{ calMonthLabel }}</h3>
            <button class="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-gray-600 transition hover:bg-ink-50" aria-label="Bulan berikutnya" @click="nextMonth">
              <AppIcon name="chevronRight" :size="16" />
            </button>
          </div>

          <div v-if="calLoading" class="loading" />
          <template v-else>
            <div class="grid grid-cols-7 gap-1 text-center">
              <div
                v-for="w in WEEKDAYS"
                :key="w"
                class="text-[11px] font-medium"
                :class="w === 'Sab' || w === 'Min' ? 'text-red-500' : 'text-gray-500'"
              >
                {{ w }}
              </div>
              <div
                v-for="(cell, i) in calDays"
                :key="i"
                class="relative flex h-10 items-center justify-center rounded-md text-xs"
                :class="[
                  cell.day === 0 ? '' : cell.weekend ? 'bg-red-50 text-red-600' : 'text-gray-700',
                  cell.isToday ? 'ring-2 ring-primary-500 font-semibold' : '',
                ]"
                :title="cell.rec ? `${cell.iso} — ${cell.rec.status}` : cell.iso || ''"
              >
                <template v-if="cell.day !== 0">
                  {{ cell.day }}
                  <span
                    v-if="cell.rec"
                    class="absolute bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full"
                    :class="DOT_COLOR[cell.rec.status] ?? 'bg-ink-300'"
                  />
                </template>
              </div>
            </div>

            <div class="mt-3 space-y-1 border-t border-gray-100 pt-3 text-xs text-gray-600">
              <div class="flex items-center gap-2">
                <span class="h-2 w-2 rounded-full bg-info" /> Hadir: <strong class="ml-auto">{{ calSummary.HADIR }}</strong>
              </div>
              <div class="flex items-center gap-2">
                <span class="h-2 w-2 rounded-full bg-warn-400" /> Izin: <strong class="ml-auto">{{ calSummary.IZIN }}</strong>
              </div>
              <div class="flex items-center gap-2">
                <span class="h-2 w-2 rounded-full bg-ink-400" /> Sakit: <strong class="ml-auto">{{ calSummary.SAKIT }}</strong>
              </div>
              <div class="flex items-center gap-2">
                <span class="h-2 w-2 rounded-full bg-no" /> Alpha: <strong class="ml-auto">{{ calSummary.ALPHA }}</strong>
              </div>
            </div>
            <p class="mt-3 text-[11px] leading-relaxed text-gray-400">
              Hari libur ditandai merah. Titik berwarna menunjukkan status absensi pada tanggal tersebut.
            </p>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

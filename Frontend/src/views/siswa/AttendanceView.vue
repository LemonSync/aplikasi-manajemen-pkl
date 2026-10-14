<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { attendanceService, type AttendanceRecord } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import { useGeolocation } from '@/composables/useGeolocation';
import StatusBadge from '@/components/StatusBadge.vue';

type AttendanceStatus = 'HADIR' | 'IZIN' | 'SAKIT' | 'ALPHA';

const today = ref<AttendanceRecord | null>(null);
const history = ref<AttendanceRecord[]>([]);
const loading = ref(true);
const submitting = ref(false);
const error = ref('');
const success = ref('');
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

const ACTIVITY_LABEL: Record<AttendanceStatus, string> = {
  HADIR: 'Pelaksanaan Kegiatan',
  IZIN: 'Keterangan Izin',
  SAKIT: 'Keterangan Sakit (opsional)',
  ALPHA: '',
};

const ACTIVITY_PLACEHOLDER: Record<AttendanceStatus, string> = {
  HADIR: 'mis. membantu konfigurasi jaringan kantor, input data, desain grafis, dll.',
  IZIN: 'mis. mengurus administrasi di sekolah, keperluan keluarga, dll.',
  SAKIT: 'mis. demam, flu berat — boleh dikosongkan',
  ALPHA: '',
};

const hasSubmitted = computed(() => Boolean(today.value));

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    const [t, h] = await Promise.all([attendanceService.today(), attendanceService.listMine({ perPage: 50 })]);
    today.value = t;
    history.value = h;
  } catch (e) {
    error.value = extractErrorMessage(e);
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
    error.value = 'Bukti sakit harus berupa foto JPG/PNG atau PDF.';
    input.value = '';
    sickProof.value = null;
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    error.value = 'Ukuran bukti sakit maksimal 5 MB.';
    input.value = '';
    sickProof.value = null;
    return;
  }
  error.value = '';
  sickProof.value = file;
};

const submit = async (): Promise<void> => {
  error.value = '';
  success.value = '';

  if (status.value === 'HADIR' && !activity.value.trim()) {
    error.value = 'Pelaksanaan kegiatan wajib diisi saat status Hadir.';
    return;
  }
  if (status.value === 'IZIN' && !activity.value.trim()) {
    error.value = 'Keterangan izin wajib diisi saat status Izin.';
    return;
  }
  if (
    status.value === 'ALPHA' &&
    !window.confirm('Anda memilih status Absen (Alpha). Absensi akan langsung tercatat tanpa konfirmasi Guru Pembimbing. Lanjutkan?')
  ) {
    return;
  }

  submitting.value = true;
  try {
    let geo: { lat: number; long: number } | undefined;
    if (status.value === 'HADIR') {
      // HADIR: lokasi GPS wajib — hanya status ini yang merekam lokasi.
      const pos = await locate();
      geo = { lat: pos.lat, long: pos.long };
    }
    await attendanceService.submit({
      status: status.value,
      activity: activity.value.trim() || undefined,
      geo,
      sickProof: status.value === 'SAKIT' && sickProof.value ? sickProof.value : undefined,
    });
    success.value =
      status.value === 'ALPHA'
        ? 'Absensi Alpha berhasil dicatat otomatis.'
        : 'Absensi berhasil dikirim dan menunggu konfirmasi Guru Pembimbing.';
    activity.value = '';
    sickProof.value = null;
    const fileInput = document.querySelector<HTMLInputElement>('#sick-proof-input');
    if (fileInput) fileInput.value = '';
    await load();
    await loadCalendar();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    submitting.value = false;
  }
};

const formatTime = (value: string | null): string =>
  value ? new Date(value).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';

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
  HADIR: 'bg-blue-500',
  IZIN: 'bg-yellow-400',
  SAKIT: 'bg-gray-400',
  ALPHA: 'bg-red-500',
};

const loadCalendar = async (): Promise<void> => {
  calLoading.value = true;
  try {
    const from = `${calYear.value}-${String(calMonth.value + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(calYear.value, calMonth.value + 1, 0).getDate();
    const to = `${calYear.value}-${String(calMonth.value + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    calRecords.value = await attendanceService.listMine({ from, to, perPage: 100 });
  } catch (e) {
    error.value = extractErrorMessage(e);
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
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div class="space-y-6 lg:col-span-2">
        <div class="card">
          <h2 class="mb-4 text-lg font-semibold text-gray-800">Absensi Hari Ini</h2>
          <div v-if="loading" class="loading" />
          <template v-else>
            <div v-if="hasSubmitted" class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div class="rounded-lg border border-gray-200 p-3">
                <p class="text-xs text-gray-500">Status</p>
                <p class="text-sm font-medium"><StatusBadge :status="today?.status ?? '-'" /></p>
              </div>
              <div class="rounded-lg border border-gray-200 p-3">
                <p class="text-xs text-gray-500">Kirim pukul</p>
                <p class="text-sm font-medium">{{ formatTime(today?.checkInAt ?? null) }}</p>
              </div>
              <div class="rounded-lg border border-gray-200 p-3">
                <p class="text-xs text-gray-500">Konfirmasi Pembimbing</p>
                <p class="text-sm font-medium">{{ today ? verifyLabel(today) : '-' }}</p>
              </div>
            </div>

            <div v-if="today?.activity" class="mb-4 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
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
                <select v-model="status" class="input">
                  <option v-for="o in STATUS_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </div>

              <div v-if="status !== 'ALPHA'" class="mb-3">
                <label class="label">
                  {{ ACTIVITY_LABEL[status] }}
                  <span v-if="status === 'HADIR' || status === 'IZIN'" class="text-red-500">*</span>
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
                Lokasi GPS wajib direkam untuk status Hadir.
              </div>

              <button class="btn-primary" :disabled="submitting || locating" @click="submit">
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
            <div v-else class="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
              Anda sudah mengirim absensi hari ini. Absensi tidak dapat diubah atau dirapel.
            </div>
            <p class="mt-2 text-xs text-gray-400">
              Absensi Hadir diperiksa lokasinya lalu dikonfirmasi Guru Pembimbing. Status Alpha tercatat otomatis.
            </p>
          </template>
        </div>

        <div class="card">
          <h2 class="mb-4 text-lg font-semibold text-gray-800">Riwayat Absensi</h2>
          <table class="table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Kirim</th>
                <th>Status</th>
                <th>Keterangan</th>
                <th>Pembimbing</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in history" :key="a.id">
                <td>{{ new Date(a.date).toLocaleDateString('id-ID') }}</td>
                <td>{{ formatTime(a.checkInAt) }}</td>
                <td><StatusBadge :status="a.status" /></td>
                <td class="max-w-xs truncate text-gray-600" :title="a.activity ?? ''">{{ a.activity ?? '-' }}</td>
                <td class="text-gray-600">{{ verifyLabel(a) }}</td>
              </tr>
              <tr v-if="history.length === 0">
                <td colspan="5" class="py-4 text-center text-gray-400">Belum ada riwayat.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Kalender sidebar -->
      <div class="lg:col-span-1">
        <div class="card lg:sticky lg:top-6">
          <div class="mb-3 flex items-center justify-between">
            <button class="rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50" @click="prevMonth">
              &lsaquo;
            </button>
            <h3 class="text-sm font-semibold text-gray-800">{{ calMonthLabel }}</h3>
            <button class="rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50" @click="nextMonth">
              &rsaquo;
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
                class="relative flex h-8 items-center justify-center rounded-md text-xs"
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
                    :class="DOT_COLOR[cell.rec.status] ?? 'bg-gray-300'"
                  />
                </template>
              </div>
            </div>

            <div class="mt-3 space-y-1 border-t border-gray-100 pt-3 text-xs text-gray-600">
              <div class="flex items-center gap-2">
                <span class="h-2 w-2 rounded-full bg-blue-500" /> Hadir: <strong class="ml-auto">{{ calSummary.HADIR }}</strong>
              </div>
              <div class="flex items-center gap-2">
                <span class="h-2 w-2 rounded-full bg-yellow-400" /> Izin: <strong class="ml-auto">{{ calSummary.IZIN }}</strong>
              </div>
              <div class="flex items-center gap-2">
                <span class="h-2 w-2 rounded-full bg-gray-400" /> Sakit: <strong class="ml-auto">{{ calSummary.SAKIT }}</strong>
              </div>
              <div class="flex items-center gap-2">
                <span class="h-2 w-2 rounded-full bg-red-500" /> Alpha: <strong class="ml-auto">{{ calSummary.ALPHA }}</strong>
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

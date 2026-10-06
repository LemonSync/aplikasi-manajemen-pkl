<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
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
const { locate, loading: locating } = useGeolocation();

const STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: 'HADIR', label: 'Hadir' },
  { value: 'IZIN', label: 'Izin' },
  { value: 'SAKIT', label: 'Sakit' },
  { value: 'ALPHA', label: 'Absen' },
];

const hasSubmitted = computed(() => Boolean(today.value));

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    const [t, h] = await Promise.all([attendanceService.today(), attendanceService.listMine()]);
    today.value = t;
    history.value = h;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const submit = async (): Promise<void> => {
  if (!activity.value.trim()) {
    error.value = 'Pelaksanaan kegiatan wajib diisi.';
    return;
  }
  submitting.value = true;
  error.value = '';
  success.value = '';
  try {
    const geo = await locate();
    await attendanceService.submit({
      status: status.value,
      activity: activity.value.trim(),
      geo: { lat: geo.lat, long: geo.long },
    });
    success.value = 'Absensi berhasil dikirim dan menunggu konfirmasi DUDI.';
    activity.value = '';
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    submitting.value = false;
  }
};

const formatTime = (value: string | null): string =>
  value ? new Date(value).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';

const verifyLabel = (rec: AttendanceRecord): string => {
  if (rec.anomalyNote?.startsWith('Ditolak DUDI')) return 'Ditolak DUDI';
  return rec.verifiedById ? 'Terkonfirmasi DUDI' : 'Menunggu DUDI';
};

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

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
            <p class="text-xs text-gray-500">Konfirmasi DUDI</p>
            <p class="text-sm font-medium">{{ today ? verifyLabel(today) : '-' }}</p>
          </div>
        </div>

        <div v-if="today?.activity" class="mb-4 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <strong>Pelaksanaan kegiatan:</strong> {{ today.activity }}
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
          <div class="mb-3">
            <label class="label">Pelaksanaan Kegiatan</label>
            <textarea
              v-model="activity"
              class="input"
              rows="3"
              placeholder="mis. membantu konfigurasi jaringan kantor, input data, desain grafis, dll."
            />
          </div>
          <button class="btn-primary" :disabled="submitting || locating" @click="submit">
            {{ locating ? 'Mengambil lokasi...' : submitting ? 'Mengirim...' : 'Kirim Absensi' }}
          </button>
        </div>
        <div v-else class="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
          Anda sudah mengirim absensi hari ini. Absensi tidak dapat diubah atau dirapel.
        </div>
        <p class="mt-2 text-xs text-gray-400">
          Lokasi GPS Anda direkam saat mengirim absensi. Absensi akan dikonfirmasi oleh pembimbing DUDI.
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
            <th>Kegiatan</th>
            <th>DUDI</th>
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
</template>
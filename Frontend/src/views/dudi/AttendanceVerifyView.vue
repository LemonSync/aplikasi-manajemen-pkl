<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { attendanceService, type AttendanceRecord } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import StatusBadge from '@/components/StatusBadge.vue';
import LocationMapModal, { type MapPoint } from '@/components/LocationMapModal.vue';

const items = ref<AttendanceRecord[]>([]);
const loading = ref(true);
const error = ref('');
const success = ref('');
const rejecting = ref<Record<string, string>>({});
const busy = ref<Record<string, boolean>>({});

const mapOpen = ref(false);
const mapTitle = ref('');
const mapPoints = ref<MapPoint[]>([]);

const hasLocation = (r: AttendanceRecord): boolean => r.checkInLat != null || r.checkOutLat != null;

const openMap = (r: AttendanceRecord): void => {
  const name = r.user?.studentProfile?.fullName ?? r.user?.username ?? 'Siswa';
  const date = new Date(r.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  const points: MapPoint[] = [{ label: `Absen Masuk — ${date}`, lat: r.checkInLat, long: r.checkInLong, note: r.checkInNote }];
  if (r.checkOutAt) {
    points.push({ label: `Absen Keluar — ${date}`, lat: r.checkOutLat, long: r.checkOutLong, note: r.checkOutNote });
  }
  mapTitle.value = `Lokasi Presensi — ${name}`;
  mapPoints.value = points;
  mapOpen.value = true;
};

const coordText = (r: AttendanceRecord): string =>
  r.checkInLat != null && r.checkInLong != null ? `${Number(r.checkInLat).toFixed(5)}, ${Number(r.checkInLong).toFixed(5)}` : '';

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    const { items: rows } = await attendanceService.listForDudi();
    items.value = rows;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const verify = async (id: string, action: 'APPROVE' | 'REJECT'): Promise<void> => {
  const note = action === 'REJECT' ? rejecting.value[id] : undefined;
  if (action === 'REJECT' && !note) {
    error.value = 'Alasan penolakan wajib diisi.';
    return;
  }
  busy.value[id] = true;
  error.value = '';
  success.value = '';
  try {
    await attendanceService.verify(id, action, note);
    success.value = action === 'APPROVE' ? 'Absensi dikonfirmasi.' : 'Absensi ditolak.';
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    busy.value[id] = false;
  }
};

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Konfirmasi Absensi Siswa PKL</h2>
      <p class="mb-4 text-sm text-gray-500">
        Konfirmasi kehadiran harian siswa yang menjalankan PKL di perusahaan Anda.
      </p>
      <div v-if="loading" class="text-sm text-gray-500">Memuat...</div>
      <table v-else class="table">
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Siswa</th>
            <th>Kelompok</th>
            <th>Status</th>
            <th>Kegiatan</th>
            <th>Lokasi Presensi</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in items" :key="a.id">
            <td>{{ new Date(a.date).toLocaleDateString('id-ID') }}</td>
            <td>
              <div>{{ a.user?.studentProfile?.fullName ?? a.user?.username ?? '-' }}</div>
              <div v-if="a.user?.studentProfile?.fullName" class="font-mono text-xs text-gray-400">{{ a.user?.username }}</div>
            </td>
            <td class="text-gray-600">{{ a.group?.name ?? '-' }}</td>
            <td><StatusBadge :status="a.status" /></td>
            <td class="max-w-xs truncate text-gray-600" :title="a.activity ?? ''">{{ a.activity ?? '-' }}</td>
            <td>
              <template v-if="hasLocation(a)">
                <button
                  class="rounded-md bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
                  @click="openMap(a)"
                >
                  Peta Lokasi
                </button>
                <div class="mt-1 font-mono text-[11px] text-gray-400">{{ coordText(a) }}</div>
                <div v-if="a.isAnomaly" class="text-[11px] text-amber-600" :title="a.anomalyNote ?? ''">Lokasi dicurigai</div>
              </template>
              <span v-else class="text-xs text-gray-400">Tidak ada lokasi</span>
            </td>
            <td class="text-right">
              <template v-if="a.verifiedById">
                <span class="text-xs text-gray-500">
                  {{ a.anomalyNote?.startsWith('Ditolak DUDI') ? 'Ditolak' : 'Terkonfirmasi' }}
                </span>
              </template>
              <template v-else>
                <button class="text-primary-600 hover:underline disabled:opacity-50" :disabled="busy[a.id]" @click="verify(a.id, 'APPROVE')">
                  Konfirmasi
                </button>
                <span class="mx-1 text-gray-300">|</span>
                <button class="text-red-600 hover:underline disabled:opacity-50" :disabled="busy[a.id]" @click="verify(a.id, 'REJECT')">
                  Tolak
                </button>
                <input
                  v-model="rejecting[a.id]"
                  class="input mt-1 text-xs"
                  placeholder="Alasan penolakan (wajib jika menolak)"
                />
              </template>
            </td>
          </tr>
          <tr v-if="items.length === 0">
            <td colspan="7" class="py-4 text-center text-gray-400">Tidak ada absensi yang menunggu konfirmasi.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <LocationMapModal :open="mapOpen" :title="mapTitle" :points="mapPoints" @close="mapOpen = false" />
  </div>
</template>
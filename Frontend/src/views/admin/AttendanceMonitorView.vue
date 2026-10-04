<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  attendanceService,
  type AttendanceClassSection,
  type AttendanceGroupSection,
  type AttendanceRecord,
} from '@/services/api.service';
import { useCohortStore } from '@/stores/cohort.store';
import { extractErrorMessage } from '@/services/http';
import StatusBadge from '@/components/StatusBadge.vue';
import LocationMapModal, { type MapPoint } from '@/components/LocationMapModal.vue';

const classes = ref<AttendanceClassSection[]>([]);
const total = ref(0);
const summary = ref<Array<{ status: string; _count: number }>>([]);
const cohortStore = useCohortStore();
const loading = ref(true);
const error = ref('');
const filters = ref<{ status: string; from: string; to: string }>({
  status: '',
  from: '',
  to: '',
});

// Drill-down: level 1 (daftar kelas) -> level 2 (kelompok di kelas itu) -> detail siswa
const selectedClass = ref<string | null>(null);
const expandedKey = ref<string | null>(null);
const mapOpen = ref(false);
const mapTitle = ref('');
const mapPoints = ref<MapPoint[]>([]);

const currentClass = computed<AttendanceClassSection | null>(
  () => classes.value.find((c) => c.className === selectedClass.value) ?? null
);

const classTotals = (cls: AttendanceClassSection): { total: number; counts: Record<string, number> } => {
  let totalAbsen = 0;
  const counts: Record<string, number> = {};
  for (const g of cls.groups) {
    for (const s of g.students) {
      totalAbsen += s.total;
      for (const [k, v] of Object.entries(s.counts)) counts[k] = (counts[k] ?? 0) + v;
    }
  }
  return { total: totalAbsen, counts };
};

const groupTotals = (g: AttendanceGroupSection): { total: number; counts: Record<string, number> } => {
  let totalAbsen = 0;
  const counts: Record<string, number> = {};
  for (const s of g.students) {
    totalAbsen += s.total;
    for (const [k, v] of Object.entries(s.counts)) counts[k] = (counts[k] ?? 0) + v;
  }
  return { total: totalAbsen, counts };
};

const openClass = (className: string): void => {
  selectedClass.value = className;
  expandedKey.value = null;
};

const backToClasses = (): void => {
  selectedClass.value = null;
  expandedKey.value = null;
};

const studentKey = (groupId: string | null, userId: string): string => `${groupId ?? '-'}__${userId}`;

const toggle = (groupId: string | null, userId: string): void => {
  const key = studentKey(groupId, userId);
  expandedKey.value = expandedKey.value === key ? null : key;
};

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    const f = filters.value;
    const range = { ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}) };
    const [byClass, sum] = await Promise.all([
      attendanceService.byClass({
        ...range,
        ...(f.status ? { status: f.status } : {}),
        ...(cohortStore.activeCohortId ? { cohortId: cohortStore.activeCohortId } : {}),
      }),
      attendanceService.summary(range),
    ]);
    classes.value = byClass.classes;
    total.value = byClass.total;
    summary.value = sum;
    // Kelompok terpilih mungkin tidak ada di hasil filter baru
    if (selectedClass.value && !byClass.classes.some((c) => c.className === selectedClass.value)) {
      selectedClass.value = null;
      expandedKey.value = null;
    }
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const fmtTime = (value: string | null): string =>
  value ? new Date(value).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—';

const fmtDate = (value: string): string => new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

const hasLocation = (r: AttendanceRecord): boolean => r.checkInLat != null || r.checkOutLat != null;

const openMap = (r: AttendanceRecord, studentName: string): void => {
  const points: MapPoint[] = [
    { label: `Absen Masuk — ${fmtDate(r.date)}`, lat: r.checkInLat, long: r.checkInLong, note: r.checkInNote },
  ];
  if (r.checkOutAt) {
    points.push({ label: `Absen Keluar — ${fmtDate(r.date)}`, lat: r.checkOutLat, long: r.checkOutLong, note: r.checkOutNote });
  }
  mapTitle.value = `Lokasi Presensi — ${studentName}`;
  mapPoints.value = points;
  mapOpen.value = true;
};

const verificationLabel = (r: AttendanceRecord): { text: string; cls: string } => {
  if (r.verifiedById) {
    return r.anomalyNote?.startsWith('Ditolak DUDI')
      ? { text: 'Ditolak DUDI', cls: 'text-red-600' }
      : { text: 'Terkonfirmasi', cls: 'text-emerald-600' };
  }
  return { text: 'Menunggu konfirmasi', cls: 'text-gray-400' };
};

onMounted(async () => {
  await cohortStore.ensureLoaded();
  await load();
});

watch(
  () => cohortStore.activeCohortId,
  () => {
    selectedClass.value = null;
    expandedKey.value = null;
    void load();
  }
);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>

    <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div v-for="s in summary" :key="s.status" class="card">
        <p class="text-xs text-gray-500">{{ s.status }}</p>
        <p class="text-2xl font-semibold text-gray-800">{{ s._count }}</p>
      </div>
      <div v-if="summary.length === 0" class="card col-span-full text-sm text-gray-400">Belum ada data absensi.</div>
    </div>

    <div class="card">
      <!-- Filter -->
      <div class="mb-4 flex flex-wrap items-end gap-3">
        <div class="mr-auto">
          <h2 class="text-lg font-semibold text-gray-800">Monitoring Absensi</h2>
          <p class="text-sm text-gray-500">
            <template v-if="!selectedClass">Klik salah satu kelas untuk melihat daftar kelompoknya ({{ total }} absensi).</template>
            <template v-else>Kelas &rarr; kelompok &rarr; siswa ({{ total }} absensi).</template>
          </p>
        </div>
        <div>
          <label class="label">Status</label>
          <select v-model="filters.status" class="input max-w-[160px]" @change="load">
            <option value="">Semua Status</option>
            <option value="HADIR">Hadir</option>
            <option value="IZIN">Izin</option>
            <option value="SAKIT">Sakit</option>
            <option value="ALPHA">Alfa</option>
          </select>
        </div>
        <div>
          <label class="label">Dari</label>
          <input v-model="filters.from" type="date" class="input max-w-[170px]" @change="load" />
        </div>
        <div>
          <label class="label">Sampai</label>
          <input v-model="filters.to" type="date" class="input max-w-[170px]" @change="load" />
        </div>
      </div>

      <div v-if="loading" class="py-6 text-center text-sm text-gray-500">Memuat data absensi...</div>

      <!-- ============ LEVEL 1: DAFTAR KELAS ============ -->
      <template v-else-if="!selectedClass">
        <div v-if="classes.length === 0" class="py-6 text-center text-sm text-gray-400">Belum ada data absensi.</div>
        <table v-else class="table">
          <thead>
            <tr>
              <th>Nama Kelas</th>
              <th class="text-center">Siswa</th>
              <th class="text-center">Kelompok</th>
              <th class="text-center">Total Absensi</th>
              <th class="text-center">Hadir</th>
              <th class="text-center">Sakit</th>
              <th class="text-center">Izin</th>
              <th class="text-center">Alfa</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="cls in classes"
              :key="cls.className"
              class="cursor-pointer hover:bg-primary-50"
              @click="openClass(cls.className)"
            >
              <td>
                <span class="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-semibold text-primary-700">KELAS</span>
                <span class="ml-2 font-medium text-gray-800">{{ cls.className }}</span>
              </td>
              <td class="text-center">{{ cls.studentCount }}</td>
              <td class="text-center">{{ cls.groups.length }}</td>
              <td class="text-center font-semibold text-gray-800">{{ classTotals(cls).total }}</td>
              <td class="text-center">{{ classTotals(cls).counts['HADIR'] ?? 0 }}</td>
              <td class="text-center">{{ classTotals(cls).counts['SAKIT'] ?? 0 }}</td>
              <td class="text-center">{{ classTotals(cls).counts['IZIN'] ?? 0 }}</td>
              <td class="text-center">{{ classTotals(cls).counts['ALPHA'] ?? 0 }}</td>
              <td class="text-right text-primary-600">Buka &rarr;</td>
            </tr>
          </tbody>
        </table>
      </template>

      <!-- ============ LEVEL 2: KELOMPOK DI DALAM KELAS ============ -->
      <template v-else-if="currentClass">
        <div class="mb-4 flex flex-wrap items-center gap-3">
          <button class="btn-secondary" @click="backToClasses">&larr; Daftar Kelas</button>
          <div>
            <span class="rounded-full bg-primary-600 px-2 py-0.5 text-xs font-semibold text-white">KELAS</span>
            <span class="ml-2 text-base font-semibold text-gray-800">{{ currentClass.className }}</span>
            <span class="ml-3 text-sm text-gray-500">
              {{ currentClass.studentCount }} siswa &middot; {{ currentClass.groups.length }} kelompok
            </span>
          </div>
        </div>

        <div v-if="currentClass.groups.length === 0" class="py-6 text-center text-sm text-gray-400">
          Tidak ada kelompok dengan absensi di kelas ini.
        </div>

        <div
          v-for="g in currentClass.groups"
          :key="g.groupId ?? 'none'"
          class="mb-5 last:mb-0 rounded-lg border border-gray-200 p-4"
        >
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded-full bg-gray-700 px-2 py-0.5 text-xs font-semibold text-white">KELOMPOK</span>
              <p class="font-semibold text-gray-800">{{ g.groupName }}</p>
              <span v-if="g.companyName" class="text-sm text-gray-500">&mdash; {{ g.companyName }}</span>
              <!-- Penanda kelompok lintas kelas -->
              <span
                v-if="g.students.length < g.memberCount"
                class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                title="Sebagian anggota kelompok ini berada di kelas lain"
              >
                {{ g.students.length }} dari {{ g.memberCount }} anggota di kelas ini
              </span>
            </div>
            <span class="text-xs text-gray-500">
              {{ g.students.length }} siswa &middot; {{ groupTotals(g).total }} absensi
            </span>
          </div>

          <table class="table">
            <thead>
              <tr>
                <th class="w-8"></th>
                <th>Siswa</th>
                <th>NISN</th>
                <th class="text-center">Total</th>
                <th class="text-center">Hadir</th>
                <th class="text-center">Sakit</th>
                <th class="text-center">Izin</th>
                <th class="text-center">Alfa</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="s in g.students" :key="s.userId">
                <!-- ===== LEVEL 3: baris siswa (klik untuk detail) ===== -->
                <tr
                  class="cursor-pointer hover:bg-gray-50"
                  :class="{ 'bg-gray-50': expandedKey === studentKey(g.groupId, s.userId) }"
                  @click="toggle(g.groupId, s.userId)"
                >
                  <td class="text-gray-400">
                    <svg
                      class="h-4 w-4 transition-transform"
                      :class="{ 'rotate-90': expandedKey === studentKey(g.groupId, s.userId) }"
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    ><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                  </td>
                  <td>
                    <div class="font-medium text-gray-800">{{ s.fullName }}</div>
                    <div class="font-mono text-xs text-gray-400">{{ s.username }}</div>
                  </td>
                  <td class="font-mono text-sm text-gray-600">{{ s.nisn ?? '—' }}</td>
                  <td class="text-center font-semibold text-gray-800">{{ s.total }}</td>
                  <td class="text-center">{{ s.counts['HADIR'] ?? 0 }}</td>
                  <td class="text-center">{{ s.counts['SAKIT'] ?? 0 }}</td>
                  <td class="text-center">{{ s.counts['IZIN'] ?? 0 }}</td>
                  <td class="text-center">{{ s.counts['ALPHA'] ?? 0 }}</td>
                </tr>

                <!-- Detail absensi siswa -->
                <tr v-if="expandedKey === studentKey(g.groupId, s.userId)">
                  <td colspan="8" class="bg-gray-50 p-4">
                    <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Rincian absensi {{ s.fullName }} ({{ s.records.length }})
                    </p>
                    <table class="table">
                      <thead>
                        <tr>
                          <th>Tanggal</th>
                          <th>Masuk</th>
                          <th>Keluar</th>
                          <th>Status</th>
                          <th>Kegiatan</th>
                          <th>Verifikasi</th>
                          <th>Lokasi Presensi</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="r in s.records" :key="r.id">
                          <td class="whitespace-nowrap">{{ fmtDate(r.date) }}</td>
                          <td>{{ fmtTime(r.checkInAt) }}</td>
                          <td>{{ fmtTime(r.checkOutAt) }}</td>
                          <td>
                            <StatusBadge :status="r.status" />
                            <span v-if="r.isAnomaly" class="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700" :title="r.anomalyNote ?? ''">Anomali</span>
                          </td>
                          <td class="max-w-[260px] truncate text-gray-600" :title="r.activity ?? ''">{{ r.activity ?? '—' }}</td>
                          <td class="whitespace-nowrap text-sm" :class="verificationLabel(r).cls">{{ verificationLabel(r).text }}</td>
                          <td>
                            <button
                              v-if="hasLocation(r)"
                              class="rounded-md bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
                              @click.stop="openMap(r, s.fullName)"
                            >
                              Peta Lokasi
                            </button>
                            <span v-else class="text-xs text-gray-400">Tidak ada lokasi</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </template>
    </div>

    <LocationMapModal :open="mapOpen" :title="mapTitle" :points="mapPoints" @close="mapOpen = false" />
  </div>
</template>

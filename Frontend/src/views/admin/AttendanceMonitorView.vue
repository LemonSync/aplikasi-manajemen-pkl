<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  attendanceService,
  type AttendanceClassSection,
  type AttendanceGroupSection,
  type AttendanceRecord,
  type AttendanceStudentGroup,
} from '@/services/api.service';
import { useCohortStore } from '@/stores/cohort.store';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';
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
const search = ref('');

/**
 * Filter kelas/kelompok/siswa (FE-side, di luar filter status+tanggal server).
 * Kelas cocok nama → tampil utuh; jika tidak, tampil hanya kelompok/siswa yang cocok.
 */
const filteredClasses = computed<AttendanceClassSection[]>(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return classes.value;
  return classes.value
    .map((cls) => {
      if (cls.className.toLowerCase().includes(q)) return cls;
      const groups = cls.groups
        .map((g) => {
          if ([g.groupName, g.companyName ?? ''].join(' ').toLowerCase().includes(q)) return g;
          return {
            ...g,
            students: g.students.filter((s) =>
              [s.fullName, s.username, s.nisn ?? ''].join(' ').toLowerCase().includes(q)
            ),
          };
        })
        .filter((g) => g.students.length > 0);
      if (groups.length === 0) return null;
      return {
        ...cls,
        groups,
        studentCount: groups.reduce((acc, g) => acc + g.students.length, 0),
      };
    })
    .filter((cls): cls is AttendanceClassSection => cls !== null);
});

// Modal drill-down: kelas -> kelompok -> rincian siswa
const detailClass = ref<AttendanceClassSection | null>(null);
const detailGroup = ref<AttendanceGroupSection | null>(null);
const activeStudentId = ref<string | null>(null);
const activeStudent = computed<AttendanceStudentGroup | null>(
  () => detailGroup.value?.students.find((s) => s.userId === activeStudentId.value) ?? null
);

const mapOpen = ref(false);
const mapTitle = ref('');
const mapPoints = ref<MapPoint[]>([]);

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

const groupTotals = (g: AttendanceGroupSection): { total: number } => ({
  total: g.students.reduce((acc, s) => acc + s.total, 0),
});

const openClass = (cls: AttendanceClassSection): void => {
  detailClass.value = cls;
};
const openGroup = (g: AttendanceGroupSection): void => {
  detailGroup.value = g;
  activeStudentId.value = null;
};
const openStudent = (s: AttendanceStudentGroup): void => {
  activeStudentId.value = s.userId;
};
const closeModals = (): void => {
  detailClass.value = null;
  detailGroup.value = null;
  activeStudentId.value = null;
};

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    const f = filters.value;
    const range = { ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}) };
    const cohortId = cohortStore.activeCohortId || undefined;
    const [byClass, sum] = await Promise.all([
      attendanceService.byClass({
        ...range,
        ...(f.status ? { status: f.status } : {}),
        ...(cohortId ? { cohortId } : {}),
      }),
      attendanceService.summary({ ...range, ...(cohortId ? { cohortId } : {}) }),
    ]);
    classes.value = byClass.classes;
    total.value = byClass.total;
    summary.value = sum;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const fmtTime = (value: string | null): string =>
  value ? new Date(value).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—';

const fmtDate = (value: string): string =>
  new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

const hasLocation = (r: AttendanceRecord): boolean => r.checkInLat != null || r.checkOutLat != null;

const openMap = (r: AttendanceRecord, studentName: string): void => {
  const points: MapPoint[] = [
    { label: `Masuk — ${fmtDate(r.date)}`, lat: r.checkInLat, long: r.checkInLong, note: r.checkInNote },
  ];
  if (r.checkOutAt) {
    points.push({ label: `Keluar — ${fmtDate(r.date)}`, lat: r.checkOutLat, long: r.checkOutLong, note: r.checkOutNote });
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
    closeModals();
    void load();
  }
);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>

    <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div v-for="s in summary" :key="s.status" class="card">
        <p class="text-xs text-gray-500">{{ s.status }}</p>
        <p class="text-2xl font-semibold text-gray-800">{{ s._count }}</p>
      </div>
      <div v-if="summary.length === 0" class="card col-span-full text-sm text-gray-400">Belum ada data absensi.</div>
    </div>

    <div class="card">
      <div class="mb-4 flex flex-wrap items-end gap-3">
        <div class="mr-auto">
          <h2 class="text-lg font-semibold text-gray-800">Monitoring Absensi</h2>
          <p class="text-sm text-gray-500">{{ total }} absensi</p>
        </div>
        <div>
          <label class="label">Cari</label>
          <input
            v-model="search"
            class="input max-w-[240px]"
            type="search"
            placeholder="Kelas, kelompok, nama, NISN…"
          />
        </div>
        <div>
          <label class="label">Status</label>
          <select v-model="filters.status" class="input max-w-[160px]" @change="load">
            <option value="">Semua</option>
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

      <SkeletonTable v-if="loading" :rows="6" :cols="6" />
      <div v-else-if="classes.length === 0" class="py-6 text-center text-sm text-gray-400">Belum ada data absensi.</div>
      <div v-else-if="filteredClasses.length === 0" class="py-6 text-center text-sm text-gray-400">
        Tidak ada data yang cocok dengan pencarian.
      </div>
      <table v-else class="table">
        <thead>
          <tr>
            <th>Kelas</th>
            <th class="text-center">Siswa</th>
            <th class="text-center">Kelompok</th>
            <th class="text-center">Total</th>
            <th class="text-center">Hadir</th>
            <th class="text-center">Sakit</th>
            <th class="text-center">Izin</th>
            <th class="text-center">Alfa</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="cls in filteredClasses"
            :key="cls.className"
            class="cursor-pointer hover:bg-gray-50"
            @click="openClass(cls)"
          >
            <td class="font-medium text-gray-800">{{ cls.className }}</td>
            <td class="text-center">{{ cls.studentCount }}</td>
            <td class="text-center">{{ cls.groups.length }}</td>
            <td class="text-center font-semibold text-gray-800">{{ classTotals(cls).total }}</td>
            <td class="text-center">{{ classTotals(cls).counts['HADIR'] ?? 0 }}</td>
            <td class="text-center">{{ classTotals(cls).counts['SAKIT'] ?? 0 }}</td>
            <td class="text-center">{{ classTotals(cls).counts['IZIN'] ?? 0 }}</td>
            <td class="text-center">{{ classTotals(cls).counts['ALPHA'] ?? 0 }}</td>
            <td class="text-right text-primary-600">Buka</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal kelas: daftar kelompok + siswa -->
    <Modal
      :open="!!detailClass"
      :title="detailClass?.className ?? 'Kelas'"
      size="xl"
      @close="detailClass = null"
    >
      <template v-if="detailClass">
        <p class="mb-4 text-sm text-gray-500">
          {{ detailClass.studentCount }} siswa · {{ detailClass.groups.length }} kelompok
        </p>
        <div
          v-for="g in detailClass.groups"
          :key="g.groupId ?? 'none'"
          class="mb-4 border border-gray-200 p-3 last:mb-0"
        >
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <button class="text-left font-semibold text-gray-800 hover:text-primary-700" @click="openGroup(g)">
              {{ g.groupName }}
              <span v-if="g.companyName" class="text-sm font-normal text-gray-500">— {{ g.companyName }}</span>
            </button>
            <span class="flex items-center gap-2 text-xs text-gray-500">
              <span
                v-if="g.students.length < g.memberCount"
                class="badge bg-amber-100 text-amber-700"
                title="Sebagian anggota di kelas lain"
              >
                {{ g.students.length }}/{{ g.memberCount }} di kelas ini
              </span>
              {{ g.students.length }} siswa · {{ groupTotals(g).total }} absensi
            </span>
          </div>
          <table class="table">
            <thead>
              <tr>
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
              <tr
                v-for="s in g.students"
                :key="s.userId"
                class="cursor-pointer hover:bg-gray-50"
                @click="openStudent(s)"
              >
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
            </tbody>
          </table>
        </div>
        <p v-if="detailClass.groups.length === 0" class="py-4 text-center text-sm text-gray-400">
          Tidak ada kelompok dengan absensi di kelas ini.
        </p>
      </template>
    </Modal>

    <!-- Modal rincian absensi siswa -->
    <Modal :open="!!activeStudent" :title="activeStudent?.fullName ?? 'Absensi'" size="xl" @close="activeStudentId = null">
      <template v-if="activeStudent">
        <p class="mb-3 font-mono text-xs text-gray-400">
          {{ activeStudent.username }} · {{ activeStudent.nisn ?? '—' }} · {{ activeStudent.records.length }} absensi
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
              <th>Lokasi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in activeStudent.records" :key="r.id">
              <td class="whitespace-nowrap">{{ fmtDate(r.date) }}</td>
              <td>{{ fmtTime(r.checkInAt) }}</td>
              <td>{{ fmtTime(r.checkOutAt) }}</td>
              <td>
                <StatusBadge :status="r.status" />
                <span v-if="r.isAnomaly" class="ml-1 bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700" :title="r.anomalyNote ?? ''">
                  Anomali
                </span>
              </td>
              <td class="max-w-[220px] truncate text-gray-600" :title="r.activity ?? ''">{{ r.activity ?? '—' }}</td>
              <td class="whitespace-nowrap text-sm" :class="verificationLabel(r).cls">{{ verificationLabel(r).text }}</td>
              <td>
                <button
                  v-if="hasLocation(r)"
                  class="bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
                  @click="openMap(r, activeStudent.fullName)"
                >
                  Peta
                </button>
                <span v-else class="text-xs text-gray-400">—</span>
              </td>
            </tr>
            <tr v-if="activeStudent.records.length === 0">
              <td colspan="7" class="py-3 text-center text-gray-400">Belum ada absensi.</td>
            </tr>
          </tbody>
        </table>
      </template>
    </Modal>

    <LocationMapModal :open="mapOpen" :title="mapTitle" :points="mapPoints" @close="mapOpen = false" />
  </div>
</template>

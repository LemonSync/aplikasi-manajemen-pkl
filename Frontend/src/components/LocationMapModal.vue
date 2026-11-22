<script setup lang="ts">
import { computed } from 'vue';

export interface MapPoint {
  label: string;
  lat: string | number | null;
  long: string | number | null;
  note?: string | null;
  /** Radius kesalahan pembacaan GPS (meter) seperti dilaporkan browser. */
  accuracy?: number | null;
}

const props = defineProps<{
  open: boolean;
  title: string;
  points: MapPoint[];
}>();

const emit = defineEmits<{ close: [] }>();

interface ResolvedPoint extends MapPoint {
  valid: boolean;
  la: number;
  lo: number;
}

const parsed = computed<ResolvedPoint[]>(() =>
  props.points.map((p) => {
    const la = Number(p.lat);
    const lo = Number(p.long);
    const valid =
      Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && !(la === 0 && lo === 0);
    return { ...p, valid, la, lo };
  })
);

/**
 * Jendela peta dibuat minimal selebar radius akurasi. Tanpa ini, peta yang di-zoom
 * rapat ke satu blok menyiratkan presisi yang sebenarnya tidak dimiliki titiknya.
 */
const halfSpan = (p: ResolvedPoint): { lat: number; long: number } => {
  const meters = p.accuracy && p.accuracy > 0 ? p.accuracy : 0;
  const latHalf = Math.max(0.003, meters / 111320);
  const metersPerDegLon = 111320 * Math.max(0.2, Math.cos((p.la * Math.PI) / 180));
  return { lat: latHalf, long: Math.max(0.004, meters / metersPerDegLon) };
};

const osmEmbedUrl = (p: ResolvedPoint): string => {
  const span = halfSpan(p);
  const bbox = [p.lo - span.long, p.la - span.lat, p.lo + span.long, p.la + span.lat]
    .map((v) => v.toFixed(6))
    .join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${p.la},${p.lo}`;
};

const googleMapsUrl = (p: ResolvedPoint): string => `https://www.google.com/maps?q=${p.la},${p.lo}`;

const formatCoord = (p: ResolvedPoint): string => `${p.la.toFixed(6)}, ${p.lo.toFixed(6)}`;

const accuracyText = (p: ResolvedPoint): string | null =>
  p.accuracy === null || p.accuracy === undefined ? null : `±${Math.round(p.accuracy)} m`;

const accuracyClass = (meters: number): string =>
  meters <= 50
    ? 'bg-emerald-100 text-emerald-700'
    : meters <= 150
      ? 'bg-amber-100 text-amber-700'
      : 'bg-red-100 text-red-700';
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="emit('close')">
    <div class="card max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto">
      <div class="flex items-start justify-between">
        <div>
          <h3 class="text-lg font-semibold text-gray-800">{{ title }}</h3>
          <p class="text-sm text-gray-500">Lokasi GPS yang dikirim siswa saat presensi.</p>
        </div>
        <button class="btn-secondary" @click="emit('close')">Tutup</button>
      </div>

      <div v-for="(p, i) in parsed" :key="i" class="rounded-lg border border-gray-200 p-3">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="text-sm font-semibold text-gray-800">{{ p.label }}</p>
            <p v-if="p.note" class="text-xs text-gray-500">Catatan: {{ p.note }}</p>
          </div>
          <div v-if="p.valid" class="flex items-center gap-2">
            <p class="font-mono text-xs text-gray-600">{{ formatCoord(p) }}</p>
            <span
              v-if="accuracyText(p)"
              class="rounded-full px-2 py-0.5 text-xs font-medium"
              :class="accuracyClass(p.accuracy as number)"
              :title="'Perkiraan kesalahan pembacaan GPS: ' + accuracyText(p) + '. Titik sebenarnya berada di dalam lingkaran sejarak itu.'"
            >
              {{ accuracyText(p) }}
            </span>
            <span v-else class="text-xs text-gray-400" title="Perangkat tidak melaporkan radius akurasi.">
              akurasi tidak dilaporkan
            </span>
          </div>
        </div>

        <template v-if="p.valid">
          <iframe
            :src="osmEmbedUrl(p)"
            class="h-64 w-full rounded-lg border border-gray-200"
            loading="lazy"
            :title="p.label"
          ></iframe>
          <a :href="googleMapsUrl(p)" target="_blank" rel="noopener" class="mt-2 inline-block text-sm text-primary-600 hover:underline">
            Buka di Google Maps &rarr;
          </a>
        </template>
        <p v-else class="text-sm text-gray-400">Lokasi tidak tersedia untuk titik ini.</p>
      </div>

      <div v-if="parsed.length === 0" class="py-4 text-center text-sm text-gray-400">Tidak ada titik lokasi.</div>
    </div>
  </div>
</template>

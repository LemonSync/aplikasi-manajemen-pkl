<script setup lang="ts">
import { computed } from 'vue';

export interface MapPoint {
  label: string;
  lat: string | number | null;
  long: string | number | null;
  note?: string | null;
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

const osmEmbedUrl = (p: ResolvedPoint): string =>
  `https://www.openstreetmap.org/export/embed.html?bbox=${p.lo - 0.004},${p.la - 0.003},${p.lo + 0.004},${p.la + 0.003}&layer=mapnik&marker=${p.la},${p.lo}`;

const googleMapsUrl = (p: ResolvedPoint): string => `https://www.google.com/maps?q=${p.la},${p.lo}`;

const formatCoord = (p: ResolvedPoint): string => `${p.la.toFixed(6)}, ${p.lo.toFixed(6)}`;
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
          <p v-if="p.valid" class="font-mono text-xs text-gray-600">{{ formatCoord(p) }}</p>
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

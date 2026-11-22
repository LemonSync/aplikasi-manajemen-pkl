<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { HOST_NAME, type HostPose } from '@/config/hostDialogs';

/**
 * Maskot pemandu alur PKL.
 *
 * Setiap kalimat punya kuncinya sendiri (`art` → `public/host/{art}.png`); kalau
 * file itu belum ada, gambar jatuh ke enam pose umum di `public/host/`, dan baru
 * ke kartu inisial. Seluruh panggung jadi tetap bisa dipakai sebelum aset
 * ilustrasi selesai.
 */
const props = withDefaults(
  defineProps<{
    pose?: HostPose;
    /** Kunci gambar khusus satu kalimat (`public/host/{art}.png`). */
    art?: string;
    size?: 'badge' | 'md' | 'lg';
    enter?: boolean;
    pulse?: boolean;
  }>(),
  { pose: 'idle', art: undefined, size: 'md', enter: false, pulse: false }
);

/**
 * Rantai gambar: ilustrasi khusus kalimat (`art`) → enam pose umum → kartu
 * inisial. Berkat itu aset boleh dibuat bertahap — kalimat yang gambarnya belum
 * ada tetap punya wajah, hanya saja Julie memakai pose umumnya.
 */
/**
 * Kunci gambar yang sudah terbukti tidak ada di sesi ini. Kalimat yang sama bisa
 * muncul berulang (balik ke panggung, refresh status), dan tanpa catatan ini
 * browser akan menembak file yang sama lalu gagal lagi setiap kali.
 */
const knownMissing = new Set<string>();

const artUsable = (art?: string) => !!art && !knownMissing.has(art);
const level = ref(artUsable(props.art) ? 2 : 1);
watch(
  () => [props.art, props.pose],
  () => {
    level.value = artUsable(props.art) ? 2 : 1;
  }
);

/** Gambar khusus kalimat gagal → coba pose umum; pose umum gagal → kartu inisial. */
const onImageError = (): void => {
  if (level.value === 2 && props.art) knownMissing.add(props.art);
  level.value -= 1;
};

const source = computed(() =>
  level.value === 2 ? `/host/${props.art}.png` : `/host/${props.pose}.png`
);
const showImage = computed(() => level.value > 0);

/** Dua huruf pertama nama host — kartu cadangan ikut berganti kalau nama berganti. */
const initials = computed(() =>
  HOST_NAME.split(/\s+/)
    .map((kata) => kata[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
);

/**
 * Kanvas potret 3:4 — sama seperti rasio aset di `public/host/`, jadi badan
 * maskot tampil utuh tanpa ruang kosong di kiri-kanan. Badge tetap persegi dan
 * memotong ke arah kepala (avatar), bukan mengecilkan seluruh badan.
 */
const box = computed(() =>
  props.size === 'badge'
    ? 'h-8 w-8 text-[9px]'
    : props.size === 'lg'
      ? 'h-40 w-[7.5rem] sm:h-56 sm:w-[10.5rem] text-2xl'
      : 'h-32 w-24 sm:h-44 sm:w-[8.25rem] text-xl'
);

/** Bingkai terang: latar ilustrasi apa pun (transparan maupun putih) terlihat sengaja. */
const frame = computed(() =>
  props.size === 'badge' ? 'border border-line-strong' : 'border-2 border-white/30 shadow-md'
);
const fit = computed(() => (props.size === 'badge' ? 'object-cover object-top' : 'object-contain object-bottom'));
</script>

<template>
  <span
    class="block shrink-0 overflow-hidden bg-white select-none"
    :class="[box, frame, pulse ? 'animate-pulse-ring' : '']"
  >
    <img
      v-if="showImage"
      :key="source"
      :src="source"
      :alt="`Maskot ${HOST_NAME}`"
      class="h-full w-full"
      :class="[fit, enter ? 'animate-host-in' : '']"
      loading="lazy"
      decoding="async"
      draggable="false"
      @error="onImageError"
    />
    <span
      v-else
      aria-hidden="true"
      class="flex h-full w-full items-end justify-center bg-gradient-to-br from-primary-600 to-primary-900 pb-[12%] font-bold tracking-wider text-white"
    >{{ initials }}</span>
  </span>
</template>

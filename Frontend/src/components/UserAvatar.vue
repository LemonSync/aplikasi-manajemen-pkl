<script setup lang="ts">
import { computed } from 'vue';

/**
 * Avatar pengguna.
 *
 * Foto profil belum disimpan per akun, jadi gambar dipilih deterministik dari
 * `seed` (username = NIP/NISN): orang yang sama selalu mendapat avatar yang
 * sama di navbar, dashboard, dan halaman lain.
 */
const AVATAR_COUNT = 16;

const props = defineProps<{ seed?: string }>();

const source = computed(() => {
  const seed = props.seed ?? '';
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return `/avatars/a${(hash % AVATAR_COUNT) + 1}.jpg`;
});
</script>

<template>
  <img
    :src="source"
    :alt="`Avatar ${seed ?? ''}`.trim()"
    class="shrink-0 select-none rounded-full bg-white/10 object-cover"
    loading="lazy"
    decoding="async"
    draggable="false"
  />
</template>

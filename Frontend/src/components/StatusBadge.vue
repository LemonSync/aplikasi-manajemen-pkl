<script setup lang="ts">
import { computed } from 'vue';

/**
 * Badge status generik (warna otomatis berdasarkan status).
 */
const props = defineProps<{ status: string }>();

const colorClass = computed<string>(() => {
  const s = props.status.toUpperCase();
  if (['DISETUJUI', 'SELESAI', 'AKTIF', 'APPROVED'].includes(s)) {
    return 'bg-emerald-100 text-emerald-700';
  }
  if (['DITOLAK', 'REJECTED', 'GAGAL'].includes(s)) {
    return 'bg-red-100 text-red-700';
  }
  if (['MENUNGGU_VERIFIKASI', 'DIAJUKAN', 'MENUNGGU'].includes(s)) {
    return 'bg-amber-100 text-amber-700';
  }
  if (['DRAFT'].includes(s)) {
    return 'bg-gray-100 text-gray-600';
  }
  return 'bg-primary-100 text-primary-700';
});
</script>

<template>
  <span class="badge" :class="colorClass">{{ status }}</span>
</template>
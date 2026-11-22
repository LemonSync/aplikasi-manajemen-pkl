<script setup lang="ts">
import { computed } from 'vue';

/**
 * Badge status generik (warna otomatis berdasarkan status).
 * Enum Indonesia dibiarkan apa adanya — yang berubah hanya pemetaan warnanya.
 */
const props = defineProps<{ status: string }>();

const tone = computed<string>(() => {
  const s = props.status.toUpperCase();
  if (['DISETUJUI', 'SELESAI', 'AKTIF', 'APPROVED', 'DIVERIFIKASI', 'VALID'].includes(s)) {
    return 'bg-ok-soft text-ok';
  }
  if (['DITOLAK', 'REJECTED', 'GAGAL', 'KADALUWARSA'].includes(s)) {
    return 'bg-no-soft text-no';
  }
  if (['MENUNGGU_VERIFIKASI', 'MENUNGGU_APPROVAL', 'DIAJUKAN', 'MENUNGGU', 'PROSES', 'BERLANGSUNG'].includes(s)) {
    return 'bg-warn-soft text-warn';
  }
  if (['DRAFT', 'DIBATALKAN', 'TIDAK_BERLAKU', 'NONAKTIF', 'BELUM'].includes(s)) {
    return 'bg-raise text-ink-600';
  }
  return 'bg-primary-50 text-primary-700';
});
</script>

<template>
  <span class="badge" :class="tone">{{ status }}</span>
</template>

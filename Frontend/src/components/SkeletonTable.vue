<script setup lang="ts">
withDefaults(defineProps<{ rows?: number; cols?: number }>(), { rows: 6, cols: 4 });

/** Lebar kolom per posisi: kolom pertama teks panjang, sisanya potongan angka. */
const widths = ['flex-1', 'w-24', 'w-20', 'w-28', 'w-16', 'w-24'];
</script>

<template>
  <div class="space-y-2 py-2" role="status" aria-live="polite" aria-label="Memuat data">
    <div class="flex items-center gap-3 border-b border-ink-100 pb-2">
      <div v-for="c in cols" :key="`head-${c}`" class="skeleton h-3 opacity-70" :class="widths[(c - 1) % widths.length]" />
    </div>
    <!-- .stagger: tiap baris menyusul 40ms lebih lambat, jadi daftar terasa
         "diisi" alih-alih muncul sekaligus-seolah-jaringan-pelan -->
    <div class="stagger space-y-2">
      <div v-for="r in rows" :key="r" class="flex items-center gap-3">
        <div v-for="c in cols" :key="c" class="skeleton h-4" :class="widths[(c - 1) % widths.length]" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <div class="flex min-h-[60vh] flex-col items-center justify-center text-center">
    <p class="text-6xl font-bold text-red-500">403</p>
    <h1 class="mt-4 text-xl font-semibold text-gray-800">Akses Ditolak</h1>
    <p class="mt-2 text-sm text-gray-500">
      Anda tidak memiliki hak akses untuk halaman ini, atau halaman ini tidak tersedia pada fase Anda.
    </p>
    <RouterLink :to="{ name: 'dashboard' }" class="btn-primary mt-6">Kembali ke Dashboard</RouterLink>
  </div>
</template>

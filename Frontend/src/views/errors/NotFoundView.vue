<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center bg-gray-100 text-center">
    <p class="text-6xl font-bold text-primary-500">404</p>
    <h1 class="mt-4 text-xl font-semibold text-gray-800">Halaman Tidak Ditemukan</h1>
    <p class="mt-2 text-sm text-gray-500">Halaman yang Anda cari tidak tersedia.</p>
    <RouterLink :to="{ name: 'dashboard' }" class="btn-primary mt-6">Kembali ke Dashboard</RouterLink>
  </div>
</template>

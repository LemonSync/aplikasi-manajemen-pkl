<script setup lang="ts">
withDefaults(defineProps<{ rows?: number; cols?: number }>(), { rows: 6, cols: 4 });
</script>

<template>
  <div class="space-y-3 py-2">
    <div v-for="r in rows" :key="r" class="flex items-center gap-3">
      <div class="skeleton h-4 flex-1" />
      <div v-for="c in cols - 1" :key="c" class="skeleton h-4 w-24" />
    </div>
  </div>
</template>

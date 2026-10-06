<script setup lang="ts">
withDefaults(defineProps<{ label?: string; inline?: boolean }>(), { label: '', inline: false });
</script>

<template>
  <div
    :class="inline ? 'inline-flex items-center gap-2' : 'flex flex-col items-center justify-center gap-3 py-8'"
  >
    <svg class="h-6 w-6 animate-spin text-primary-600" viewBox="0 0 24 24" fill="none">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
    <span v-if="label" class="text-sm text-gray-500">{{ label }}</span>
  </div>
</template>

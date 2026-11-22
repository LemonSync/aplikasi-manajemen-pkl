<script setup lang="ts">
defineProps<{ label: string; htmlFor?: string; error?: string; required?: boolean; hint?: string }>();
</script>

<template>
  <div>
    <label :for="htmlFor" class="label">
      {{ label }}
      <span v-if="required" class="text-red-600" aria-hidden="true">*</span>
    </label>
    <slot />
    <p v-if="hint && !error" class="mt-1 text-[12px] text-ink-500">{{ hint }}</p>
    <p v-if="error" class="mt-1 text-[12px] font-medium text-red-700" role="alert">{{ error }}</p>
  </div>
</template>

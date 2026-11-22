<script setup lang="ts">
import AppIcon from './AppIcon.vue';

withDefaults(defineProps<{ title: string; icon?: string; description?: string }>(), {
  icon: 'inbox',
});
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
    <span class="empty-icon flex h-11 w-11 items-center justify-center rounded-none bg-primary-50 text-primary-600">
      <AppIcon :name="icon" :size="20" />
    </span>
    <p class="text-sm font-semibold text-ink-800">{{ title }}</p>
    <p v-if="description" class="max-w-sm text-[13px] leading-relaxed text-ink-500">{{ description }}</p>
    <div v-if="$slots.action" class="mt-2">
      <slot name="action" />
    </div>
  </div>
</template>

<style scoped>
/* Naik-turun pelan: menandakan keadaan kosong yang menunggu, bukan error. */
.empty-icon {
  animation: empty-bob 3.2s var(--ease-in-out) infinite;
  box-shadow: 0 0 0 1px rgb(var(--p-200) / 0.9);
}

@keyframes empty-bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}
</style>

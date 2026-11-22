<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>();
</script>

<template>
  <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
    <div class="min-w-0" data-reveal="left">
      <nav v-if="$slots.breadcrumb" aria-label="Breadcrumb" class="mb-1 text-[12px] text-ink-500">
        <slot name="breadcrumb" />
      </nav>
      <h2 class="flex items-start gap-2.5 text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">
        <span class="mt-1 h-[1.15em] w-[3px] shrink-0 bg-gradient-to-b from-primary-500 to-accent" aria-hidden="true" />
        <span>{{ title }}</span>
      </h2>
      <p v-if="subtitle" class="mt-1 max-w-2xl pl-[13px] text-[13px] leading-relaxed text-ink-500">
        {{ subtitle }}
      </p>
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 flex-wrap items-center gap-2" data-reveal="right">
      <slot name="actions" />
    </div>
  </div>
</template>

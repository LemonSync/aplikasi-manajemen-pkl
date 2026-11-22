<script setup lang="ts">
withDefaults(defineProps<{ label?: string; inline?: boolean }>(), { label: '', inline: false });
</script>

<template>
  <div
    :class="
      inline
        ? 'inline-flex items-center gap-2'
        : 'flex flex-col items-center justify-center gap-3 py-8'
    "
  >
    <span
      :class="
        inline
          ? 'relative inline-flex h-4 w-4'
          : 'relative inline-flex h-7 w-7 text-primary-600'
      "
    >
      <!-- Dua cincin berlawanan dengan durasi berbeda: mata tidak pernah menebak
         titik mana yang "selesai", jadi prosesnya terasa berjalan terus. -->
      <span
        class="spinner-ring"
        :style="{ animationDuration: inline ? '0.7s' : '0.9s' }"
        aria-hidden="true"
      />
      <span
        class="spinner-ring inner"
        :style="{ animationDuration: inline ? '1.1s' : '1.4s' }"
        aria-hidden="true"
      />
    </span>
    <span v-if="label" class="text-sm text-gray-500">{{ label }}</span>
  </div>
</template>

<style scoped>
.spinner-ring {
  position: absolute;
  inset: 0;
  /* Bulat penuh, bukan radius token: dengan --r-* = 0 elemen ini jadi persegi
     yang berputar. */
  border-radius: var(--r-full);
  border: 2px solid currentColor;
  border-top-color: transparent;
  opacity: 0.85;
  animation-name: spinner-spin;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
.spinner-ring.inner {
  inset: 3px;
  border-bottom-color: transparent;
  border-top-color: currentColor;
  opacity: 0.4;
  animation-name: spinner-spin-rev;
}

@keyframes spinner-spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes spinner-spin-rev {
  to {
    transform: rotate(-360deg);
  }
}
</style>

<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import { toast, type ToastKind } from '@/composables/useToast';

const ICONS: Record<ToastKind, string> = { success: 'checkCircle', error: 'alert', info: 'info' };
const TONES: Record<ToastKind, string> = {
  success: 'bg-ok-soft text-ok',
  error: 'bg-no-soft text-no',
  info: 'bg-info-soft text-info',
};
const BARS: Record<ToastKind, string> = {
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  info: 'bg-info-500',
};
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed z-toast flex flex-col-reverse gap-2 inset-x-4 bottom-4 sm:inset-x-auto sm:right-6 sm:bottom-auto sm:top-[4.5rem] sm:w-[22rem] sm:flex-col"
      role="region"
      aria-live="polite"
      aria-label="Notifikasi"
    >
      <TransitionGroup name="toast">
        <div
          v-for="t in toast.items"
          :key="t.id"
          class="toast-card pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-none bg-surface p-3 pr-2 shadow-lg ring-1 ring-black/5"
        >
          <span class="absolute inset-y-0 left-0 w-[3px]" :class="BARS[t.kind]" aria-hidden="true" />
          <span
            class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-none"
            :class="TONES[t.kind]"
          >
            <AppIcon :name="ICONS[t.kind]" :size="15" />
          </span>
          <p class="flex-1 text-[13px] leading-relaxed text-ink-800">{{ t.message }}</p>
          <button
            type="button"
            class="shrink-0 rounded-none p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
            aria-label="Tutup notifikasi"
            @click="toast.dismiss(t.id)"
          >
            <AppIcon name="close" :size="14" />
          </button>
          <!-- Hitung mundur visual: panjangnya adalah sisa waktu sebelum pesan ini hilang -->
          <span
            class="toast-drain absolute bottom-0 left-0 h-[2px] w-full origin-left opacity-40"
            :class="BARS[t.kind]"
            :style="{ animationDuration: `${t.ttl}ms` }"
            aria-hidden="true"
          />
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active {
  transition: opacity var(--dur) var(--ease-out), transform var(--dur-slow) var(--ease-spring);
}
.toast-leave-active {
  transition: opacity var(--dur-fast) var(--ease-in),
    transform var(--dur-fast) var(--ease-in), margin-top var(--dur-fast) var(--ease-in);
}
.toast-enter-from {
  opacity: 0;
  transform: translate3d(0, -14px, 0) scale(0.96);
}
.toast-leave-to {
  opacity: 0;
  /* Ditutup ke atas lalu ruangannya dikempiskan lewat margin, jadi toast di
     bawahnya tidak melompat saat satu pesan hilang. */
  transform: translate3d(24px, 0, 0);
  margin-bottom: -0.5rem;
  position: absolute;
  inset-inline: 0;
}
.toast-move {
  transition: transform var(--dur-slow) var(--ease-out);
}
.toast-drain {
  animation-name: toast-drain;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}

@keyframes toast-drain {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}
</style>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';

const props = withDefaults(
  defineProps<{
    align?: 'start' | 'end';
    panelClass?: string;
    disabled?: boolean;
  }>(),
  { align: 'end', panelClass: '', disabled: false }
);

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);

useFocusTrap(panel, open);

const onPointerDown = (e: Event): void => {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false;
};

const close = (): void => {
  open.value = false;
};

watch(open, (v) => {
  if (v) document.addEventListener('pointerdown', onPointerDown, true);
  else document.removeEventListener('pointerdown', onPointerDown, true);
});

/** Navigasi panah antar menuitem, sesuai ekspektasi keyboard pada menu. */
const onPanelKeydown = (e: KeyboardEvent): void => {
  if (e.key === 'Escape') {
    e.stopPropagation();
    close();
    return;
  }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const items = Array.from(
    panel.value?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []
  );
  if (items.length === 0) return;
  e.preventDefault();
  const current = items.indexOf(document.activeElement as HTMLElement);
  const next =
    e.key === 'ArrowDown'
      ? (current + 1) % items.length
      : (current - 1 + items.length) % items.length;
  items[next].focus();
};

onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown, true));
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="open = !open"
    >
      <slot name="trigger" :open="open" />
    </button>
    <Transition name="menu">
      <div
        v-if="open"
        ref="panel"
        role="menu"
        class="stagger absolute z-dropdown mt-2 min-w-[13rem] rounded-none bg-surface p-1.5 shadow-xl ring-1 ring-line"
        :class="[align === 'end' ? 'right-0 origin-top-right' : 'left-0 origin-top-left', panelClass]"
        @keydown="onPanelKeydown"
      >
        <slot :close="close" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.menu-enter-active {
  transition: opacity var(--dur) var(--ease-out), transform var(--dur) var(--ease-spring);
}
.menu-leave-active {
  transition: opacity var(--dur-fast) var(--ease-in), transform var(--dur-fast) var(--ease-in);
}
.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
}
</style>

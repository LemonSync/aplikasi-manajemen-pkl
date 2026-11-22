<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { useBodyScrollLock } from '@/composables/useBodyScrollLock';
import { notifyScope, type NotifyKind } from '@/composables/useNotify';
import AppIcon from './AppIcon.vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    busy?: boolean;
    /**
     * false = modal tidak bisa ditutup lewat X, Escape, maupun backdrop.
     * Dipakai untuk alur wajib ganti password, yang selama ini masih bisa
     * dielakkan ketiga caranya meski tombol "Batal" disembunyikan.
     */
    dismissible?: boolean;
  }>(),
  { size: 'md', busy: false, dismissible: true }
);

const emit = defineEmits<{ close: [] }>();

const panel = ref<HTMLElement | null>(null);
const isOpen = computed(() => props.open);

const NOTICE_TONES: Record<NotifyKind, string> = {
  error: 'bg-no-soft text-no',
  success: 'bg-ok-soft text-ok',
  info: 'bg-info-soft text-info',
};
const NOTICE_ICONS: Record<NotifyKind, string> = {
  error: 'alert',
  success: 'checkCircle',
  info: 'info',
};

/**
 * Hasil aksi diarahkan ke modal paling atas (lihat useNotify), jadi dialog
 * tidak pernah berdiri di belakang pesan error yang tak terbaca.
 */
let scopeId = '';
const notice = computed(() => (scopeId ? notifyScope.messageFor(scopeId) : undefined));

watch(
  isOpen,
  (open) => {
    if (open) {
      if (!scopeId) scopeId = notifyScope.open();
    } else if (scopeId) {
      notifyScope.close(scopeId);
      scopeId = '';
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (scopeId) notifyScope.close(scopeId);
});

const close = (): void => {
  if (props.busy) return;
  emit('close');
};

const onKey = (e: KeyboardEvent): void => {
  if (e.key === 'Escape' && props.open && props.dismissible) close();
};

watch(
  () => props.open,
  (v) => {
    if (v) window.addEventListener('keydown', onKey);
    else window.removeEventListener('keydown', onKey);
  }
);

useBodyScrollLock(isOpen);
useFocusTrap(panel, isOpen);
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="modal-overlay" @click.self="dismissible && close()">
        <div
          ref="panel"
          class="modal-panel"
          :data-size="size"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
        >
          <div class="modal-header">
            <h2 class="text-base font-semibold text-ink-900">{{ title }}</h2>
            <button
              v-if="dismissible"
              class="flex h-8 w-8 items-center justify-center rounded-none text-xl leading-none text-ink-400 transition duration-150 ease-spring hover:bg-ink-100 hover:text-ink-700 active:scale-90"
              :disabled="busy"
              aria-label="Tutup"
              @click="close"
            >
              &times;
            </button>
          </div>
          <div
            v-if="notice"
            class="flex items-start gap-2 px-5 py-2.5 text-[13px] leading-relaxed"
            :class="NOTICE_TONES[notice.kind]"
            role="alert"
          >
            <AppIcon class="mt-0.5 shrink-0" :name="NOTICE_ICONS[notice.kind]" :size="14" />
            <span>{{ notice.message }}</span>
          </div>
          <div class="modal-body">
            <slot />
          </div>
          <div v-if="$slots.footer" class="modal-footer">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active {
  transition: opacity var(--dur) var(--ease-out);
}
.modal-enter-active .modal-panel {
  animation: modal-pop var(--dur-slow) var(--ease-spring) both;
}
.modal-leave-active {
  transition: opacity var(--dur-fast) var(--ease-in);
}
.modal-leave-active .modal-panel {
  transition: transform var(--dur-fast) var(--ease-in), opacity var(--dur-fast) var(--ease-in);
}
.modal-leave-to {
  opacity: 0;
}
.modal-leave-to .modal-panel {
  opacity: 0.5;
  transform: translateY(8px) scale(0.98);
}
</style>

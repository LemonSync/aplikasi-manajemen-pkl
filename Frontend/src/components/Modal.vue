<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    busy?: boolean;
  }>(),
  { size: 'md', busy: false }
);

const emit = defineEmits<{ close: [] }>();

const close = (): void => {
  if (!props.busy) emit('close');
};

const onKey = (e: KeyboardEvent): void => {
  if (e.key === 'Escape' && props.open) close();
};

watch(
  () => props.open,
  (v) => {
    document.body.style.overflow = v ? 'hidden' : '';
    if (v) window.addEventListener('keydown', onKey);
    else window.removeEventListener('keydown', onKey);
  }
);
onBeforeUnmount(() => {
  document.body.style.overflow = '';
  window.removeEventListener('keydown', onKey);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay" @click.self="close">
      <div class="modal-panel" :data-size="size" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h2 class="text-base font-semibold text-gray-800">{{ title }}</h2>
          <button class="text-xl leading-none text-gray-400 hover:text-gray-600" :disabled="busy" @click="close">
            &times;
          </button>
        </div>
        <div class="modal-body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="modal-footer">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

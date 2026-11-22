<script setup lang="ts">
import { computed } from 'vue';
import Modal from '@/components/Modal.vue';
import { dialog } from '@/composables/useDialog';

const options = computed(() => dialog.state.options);
</script>

<template>
  <Modal
    :open="!!options"
    :title="options?.title ?? 'Konfirmasi'"
    size="sm"
    @close="dialog.settle(false)"
  >
    <p class="text-sm leading-relaxed whitespace-pre-line text-ink-700">{{ options?.message }}</p>
    <template #footer>
      <button class="btn-secondary" @click="dialog.settle(false)">
        {{ options?.cancelLabel ?? 'Batal' }}
      </button>
      <button
        :class="options?.danger ? 'btn-danger' : 'btn-primary'"
        @click="dialog.settle(true)"
      >
        {{ options?.confirmLabel ?? 'Ya' }}
      </button>
    </template>
  </Modal>
</template>

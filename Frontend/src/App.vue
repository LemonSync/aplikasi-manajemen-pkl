<script setup lang="ts">
import { onMounted } from 'vue';
import Toaster from '@/components/Toaster.vue';
import DialogHost from '@/components/DialogHost.vue';
import { installMotionLayer } from '@/composables/useMotionLayer';

// Root component: render rute (layout ditangani per-rute) + lapisan toast global.
onMounted(installMotionLayer);
</script>

<template>
  <RouterView v-slot="{ Component }">
    <Transition name="app-switch" mode="out-in">
      <component :is="Component" />
    </Transition>
  </RouterView>
  <DialogHost />
  <Toaster />
</template>

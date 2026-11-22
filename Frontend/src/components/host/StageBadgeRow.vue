<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { WorkflowStep } from '@/composables/useWorkflowSteps';
import AppIcon from '@/components/AppIcon.vue';

/**
 * Papan indikator progres langkah alur PKL siswa.
 *
 * Mengambil data dari `steps[].done` yang dihitung oleh server.
 */
const props = defineProps<{ steps: WorkflowStep[] }>();

const doneCount = computed(() => props.steps.filter((s) => s.done).length);

/** Langkah yang baru saja berpindah dari "belum" ke "selesai" — berkedip sebentar. */
const baru = ref<Set<WorkflowStep['key']>>(new Set(props.steps.filter((s) => s.done).map((s) => s.key)));
const sinyal = computed(() => props.steps.map((s) => `${s.key}:${s.done}`).join('|'));
let penghapus: ReturnType<typeof setTimeout> | undefined;

watch(sinyal, () => {
  const sudah = new Set([...baru.value]);
  const baruSelesai = props.steps.filter((s) => s.done && !sudah.has(s.key)).map((s) => s.key);
  if (baruSelesai.length === 0) return;
  if (penghapus !== undefined) clearTimeout(penghapus);
  baru.value = new Set(baruSelesai);
  penghapus = setTimeout(() => {
    baru.value = new Set();
  }, 1800);
});

onBeforeUnmount(() => {
  if (penghapus !== undefined) clearTimeout(penghapus);
});

const tone = (step: WorkflowStep): string => {
  if (step.done) return 'border-ok-400/50 bg-ok-500/20 text-ok-200';
  if (step.pending) return 'border-warn-300/50 bg-warn-400/15 text-warn-100';
  return 'border-white/10 bg-white/5 text-primary-200/70';
};

const state = (step: WorkflowStep): string => (step.done ? 'selesai' : step.pending ? 'menunggu verifikasi' : 'belum selesai');
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-300">
      <span class="tabular-nums text-white">{{ doneCount }}</span> / {{ steps.length }} langkah selesai
    </p>
    <ol class="flex flex-wrap items-center gap-1.5">
      <li
        v-for="(step, idx) in steps"
        :key="step.key"
        class="flex items-center gap-1 border px-2 py-1 text-xs transition-colors duration-300"
        :class="[tone(step), baru.has(step.key) ? 'animate-pulse-ring' : '']"
        :title="`${step.label} — ${state(step)}`"
      >
        <AppIcon v-if="step.done" name="check" :size="13" class="text-ok-300" />
        <AppIcon v-else-if="step.pending" name="clock" :size="13" />
        <span v-else class="font-mono text-[10px] opacity-70">{{ idx + 1 }}</span>
        <span class="sr-only">{{ step.label }}: {{ state(step) }}</span>
      </li>
    </ol>
  </div>
</template>

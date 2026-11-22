<script setup lang="ts">
/**
 * Strip Julie di kepala halaman tugas (Data Orang Tua, Surat Pernyataan, Usulan
 * tempat PKL). Versi kecil panggung kuis: naskahnya jalan satu per satu, dan
 * tiap kalimat membawa gambarnya sendiri — sama seperti di `QuizStage`, hanya
 * tanpa mesin antrean yang lengkap.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  HOST_NAME,
  actionLines,
  hostPoseFor,
  scriptFor,
  type HostAction,
  type HostScenario,
  type HostSpoken,
  type HostVars,
} from '@/config/hostDialogs';
import { useReducedMotion } from '@/composables/useReducedMotion';
import type { StepKey } from '@/composables/useWorkflowSteps';
import HostCharacter from './HostCharacter.vue';

/** Jeda satu kalimat sebelum MC lanjut ke kalimat berikutnya. */
const JEDA_MS = 3600;

const props = withDefaults(
  defineProps<{
    /** Kalimat langsung; dipakai bila tidak ada langkah/aksi yang cocok. */
    text?: string;
    /** Reaksi atas aksi siswa — mengambil naskah lengkap `ACTION_SCRIPT[action]`. */
    action?: HostAction;
    stepKey?: StepKey;
    scenario?: HostScenario;
    vars?: HostVars;
  }>(),
  { text: undefined, action: undefined, stepKey: undefined, scenario: 'question', vars: () => ({}) }
);

const reduced = useReducedMotion();

const queue = computed<HostSpoken[]>(() => {
  if (props.text) return [{ text: props.text, pose: hostPoseFor(props.scenario) }];
  if (props.action) return actionLines(props.action, props.vars ?? {});
  if (props.stepKey) return scriptFor(props.stepKey, props.scenario, props.vars ?? {});
  return [];
});

/** Kunci percakapan: naskah baru = mulai lagi dari kalimat pertama. */
const convo = computed(() => queue.value.map((l) => `${l.pose}:${l.text}`).join('\n'));
const shown = ref(1);
let timer: ReturnType<typeof setInterval> | undefined;

const stop = (): void => {
  if (timer !== undefined) clearInterval(timer);
  timer = undefined;
};

watch(
  [convo, reduced],
  () => {
    stop();
    if (reduced.value || queue.value.length < 2) {
      shown.value = queue.value.length;
      return;
    }
    shown.value = 1;
    timer = setInterval(() => {
      if (shown.value >= queue.value.length) stop();
      else shown.value += 1;
    }, JEDA_MS);
  },
  { immediate: true }
);

onBeforeUnmount(stop);

/** Klik strip = percepat kalimat berikutnya (tanpa menunggu jeda). */
const advance = (): void => {
  if (shown.value < queue.value.length) shown.value += 1;
  else stop();
};

const lines = computed(() => queue.value.slice(0, Math.min(shown.value, queue.value.length)));
const active = computed<HostSpoken | null>(() => lines.value[lines.value.length - 1] ?? null);
const transcript = computed(() => lines.value.slice(0, -1));
</script>

<template>
  <div
    v-if="active"
    class="flex items-start gap-3 border-l-[3px] border-l-primary-600 bg-primary-50 p-3"
    :class="shown < queue.length ? 'cursor-pointer' : ''"
    role="status"
    aria-live="polite"
    @click="advance"
  >
    <HostCharacter :pose="active.pose" :art="active.art" size="badge" enter />
    <div class="min-w-0 flex-1">
      <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-700">{{ HOST_NAME }}</p>
      <ul v-if="transcript.length" class="mt-0.5 space-y-0.5 border-l border-primary-200 pl-2">
        <li v-for="(line, i) in transcript" :key="`st-${i}`" class="text-xs leading-5 text-primary-700/60">
          {{ line.text }}
        </li>
      </ul>
      <p :key="active.text" class="animate-bubble-in mt-0.5 text-sm leading-6 text-ink-700">{{ active.text }}</p>
    </div>
  </div>
</template>

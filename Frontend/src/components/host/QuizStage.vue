<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { HOST_NAME, type HostPose, type HostSpoken } from '@/config/hostDialogs';
import { useReducedMotion } from '@/composables/useReducedMotion';
import type { WorkflowStep } from '@/composables/useWorkflowSteps';
import AppIcon from '@/components/AppIcon.vue';
import HostCharacter from './HostCharacter.vue';
import HostBubble from './HostBubble.vue';
import StageBadgeRow from './StageBadgeRow.vue';

/**
 * Panggung: Julie di kiri, balon chat di kanan, lencana bintang di atas.
 *
 * Komponen ini hanya menampilkan. Yang tahu tahap mana yang sedang berjalan dan
 * aksi apa yang boleh ditekan adalah `StudentWorkflowGame`, jadi panggung yang
 * sama bisa dipakai ulang tanpa ikut membawa logika fase.
 *
 * Gambang MC tidak ditentukan panggung: tiap balon membawa posenya sendiri
 * (`HostSpoken.pose`), jadi gambar berubah setiap kali kalimat berganti.
 */
const props = withDefaults(
  defineProps<{
    /** Naskah siap tampil; urutan = antrean balon. */
    lines: HostSpoken[];
    /** Jumlah balon yang sudah muncul (antrean berjalan). */
    revealed?: number;
    stepNumber?: number | null;
    phaseLabel: string;
    typing?: boolean;
    steps?: WorkflowStep[];
    showSkip?: boolean;
  }>(),
  { revealed: 0, stepNumber: null, typing: true, steps: () => [], showSkip: false }
);

const emit = defineEmits<{ advance: []; skip: [] }>();

const reduced = useReducedMotion();
const shown = computed(() => props.lines.slice(0, Math.max(props.revealed, 0)));
const active = computed<HostSpoken | null>(() => shown.value[shown.value.length - 1] ?? null);
const pose = computed<HostPose>(() => active.value?.pose ?? 'idle');

/**
 * Semua kalimat yang sudah lewat tetap tampil penuh. Dulu riwayat dilipat ke 2
 * baris supaya panggung tidak memanjang — ternyata naskah MC hilang dari layar,
 * dan itu jauh lebih buruk daripada panggung yang tinggi.
 */
const transcript = computed(() => shown.value.slice(0, -1));

// Balon baru bisa muncul di bawah lipatan (siswa sedang menekan kartu di bawah).
const bubble = ref<HTMLElement | null>(null);
watch(
  () => props.revealed,
  async () => {
    await nextTick();
    const el = bubble.value;
    if (!el) return;
    const box = el.getBoundingClientRect();
    if (box.top < 72 || box.bottom > window.innerHeight) {
      el.scrollIntoView({ behavior: reduced.value ? 'auto' : 'smooth', block: 'center' });
    }
  }
);
</script>

<template>
  <div class="space-y-4">
    <section
      class="relative overflow-hidden border border-line bg-gradient-to-br from-ink-900 via-ink-800 to-primary-900 p-5 text-white shadow-lg sm:p-7"
      data-reveal="left"
    >
      <div class="hero-glow pointer-events-none absolute inset-0" aria-hidden="true" />
      <span class="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-primary-400 via-accent to-transparent" aria-hidden="true" />

      <div class="relative flex flex-wrap items-center justify-between gap-3">
        <p class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-300">
          <AppIcon name="info" :size="14" class="text-accent" />
          <span v-if="stepNumber !== null" class="bg-accent px-2 py-0.5 font-bold text-ink-900">LANGKAH {{ stepNumber }}</span>
          <span>{{ phaseLabel }}</span>
        </p>
        <StageBadgeRow v-if="steps.length" :steps="steps" />
      </div>

      <div class="relative mt-5 flex items-start gap-3 sm:gap-4">
        <HostCharacter :pose="pose" :art="active?.art" size="md" enter />

        <div class="min-h-[6.5rem] min-w-0 flex-1 space-y-2">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-300">{{ HOST_NAME }}</p>

          <!-- Balon yang sudah lewat: dikecilkan jadi transkrip, semua tetap tampil -->
          <ul v-if="transcript.length" class="space-y-1 border-l border-white/15 pl-3">
            <li v-for="(line, i) in transcript" :key="`t-${i}`" class="text-xs leading-5 text-primary-200/70">
              {{ line.text }}
            </li>
          </ul>

          <div ref="bubble">
            <HostBubble
              v-if="active"
              :key="`b-${revealed}-${active.pose}`"
              :text="active.text"
              :typing="typing"
              :show-next="revealed < lines.length"
              @advance="emit('advance')"
            />
          </div>

          <!-- Penanda panjang antrean: siswa tahu MC akan berhenti di mana -->
          <div v-if="lines.length > 1" class="flex flex-wrap items-center gap-1 pt-0.5">
            <span
              v-for="(line, i) in lines"
              :key="`d-${i}`"
              aria-hidden="true"
              class="h-1 w-6 transition-colors duration-200"
              :class="i < revealed ? 'bg-accent' : 'bg-white/15'"
            />
            <p class="sr-only">Kalimat {{ Math.min(revealed, lines.length) }} dari {{ lines.length }}</p>
          </div>

          <div v-if="showSkip" class="flex justify-end">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary-200/70 transition-colors hover:text-white"
              @click="emit('skip')"
            >
              <AppIcon name="chevronRight" :size="12" />
              Lewati panduan
            </button>
          </div>
        </div>
      </div>
    </section>

    <slot />
  </div>
</template>

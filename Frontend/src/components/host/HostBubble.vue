<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { notify } from '@/composables/useNotify';
import { useReducedMotion } from '@/composables/useReducedMotion';
import AppIcon from '@/components/AppIcon.vue';

/**
 * Balon chat Julie.
 *
 * Teks ditulis muncul per karakter, tapi yang dibaca alat bantu akses adalah
 * kalimat penuh (`sr-only`) melalui `aria-live` — jadi pengguna tunanetra tidak
 * dieja huruf per huruf, dan teks tetap bisa disalin setelah animasi lewat.
 */
const props = withDefaults(
  defineProps<{
    text: string;
    /** false = tampilkan penuh tanpa mengetik (dipakai strip host di halaman tugas). */
    typing?: boolean;
    showNext?: boolean;
    nextLabel?: string;
  }>(),
  { typing: true, showNext: true, nextLabel: 'Lanjut' }
);

const emit = defineEmits<{ advance: [] }>();

const reduced = useReducedMotion();
const shown = ref('');
const finished = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;

const stop = (): void => {
  if (timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
};

const finish = (): void => {
  stop();
  shown.value = props.text;
  finished.value = true;
};

const start = (): void => {
  stop();
  if (!props.typing || reduced.value) {
    finish();
    return;
  }
  shown.value = '';
  finished.value = false;
  let index = 0;
  timer = setInterval(() => {
    index += 2; // dua karakter per tick: kalimat panjang tidak terasa lambat
    shown.value = props.text.slice(0, index);
    if (index >= props.text.length) finish();
  }, 24);
};

onMounted(start);
watch(() => props.text, start);
onBeforeUnmount(stop);

/** Klik balon: sementara mengetik = percepat; sudah selesai = lanjut. */
const onBubbleClick = (): void => {
  if (!finished.value) finish();
  else emit('advance');
};

/**
 * Tombol yang sama dipakai dua peran: selama MC masih mengetik dia jadi
 * "lewati ketikan", setelah kalimat selesai dia jadi "lanjut". Sengaja tidak
 * pernah menghilang supaya pengguna papan ketik punya satu target fokus yang
 * tetap — tombol yang baru muncul di tengah animasi selalu bikin fokus melompat.
 */
const onAdvanceClick = (): void => {
  if (!finished.value) finish();
  else emit('advance');
};

const copy = async (): Promise<void> => {
  try {
    await navigator.clipboard.writeText(props.text);
    notify.success('Kalimat pemandu disalin.');
  } catch {
    notify.error('Peramban menolak menyalin teks.');
  }
};
</script>

<template>
  <div class="animate-bubble-in">
    <div
      role="status"
      aria-live="polite"
      class="relative cursor-pointer border border-primary-200 bg-surface p-3 pl-4 shadow-sm"
      :class="finished ? '' : 'border-l-[3px] border-l-primary-500'"
      @click="onBubbleClick"
    >
      <!-- Ekor balon mengarah ke maskot di sebelah kiri -->
      <span class="absolute -left-[7px] top-4 h-3 w-3 rotate-45 border-b border-l border-primary-200 bg-surface" aria-hidden="true" />

      <p aria-hidden="true" class="text-sm leading-6 text-ink-800">
        {{ shown }}<span v-if="!finished" class="bubble-caret">|</span>
      </p>
      <p class="sr-only">{{ text }}</p>

      <div class="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-400 transition-colors hover:text-primary-700"
          title="Salin kalimat ini"
          @click.stop="copy"
        >
          <AppIcon name="clipboard" :size="12" />
          Salin
        </button>
        <button
          v-if="showNext || !finished"
          type="button"
          class="btn-primary inline-flex items-center gap-1.5"
          @click.stop="onAdvanceClick"
        >
          {{ finished ? nextLabel : 'Lewati ketikan' }}
          <AppIcon name="chevronRight" :size="14" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bubble-caret {
  display: inline-block;
  margin-left: 1px;
  color: var(--primary);
  animation: caret-blink 700ms steps(2, start) infinite;
}
</style>

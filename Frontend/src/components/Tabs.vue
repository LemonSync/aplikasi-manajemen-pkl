<script setup lang="ts">
import { onBeforeUnmount, onMounted, nextTick, ref, watch } from 'vue';

interface TabItem {
  key: string;
  label: string;
  count?: number;
}

const props = withDefaults(
  defineProps<{ modelValue: string; items: TabItem[]; ariaLabel?: string }>(),
  { ariaLabel: 'Daftar kategori' }
);
const emit = defineEmits<{ 'update:modelValue': [key: string] }>();

const track = ref<HTMLElement | null>(null);

const select = (index: number): void => {
  const count = props.items.length;
  if (count === 0) return;
  const target = (index + count) % count;
  emit('update:modelValue', props.items[target].key);
  track.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[target]?.focus();
};

const current = (): number => props.items.findIndex((t) => t.key === props.modelValue);

const step = (delta: number): void => select(current() + delta);
const toEdge = (edge: 'first' | 'last'): void => select(edge === 'first' ? 0 : props.items.length - 1);

/**
 * Penanda tab aktif digeser, bukan dilompatkan: tombol aktif sendiri transparan
 * dan blok inilah yang berpindah di bawahnya. Posisi diukur dari tombol aslinya
 * supaya label yang panjangnya berbeda tetap tercover penuh.
 */
const thumb = ref({ x: 0, y: 0, w: 0, h: 0, ready: false });
/**
 * Aktif setelah pengukuran pertama saja. Sebelum itu transisi dimatikan,
 * kalau tidak penanda akan "terbang" dari pojok kiri-atas saat tab pertama
 * kali dirender.
 */
const settled = ref(false);

const locate = async (): Promise<void> => {
  await nextTick();
  const buttons = track.value?.querySelectorAll<HTMLElement>('[role="tab"]');
  if (!buttons?.length) {
    thumb.value.ready = false;
    return;
  }
  const el = buttons[current()] ?? buttons[0];
  const firstRun = !thumb.value.ready;
  thumb.value = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, ready: true };
  if (firstRun && !settled.value) nextTick(() => (settled.value = true));
};

let observer: ResizeObserver | null = null;

onMounted(() => {
  void locate();
  observer = new ResizeObserver(() => void locate());
  if (track.value) observer.observe(track.value);
});

onBeforeUnmount(() => observer?.disconnect());

watch(
  () => [props.modelValue, props.items.length] as const,
  () => void locate()
);
</script>

<template>
  <div
    ref="track"
    role="tablist"
    :aria-label="ariaLabel"
    class="relative mb-4 flex flex-wrap gap-1 rounded-none bg-ink-100 p-1"
    @keydown.arrow-right.prevent="step(1)"
    @keydown.arrow-left.prevent="step(-1)"
    @keydown.home.prevent="toEdge('first')"
    @keydown.end.prevent="toEdge('last')"
  >
    <span
      v-show="thumb.ready"
      class="tab-indicator pointer-events-none absolute left-0 top-0 rounded-none bg-surface shadow-sm ring-1 ring-line"
      :class="settled ? '' : 'transition-none'"
      :style="{
        transform: `translate(${thumb.x}px, ${thumb.y}px)`,
        width: `${thumb.w}px`,
        height: `${thumb.h}px`,
      }"
      aria-hidden="true"
    />
    <button
      v-for="tab in items"
      :key="tab.key"
      type="button"
      role="tab"
      :aria-selected="modelValue === tab.key"
      :tabindex="modelValue === tab.key ? 0 : -1"
      class="relative z-10 flex items-center gap-1.5 rounded-none px-3 py-1.5 text-[13px] transition-colors duration-200"
      :class="
        modelValue === tab.key
          ? 'font-semibold text-primary-700'
          : 'font-medium text-ink-600 hover:text-ink-900'
      "
      @click="emit('update:modelValue', tab.key)"
    >
      {{ tab.label }}
      <span
        v-if="tab.count !== undefined"
        class="rounded-none px-1.5 py-0.5 text-[11px] font-semibold tabular-nums transition-colors duration-200"
        :class="modelValue === tab.key ? 'bg-primary-100 text-primary-700' : 'bg-ink-200 text-ink-600'"
        >{{ tab.count }}</span
      >
    </button>
  </div>
</template>

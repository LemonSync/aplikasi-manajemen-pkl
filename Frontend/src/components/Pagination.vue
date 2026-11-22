<script setup lang="ts">
import { computed } from 'vue';
import AppIcon from './AppIcon.vue';

const props = withDefaults(defineProps<{ page: number; total: number; perPage: number }>(), {
  perPage: 10,
});

const emit = defineEmits<{ 'update:page': [page: number] }>();

const pages = computed(() => Math.max(1, Math.ceil(props.total / Math.max(1, props.perPage))));
const from = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.perPage + 1));
const to = computed(() => Math.min(props.total, props.page * props.perPage));

/** Jendela nomor halaman: awal, sekitar halaman aktif, akhir — sisanya dipotong "…". */
const windowed = computed<Array<number | 'gap'>>(() => {
  const last = pages.value;
  const shown = new Set<number>();
  for (const n of [1, last, props.page, props.page - 1, props.page + 1]) {
    if (n >= 1 && n <= last) shown.add(n);
  }
  const ordered = [...shown].sort((a, b) => a - b);
  const out: Array<number | 'gap'> = [];
  ordered.forEach((n, i) => {
    if (i > 0 && n - ordered[i - 1] > 1) out.push('gap');
    out.push(n);
  });
  return out;
});

const go = (page: number): void => {
  if (page < 1 || page > pages.value || page === props.page) return;
  emit('update:page', page);
};

const pageClass = (active: boolean): string =>
  `flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-[13px] font-medium transition-colors ${
    active ? 'bg-primary-600 text-white' : 'text-ink-600 hover:bg-ink-100'
  }`;

const edgeClass =
  'flex h-9 w-9 items-center justify-center rounded-md text-ink-600 transition-colors hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-40';
</script>

<template>
  <nav
    v-if="pages > 1"
    class="flex flex-wrap items-center justify-between gap-3 pt-3"
    aria-label="Navigasi halaman"
  >
    <p class="text-[12px] tabular-nums text-ink-500">{{ from }}–{{ to }} dari {{ total }}</p>
    <div class="flex items-center gap-1">
      <button
        type="button"
        :class="edgeClass"
        :disabled="page <= 1"
        aria-label="Halaman sebelumnya"
        @click="go(page - 1)"
      >
        <AppIcon name="chevronLeft" :size="16" />
      </button>
      <template v-for="(p, i) in windowed" :key="`${p}-${i}`">
        <span v-if="p === 'gap'" class="px-1 text-[13px] text-ink-400" aria-hidden="true">…</span>
        <button
          v-else
          type="button"
          :class="pageClass(p === page)"
          :aria-current="p === page ? 'page' : undefined"
          @click="go(p)"
        >
          {{ p }}
        </button>
      </template>
      <button
        type="button"
        :class="edgeClass"
        :disabled="page >= pages"
        aria-label="Halaman berikutnya"
        @click="go(page + 1)"
      >
        <AppIcon name="chevronRight" :size="16" />
      </button>
    </div>
  </nav>
</template>

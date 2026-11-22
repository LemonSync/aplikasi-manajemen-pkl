<script setup lang="ts">
import { computed } from 'vue';
import type { WaGuide } from '@/services/api.service';
import { childButtonLabel, LEVEL_NAME, MAX_DEPTH, previewModeFor, sortByOrder, type GuideActions } from './waGuideTree';

const props = defineProps<{ guide: WaGuide; nodes: WaGuide[]; depth: number; actions: GuideActions }>();

const kids = computed(() => props.nodes.filter((n) => n.parentId === props.guide.id).sort(sortByOrder));
const isLeaf = computed(() => kids.value.length === 0);
const open = computed(() => props.actions.isExpanded(props.guide));
const mode = computed(() => previewModeFor(kids.value));
const nextLevelName = computed(() => LEVEL_NAME[Math.min(props.depth + 1, LEVEL_NAME.length - 1)]);
const canHaveChild = computed(() => props.depth < MAX_DEPTH);

const onPick = (event: Event): void => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) props.actions.setImage(props.guide, file);
  (event.target as HTMLInputElement).value = '';
};
</script>

<template>
  <div class="rounded-lg border border-gray-200 bg-white" :class="{ 'opacity-60': !guide.isActive }">
    <div class="flex flex-wrap items-start gap-2 px-3 py-2">
      <button
        v-if="!isLeaf"
        class="mt-0.5 shrink-0 rounded border border-gray-300 px-1.5 text-xs leading-5 text-gray-600 hover:bg-gray-50"
        :title="open ? 'Tutup' : 'Buka'"
        @click="actions.toggleExpand(guide)"
      >
        {{ open ? '▾' : '▸' }} {{ kids.length }}
      </button>
      <span v-else class="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-gray-300" title="Langkah akhir" />

      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-gray-900">{{ guide.label }}</p>
        <p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
          <span class="rounded bg-gray-100 px-1.5 py-0.5">{{ LEVEL_NAME[Math.min(depth, LEVEL_NAME.length - 1)] }}</span>
          <span class="font-mono">{{ guide.rowId }}</span>
          <span v-if="guide.role === 'ADMIN' || depth === 0" class="rounded bg-gray-100 px-1.5 py-0.5">{{ guide.role.toLowerCase() }}</span>
          <span v-if="guide.imagePath" class="rounded bg-sky-50 px-1.5 py-0.5 text-sky-700">ada gambar</span>
          <span v-if="!guide.isActive" class="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">disembunyikan</span>
          <span v-if="!isLeaf" class="rounded bg-gray-100 px-1.5 py-0.5">{{ kids.length }} {{ nextLevelName.toLowerCase() }} · dikirim sebagai {{ mode }}</span>
          <span v-else-if="!guide.body" class="rounded bg-red-50 px-1.5 py-0.5 text-red-700">belum ada isi pesan</span>
        </p>
        <p v-if="open && isLeaf && guide.body" class="mt-1 whitespace-pre-line text-xs text-gray-600">{{ guide.body.slice(0, 220) }}{{ guide.body.length > 220 ? '…' : '' }}</p>
      </div>

      <div class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <button class="text-primary-600 hover:underline" @click="actions.edit(guide)">Ubah</button>
        <button v-if="canHaveChild" class="text-primary-600 hover:underline" @click="actions.addChild(guide)">+ {{ childButtonLabel(depth) }}</button>
        <button class="text-primary-600 hover:underline" @click="actions.setActive(guide)">{{ guide.isActive ? 'Sembunyikan' : 'Tampilkan' }}</button>
        <label class="cursor-pointer text-primary-600 hover:underline">
          Gambar<input type="file" accept="image/png,image/jpeg" class="hidden" @change="onPick" />
        </label>
        <button v-if="guide.imagePath" class="text-amber-700 hover:underline" @click="actions.dropImage(guide)">Hapus gambar</button>
        <button class="text-red-600 hover:underline" @click="actions.remove(guide)">Hapus</button>
      </div>
    </div>

    <div v-if="open && kids.length" class="space-y-2 border-t border-gray-100 bg-gray-50/70 px-3 py-2">
      <WaGuideNode v-for="k in kids" :key="k.id" :guide="k" :nodes="nodes" :depth="depth + 1" :actions="actions" />
    </div>
  </div>
</template>

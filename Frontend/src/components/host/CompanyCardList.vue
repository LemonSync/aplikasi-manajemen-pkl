<script setup lang="ts">
import { computed } from 'vue';
import type { CompanyOption } from '@/services/api.service';
import AppIcon from '@/components/AppIcon.vue';

/**
 * Daftar perusahaan tujuan sebagai kartu — pengganti `<select>`.
 *
 * Semua perusahaan aktif ditampilkan, termasuk yang kuotanya habis, supaya
 * siswa tidak menebak-nebak kenapa suatu tempat "hilang". Yang penuh tetap
 * tidak bisa dipilih; penolakan sebenarnya ada di backend (`assertSisaAvailable`),
 * jadi kartu nonaktif ini hanya penghematan klik — bukan penjaga kuota.
 */
const props = withDefaults(defineProps<{ companies: CompanyOption[]; modelValue?: string; loading?: boolean }>(), {
  modelValue: '',
  loading: false,
});

const emit = defineEmits<{ 'update:modelValue': [string] }>();

/** Perusahaan bersisa kuota di atas, yang penuh di bawah — nama tetap urut (dari server). */
const ordered = computed(() =>
  [...props.companies].sort((a, b) => Number(a.sisa === 0) - Number(b.sisa === 0))
);

const isFull = (c: CompanyOption): boolean => c.sisa === 0;

const pick = (c: CompanyOption): void => {
  if (isFull(c)) return;
  emit('update:modelValue', c.id);
};

/** Kuota terbaca sebagai angka, bukan hanya warna: "2 dari 5 kursi masih ada". */
const quotaLine = (c: CompanyOption): string => {
  if (c.quota === null) return 'Kuota tanpa batas';
  if (c.sisa === 0) return `Penuh — ${c.terpakai}/${c.quota} kursi sudah terisi`;
  return `${c.sisa} dari ${c.quota} kursi masih ada`;
};
</script>

<template>
  <div>
    <div v-if="loading" class="grid gap-2 sm:grid-cols-2">
      <div v-for="i in 4" :key="i" class="skeleton h-24 w-full" />
    </div>

    <p v-else-if="companies.length === 0" class="border-l-[3px] border-l-warn bg-warn-soft p-3 text-sm text-warn-700">
      Belum ada perusahaan terdaftar untuk gelombang ini. Kamu bisa usulkan tempat sendiri.
    </p>

    <div
      v-else
      role="radiogroup"
      aria-label="Pilihan perusahaan tempat PKL"
      class="grid max-h-[22rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2"
    >
      <button
        v-for="c in ordered"
        :key="c.id"
        type="button"
        role="radio"
        :aria-checked="c.id === modelValue"
        :aria-disabled="isFull(c) || undefined"
        :tabindex="isFull(c) ? -1 : 0"
        class="border p-3 text-left transition-all duration-200 ease-spring"
        :class="[
          isFull(c)
            ? 'cursor-not-allowed border-line bg-ink-50 opacity-60'
            : c.id === modelValue
              ? 'border-primary-600 bg-primary-50 shadow-sm'
              : 'border-line bg-surface hover:border-primary-400 hover:bg-primary-50/60',
        ]"
        @click="pick(c)"
        @keydown.space.prevent="pick(c)"
        @keydown.enter.prevent="pick(c)"
      >
        <span class="flex items-start justify-between gap-2">
          <span class="min-w-0 text-sm font-semibold leading-snug text-ink-900">{{ c.name }}</span>
          <span
            v-if="isFull(c)"
            class="badge shrink-0 bg-no-soft text-no"
          >KUOTA PENUH</span>
          <AppIcon v-else-if="c.id === modelValue" name="checkCircle" :size="18" class="shrink-0 text-primary-600" />
        </span>

        <span class="mt-1 block text-xs leading-5 text-ink-500">
          {{ c.address }}<span v-if="c.city">, {{ c.city }}</span>
        </span>
        <span v-if="c.industryName" class="mt-1 block text-xs text-ink-400">Bidang: {{ c.industryName }}</span>
        <span v-if="c.phone" class="block text-xs text-ink-400">Telp: {{ c.phone }}</span>

        <span
          class="mt-2 block text-xs font-medium"
          :class="isFull(c) ? 'text-no' : 'text-ok-700'"
        >
          {{ quotaLine(c) }}
        </span>
      </button>
    </div>
  </div>
</template>

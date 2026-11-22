<script setup lang="ts">
import { computed } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';

/**
 * Kartu "soal" pada panggung kuis: pertanyaan + pilihan + tombol aksi.
 *
 * kartunya sendiri tidak tahu apa-apa tentang fase atau dokumen — status di sini
 * hanya label untuk tampilannya, sementara isi dan aksi datang dari pemanggil.
 */
const props = withDefaults(
  defineProps<{
    state?: 'question' | 'waiting' | 'rejected' | 'done' | 'info';
    title: string;
    subtitle?: string;
    /** Alasan penolakan dari admin — wajib terbaca, bukan hanya warna merah. */
    note?: string | null;
    stepNumber?: number | null;
  }>(),
  { state: 'question', subtitle: undefined, note: undefined, stepNumber: null }
);

const badge = computed(() => {
  switch (props.state) {
    case 'waiting':
      return { label: 'Menunggu Verifikasi', cls: 'bg-warn-100 text-warn-700' };
    case 'rejected':
      return { label: 'Perlu Perbaikan', cls: 'bg-no-soft text-no' };
    case 'done':
      return { label: 'Selesai', cls: 'bg-ok-100 text-ok-700' };
    case 'info':
      return { label: 'Catatan', cls: 'bg-info-soft text-info' };
    default:
      return { label: 'Langkah Aktif', cls: 'bg-primary-100 text-primary-700' };
  }
});
</script>

<template>
  <section
    class="animate-scale-in card space-y-4"
    :class="[
      state === 'rejected' ? 'border-l-[3px] border-l-no' : state === 'done' ? 'border-l-[3px] border-l-ok' : 'border-l-[3px] border-l-primary-600',
    ]"
    :aria-labelledby="'step-card-title'"
  >
    <div class="flex items-start gap-3">
      <span
        v-if="stepNumber !== null"
        class="flex h-8 w-8 shrink-0 items-center justify-center bg-gradient-to-br from-primary-600 to-primary-800 text-sm font-bold text-white"
        aria-hidden="true"
      >{{ stepNumber }}</span>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <h3 id="step-card-title" class="text-base font-semibold leading-snug text-ink-900 sm:text-lg">{{ title }}</h3>
          <span class="badge" :class="badge.cls">{{ badge.label }}</span>
        </div>
        <p v-if="subtitle" class="mt-1 text-sm leading-6 text-ink-600">{{ subtitle }}</p>
      </div>
    </div>

    <!-- Alasan admin: blok khusus supaya tidak hilang di balik teks pemandu -->
    <div
      v-if="note"
      class="animate-shake border-l-[3px] border-l-no bg-no-soft p-3"
    >
      <p class="flex items-center gap-2 text-sm font-medium text-no">
        <AppIcon name="alert" :size="15" class="shrink-0" />
        Catatan admin
      </p>
      <p class="mt-1 text-sm text-red-700">{{ note }}</p>
    </div>

    <p v-if="state === 'waiting'" class="flex items-center gap-2 text-sm text-warn-700">
      <LoadingSpinner inline /> Admin sedang memeriksa berkas kamu.
    </p>

    <div class="stagger">
      <slot />
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </section>
</template>

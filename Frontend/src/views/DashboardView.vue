<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth.store';
import { useCohortStore } from '@/stores/cohort.store';
import { PHASE_LABELS, ROLE_LABELS } from '@/types';
import AppIcon from '@/components/AppIcon.vue';

const auth = useAuthStore();
const cohortStore = useCohortStore();

const roleLabel = computed(() => (auth.role ? ROLE_LABELS[auth.role] : '-'));
</script>

<template>
  <div class="space-y-6">
    <div class="relative overflow-hidden bg-ink-900 p-6 text-white shadow-panel">
      <div class="pointer-events-none absolute -right-16 -top-16 h-56 w-56 bg-primary-500/25 blur-3xl" />
      <div class="relative">
        <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-300">
          {{ roleLabel }}
        </p>
        <h2 class="mt-1 text-2xl font-bold tracking-tight">Halo, {{ auth.user?.username }}!</h2>
        <div class="mt-4 flex flex-wrap gap-2">
          <span class="badge bg-white/10 text-white">Role: {{ roleLabel }}</span>
          <span v-if="auth.phase" class="badge bg-primary-600 text-white">
            Fase: {{ PHASE_LABELS[auth.phase] }}
          </span>
          <span v-if="cohortStore.activeCohort" class="badge bg-white/10 text-white">
            {{ cohortStore.activeCohort.name }}
          </span>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div class="card card-hover">
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center bg-emerald-50 text-emerald-600">
            <AppIcon name="checkCircle" :size="20" />
          </div>
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Status</p>
            <p class="text-lg font-bold text-emerald-600">Aktif</p>
          </div>
        </div>
      </div>
      <div class="card card-hover">
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center bg-primary-50 text-primary-600">
            <AppIcon name="user" :size="20" />
          </div>
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Role</p>
            <p class="text-lg font-bold text-ink-900">{{ roleLabel }}</p>
          </div>
        </div>
      </div>
      <div class="card card-hover">
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center bg-amber-50 text-amber-600">
            <AppIcon name="clock" :size="20" />
          </div>
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Fase</p>
            <p class="text-lg font-bold text-ink-900">
              {{ auth.phase ? PHASE_LABELS[auth.phase] : '-' }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="auth.user?.mustChangePassword"
      class="flex items-center gap-3 bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200"
    >
      <AppIcon name="alert" :size="18" class="shrink-0 text-amber-600" />
      Password masih default — segera ganti.
    </div>
  </div>
</template>

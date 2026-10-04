<script setup lang="ts">
import { useAuthStore } from '@/stores/auth.store';
import { PHASE_LABELS, ROLE_LABELS } from '@/types';

const auth = useAuthStore();
</script>

<template>
  <div class="space-y-6">
    <div class="card">
      <h2 class="text-xl font-semibold text-gray-800">
        Selamat datang, {{ auth.user?.username }}!
      </h2>
      <p class="mt-1 text-sm text-gray-500">
        Anda masuk sebagai <strong>{{ auth.role ? ROLE_LABELS[auth.role] : '' }}</strong>.
        <span v-if="auth.phase"> Fase saat ini: <strong>{{ PHASE_LABELS[auth.phase] }}</strong>.</span>
      </p>
    </div>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div class="card">
        <p class="text-sm text-gray-500">Status Akun</p>
        <p class="mt-1 text-lg font-semibold text-emerald-600">Aktif</p>
      </div>
      <div class="card">
        <p class="text-sm text-gray-500">Role</p>
        <p class="mt-1 text-lg font-semibold text-gray-800">
          {{ auth.role ? ROLE_LABELS[auth.role] : '-' }}
        </p>
      </div>
      <div class="card">
        <p class="text-sm text-gray-500">Fase</p>
        <p class="mt-1 text-lg font-semibold text-gray-800">
          {{ auth.phase ? PHASE_LABELS[auth.phase] : '-' }}
        </p>
      </div>
    </div>

    <div
      v-if="auth.user?.mustChangePassword"
      class="rounded-xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200"
    >
      <strong>Perhatian:</strong> Anda masih menggunakan password default. Silakan ganti password
      Anda segera.
    </div>
  </div>
</template>

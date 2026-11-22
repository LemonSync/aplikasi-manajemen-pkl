<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { studentWorkflowService, type StudentWorkflowStatus } from '@/services/api.service';
import { notify } from '@/composables/useNotify';
import { extractErrorMessage } from '@/services/http';
import { useHostSession } from '@/composables/useHostSession';
import EmptyState from '@/components/EmptyState.vue';
import StudentWorkflowGame from './StudentWorkflowGame.vue';

/**
 * Panggung alur PKL siswa (Fase 1 & 2) — Pemandu Alur (Host).
 *
 * Halaman ini menampilkan panduan alur terarah yang dipandu oleh Host (Julie).
 * Semua status dibaca langsung dari `status` server (GET /student/workflow).
 */
const auth = useAuthStore();
const router = useRouter();
const status = ref<StudentWorkflowStatus | null>(null);
const loading = ref(true);

const { introSeen, markIntroSeen } = useHostSession(computed(() => auth.user?.username));

/** Muat penuh: boleh menampilkan kerangka tulang (dipanggil saat masuk halaman). */
const load = async () => {
  loading.value = true;
  notify.clear();
  try {
    status.value = await studentWorkflowService.getStatus();
    await auth.fetchMe();

    // Fase 3 & 4 memakai sidebar (dashboard), bukan guided workflow.
    const sidebarPhase = status.value?.effectivePhase;
    if (sidebarPhase === 'PKL_AKTIF' || sidebarPhase === 'PKL_SELESAI') {
      void router.push({ name: 'dashboard' });
      return;
    }
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    loading.value = false;
  }
};

/**
 * Muat ulang senyap setelah aksi (unduh/unggah/ganti perusahaan). Sengaja tanpa
 * kerangka tulang dan tanpa redirect — persis seperti refetch inline yang dipakai
 * mode daftar sebelumnya.
 */
const reload = async () => {
  status.value = await studentWorkflowService.getStatus();
  await auth.fetchMe();
};

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6">
    <!-- Loading: kerangka tulang, bukan spinner telanjang -->
    <template v-if="loading">
      <div class="skeleton h-48 w-full" />
      <div class="card" aria-hidden="true">
        <div class="skeleton h-5 w-44" />
        <div class="mt-5 flex items-start gap-3">
          <div v-for="i in 6" :key="i" class="flex flex-1 flex-col items-center gap-2">
            <div class="skeleton h-7 w-7" />
            <div class="skeleton h-2.5 w-full" />
          </div>
        </div>
      </div>
      <p class="text-center text-sm text-ink-500">Memuat alur PKL Anda…</p>
    </template>

    <div
      v-else-if="!status?.effectivePhase"
      class="card"
    >
      <EmptyState
        title="Belum Ada Jadwal Aktif"
        description="Saat ini belum ada masa/jadwal PKL yang aktif untuk gelombang Anda."
        icon="clock"
      />
    </div>

    <template v-else>
      <StudentWorkflowGame
        :status="status"
        :intro-seen="introSeen"
        @refresh="reload"
        @seen-intro="markIntroSeen"
      />
    </template>
  </div>
</template>

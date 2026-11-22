<script setup lang="ts">
import { toRef } from 'vue';
import { RouterLink } from 'vue-router';
import type { StudentWorkflowStatus } from '@/services/api.service';
import { useWorkflowSteps, PHASE_LABELS, PHASE_BLURB, formatDate } from '@/composables/useWorkflowSteps';
import { useWorkflowActions } from '@/composables/useWorkflowActions';
import AppIcon from '@/components/AppIcon.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import RegistrationView from './RegistrationView.vue';

/**
 * Mode Daftar: tampilan lama `/alur-pkl` (stepper + kartu per langkah).
 * Isinya persis seperti sebelum panggung kuis ada — dipindah ke file ini supaya
 * siswa yang memilih "Mode Daftar" dan panggung kuis memakai angka, gerbang, dan
 * aksi yang sama, bukan dua salinan aturan.
 */
const props = defineProps<{ status: StudentWorkflowStatus }>();
const emit = defineEmits<{ refresh: [] }>();

const status = toRef(props, 'status');
const {
  phaseIndex,
  phasePercent,
  isBehindSchedule,
  steps,
  currentStep,
  doneCount,
  waitingMessage,
} = useWorkflowSteps(status);
const {
  penerimaanFile,
  uploadingPenerimaan,
  onPenerimaanFileChange,
  uploadSuratPenerimaan,
  changeCompany,
  cancellingCompany,
  downloadSurat,
} = useWorkflowActions(status, async () => emit('refresh'));
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <section
      class="relative overflow-hidden border border-line bg-gradient-to-br from-ink-900 via-ink-800 to-primary-900 p-6 text-white shadow-lg sm:p-8"
      data-reveal="left"
    >
      <div class="hero-glow pointer-events-none absolute inset-0" aria-hidden="true" />
      <span class="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-primary-400 via-accent to-transparent" aria-hidden="true" />

      <div class="relative">
        <p class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-300">
          <span class="h-4 w-[3px] shrink-0 bg-accent" aria-hidden="true" />
          Tahap {{ phaseIndex + 1 }} dari 4 · {{ PHASE_LABELS[String(status.effectivePhase)] }}
        </p>
        <h2 class="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
          {{ PHASE_LABELS[String(status.effectivePhase)] }}
        </h2>
        <p class="mt-3 max-w-2xl text-sm leading-6 text-ink-200">
          {{ PHASE_BLURB[String(status.effectivePhase)] }}
        </p>
        <div v-if="status.currentSchedule" class="mt-4 flex flex-wrap items-center gap-3 text-xs text-primary-200">
          <span class="inline-flex items-center gap-2 border border-white/10 bg-white/5 px-2.5 py-1">
            <AppIcon name="calendar" :size="13" class="text-primary-300" />
            Masa: {{ formatDate(status.currentSchedule.startDate) }} — {{ formatDate(status.currentSchedule.endDate) }}
          </span>
        </div>

        <!-- Bar progres tahap: satu-satunya angka yang bergerak di header -->
        <div class="mt-6">
          <div class="flex items-center justify-between text-[11px] font-medium text-primary-200">
            <span>Kemajuan alur Anda</span>
            <span class="tabular-nums">{{ phasePercent }}%</span>
          </div>
          <div class="mt-2 h-1 overflow-hidden bg-white/15">
            <div
              class="animate-grow-x h-full bg-gradient-to-r from-primary-500 to-accent"
              :style="{ width: `${phasePercent}%` }"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- Peringatan: jadwal sudah pindah fase tapi syarat belum lengkap -->
    <div v-if="isBehindSchedule" class="card border-l-[3px] border-l-no bg-no-soft" data-reveal>
      <div class="flex items-start gap-3">
        <AppIcon name="alert" :size="20" class="mt-0.5 shrink-0 text-no" />
        <div>
          <h3 class="text-sm font-semibold text-no">Syarat Tahap Ini Belum Lengkap</h3>
          <p class="mt-1 text-sm text-red-700">
            Jadwal sekolah sudah memasuki masa
            <strong>{{ PHASE_LABELS[String(status.currentSchedule?.phase)] ?? status.currentSchedule?.phase }}</strong>,
            tetapi persyaratan tahap Anda masih
            <strong>{{ PHASE_LABELS[String(status.effectivePhase)] }}</strong>.
            Lengkapi segera agar tahap Anda dapat diteruskan.
          </p>
        </div>
      </div>
    </div>

    <!-- Menunggu -->
    <div v-if="status.hasCompleted && waitingMessage" class="card border-l-[3px] border-l-info bg-info-soft" data-reveal>
      <div class="flex items-start gap-3">
        <span class="animate-pulse-ring mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-info-200 bg-surface text-info">
          <AppIcon name="clock" :size="18" />
        </span>
        <div>
          <h3 class="text-sm font-semibold text-info">Tahap ini sudah selesai</h3>
          <p class="mt-1 text-sm text-blue-700">Silakan tunggu masa berikutnya.</p>
          <p class="mt-1 text-sm font-medium text-info">{{ waitingMessage.nextPhase }} dimulai pada {{ waitingMessage.startDate }}.</p>
        </div>
      </div>
    </div>

    <!-- ==================== STEPPER (menyamping) ==================== -->
    <div
      v-if="status.effectivePhase === 'PRA_PKL' || status.effectivePhase === 'NON_PKL' || status.effectivePhase === 'PKL_SELESAI'"
      class="card relative overflow-hidden"
      data-reveal="scale"
    >
      <span class="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-primary-500 via-accent to-transparent" aria-hidden="true" />

      <div class="relative mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-lg font-semibold text-ink-900">Langkah Alur PKL</h2>
        <p class="text-xs text-ink-500">
          <span class="font-semibold tabular-nums text-primary-700">{{ doneCount }}</span> dari
          {{ steps.length }} langkah selesai
        </p>
      </div>

      <!-- Rail langkah: bisa discroll horizontal di layar sempit (7 langkah tidak muat di 360px) -->
      <div class="-mx-1 overflow-x-auto px-1 pb-1">
        <ol class="flex min-w-max items-start px-1 py-2">
          <template v-for="(step, i) in steps" :key="step.key">
            <!-- Garis penghubung ke langkah sebelumnya: mengalir ke kanan saat selesai -->
            <li
              v-if="i > 0"
              class="mt-3.5 h-[2px] min-w-[16px] flex-1 bg-ink-200"
              :class="steps[i - 1].done ? 'animate-grow-x bg-ok-500' : ''"
              aria-hidden="true"
            />
            <li class="flex w-[74px] shrink-0 flex-col items-center gap-1 sm:w-24">
              <component
                :is="step.routeName && step.routeVisible ? RouterLink : 'div'"
                v-bind="step.routeName && step.routeVisible ? { to: { name: step.routeName }, title: `Buka ${step.label}` } : {}"
                class="group flex w-full flex-col items-center gap-1 px-1 py-1 transition-colors duration-200"
                :class="step.routeName && step.routeVisible ? 'cursor-pointer hover:bg-primary-50' : ''"
                :aria-current="step.key === currentStep?.key ? 'step' : undefined"
              >
                <span
                  class="flex h-7 w-7 items-center justify-center border-2 text-xs font-semibold transition-all duration-200 ease-spring group-hover:scale-105"
                  :class="[
                    step.done
                      ? 'border-ok-600 bg-ok-600 text-white'
                      : step.key === currentStep?.key
                        ? 'animate-pulse-ring border-primary-500 bg-primary-600 text-white'
                        : step.pending
                          ? 'border-warn-300 bg-warn-100 text-warn-700'
                          : 'border-ink-300 bg-ink-50 text-ink-400',
                  ]"
                >
                  <AppIcon v-if="step.done" name="check" :size="14" />
                  <template v-else>{{ i + 1 }}</template>
                </span>
                <span
                  class="w-full text-center text-[11px] leading-tight transition-colors duration-200 sm:text-xs"
                  :class="step.done ? 'text-ok-700' : step.key === currentStep?.key ? 'font-semibold text-primary-700' : 'text-ink-400'"
                >
                  {{ step.label }}
                </span>
              </component>
            </li>
          </template>
        </ol>
      </div>

      <!-- Detail langkah aktif: kartu ini berganti isi tiap kali langkah berpindah -->
      <Transition name="step" mode="out-in">
        <div
          v-if="currentStep"
          :key="currentStep.key"
          class="mt-4 border border-primary-200 bg-gradient-to-br from-primary-50 to-surface p-4"
        >
          <div class="flex items-start gap-3">
            <span class="flex h-7 w-7 shrink-0 items-center justify-center bg-primary-600 text-sm font-semibold text-white">
              {{ steps.findIndex((st) => st.key === currentStep!.key) + 1 }}
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-semibold text-ink-900">{{ currentStep.label }}</p>
                <span v-if="currentStep.pending" class="badge bg-warn-100 text-warn-700">Menunggu Verifikasi</span>
                <span v-else class="badge bg-primary-100 text-primary-700">Langkah Aktif</span>
              </div>
              <p class="mt-0.5 text-sm text-ink-600">{{ currentStep.description }}</p>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <!-- Unduh Surat Permohonan (gerbang Fase 1 → 2) -->
                <template v-if="currentStep.key === 'surat-permohonan'">
                  <button v-if="status.registrationDocumentId" class="btn-primary" @click="downloadSurat">
                    Download Surat Permohonan
                  </button>
                  <span v-else-if="status.registrationStatus === 'DISETUJUI'" class="text-xs text-ink-500">
                    Surat sedang disiapkan sekolah.
                  </span>
                </template>
                <!-- Link ke halaman tugas -->
                <RouterLink
                  v-if="currentStep.routeName && currentStep.routeVisible"
                  :to="{ name: currentStep.routeName }"
                  class="btn-primary"
                >
                  Buka {{ currentStep.label }}
                </RouterLink>
                <!-- Unduh ulang Surat Permohonan dari langkah mana pun -->
                <button
                  v-if="currentStep.key !== 'surat-permohonan' && status.registrationDocumentId"
                  class="btn-secondary"
                  @click="downloadSurat"
                >
                  Unduh Ulang Surat Permohonan
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Semua langkah selesai -->
        <div v-else key="all-done" class="mt-4 flex items-center gap-2 border border-ok-200 bg-ok-soft p-3">
          <AppIcon name="check" :size="20" class="shrink-0 text-ok" />
          <p class="text-sm font-medium text-ok-700">Semua langkah alur PKL sudah selesai.</p>
        </div>
      </Transition>
    </div>

    <!-- ==================== PRA_PKL ==================== -->
    <!-- key: setelah status berubah (daftar ulang / ganti perusahaan) daftar
         perusahaan dimuat ulang — kuotanya sudah berbeda. -->
    <RegistrationView
      v-if="status.effectivePhase === 'PRA_PKL' && !status.hasCompleted"
      :key="`pick-${status.registrationStatus}`"
      @downloaded="emit('refresh')"
    />

    <div v-else-if="status.effectivePhase === 'PRA_PKL' && status.hasCompleted" class="card" data-reveal>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-ink-900">Pendaftaran PKL</h2>
          <p class="text-sm text-ink-500">Pengajuan pendaftaran Anda.</p>
        </div>
        <span class="badge bg-ok-100 text-ok-700">Selesai</span>
      </div>
      <p class="mt-3 text-sm text-ink-600">
        Pendaftaran sudah disetujui. Pastikan Surat Permohonan sudah diunduh dan diserahkan ke perusahaan.
      </p>
    </div>

    <!-- ==================== NON_PKL ==================== -->
    <!-- Upload Surat Penerimaan (belum disetujui) -->
    <div v-if="status.effectivePhase === 'NON_PKL' && !status.hasSuratPenerimaan" class="card" data-reveal>
      <div class="mb-4 flex items-center gap-3">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center bg-gradient-to-br from-primary-600 to-primary-800 text-sm font-semibold text-white">3</span>
        <div>
          <h2 class="text-lg font-semibold text-ink-900">Upload Surat Penerimaan PKL</h2>
          <p class="text-sm text-ink-500">Upload surat balasan/penerimaan dari perusahaan tujuan Anda.</p>
        </div>
      </div>

      <!-- Sedang menunggu verifikasi: file terkunci, tidak boleh diganti -->
      <div v-if="status.hasSuratPenerimaanPending" class="border-l-[3px] border-l-warn bg-warn-soft p-3">
        <p class="flex items-center gap-2 text-sm font-medium text-warn-700">
          <LoadingSpinner inline /> Menunggu verifikasi admin...
        </p>
        <p class="mt-1 text-sm text-warn-600">
          File yang sudah diunggah tidak dapat diganti selama menunggu verifikasi.
          Unggah ulang hanya dapat dilakukan setelah admin menolak.
        </p>
      </div>

      <template v-else>
        <!-- Ditolak admin: tampilkan alasan + boleh upload ulang -->
        <div v-if="status.suratPenerimaanStatus === 'DITOLAK'" class="animate-shake mb-3 border-l-[3px] border-l-no bg-no-soft p-3">
          <p class="text-sm font-medium text-no">Surat Penerimaan ditolak admin.</p>
          <p v-if="status.suratPenerimaanNote" class="mt-1 text-sm text-red-700">Alasan: {{ status.suratPenerimaanNote }}</p>
          <p class="mt-1 text-xs text-red-600">Perbaiki lalu upload ulang surat yang benar.</p>
        </div>
        <input class="input" type="file" accept=".pdf,.jpg,.jpeg,.png" @change="onPenerimaanFileChange" />
        <button class="btn-primary mt-4" :disabled="uploadingPenerimaan || !penerimaanFile" @click="uploadSuratPenerimaan">
          {{ uploadingPenerimaan ? 'Mengunggah...' : 'Upload Surat Penerimaan' }}
        </button>
      </template>

      <!-- Berubah pikiran: batalkan & ganti perusahaan (kembali Fase 1) -->
      <div class="mt-5 border-t border-line pt-4">
        <p class="text-xs text-ink-500">
          Perusahaan menolak surat permohonan Anda, atau ingin memilih perusahaan lain?
        </p>
        <button
          class="btn-secondary mt-2 text-no"
          :disabled="cancellingCompany"
          @click="changeCompany"
        >
          {{ cancellingCompany ? 'Membatalkan...' : 'Berubah Pikiran — Ganti Perusahaan' }}
        </button>
      </div>
    </div>

    <!-- Surat Penerimaan sudah disetujui -->
    <div
      v-if="status.effectivePhase === 'NON_PKL' && status.hasSuratPenerimaan"
      class="card border-l-[3px] border-l-ok bg-ok-soft"
      data-reveal
    >
      <div class="flex items-center gap-3">
        <span class="animate-pulse-ring flex h-8 w-8 shrink-0 items-center justify-center border border-ok-200 bg-surface text-ok">
          <AppIcon name="check" :size="16" />
        </span>
        <div>
          <h3 class="text-sm font-semibold text-ok-700">Surat Penerimaan PKL — Selesai</h3>
          <p class="text-sm text-ok-600">Sudah disetujui admin. Lanjutkan ke langkah berikutnya.</p>
        </div>
      </div>
    </div>

    <!-- NON_PKL selesai -->
    <div v-if="status.effectivePhase === 'NON_PKL' && status.hasCompleted" class="card" data-reveal>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-ink-900">Daftar Ulang PKL</h2>
          <p class="text-sm text-ink-500">Semua persyaratan sudah selesai.</p>
        </div>
        <span class="badge bg-ok-100 text-ok-700">Selesai</span>
      </div>
      <div v-if="waitingMessage" class="mt-4 border-l-[3px] border-l-info bg-info-soft p-4">
        <div class="flex items-start gap-3">
          <AppIcon name="clock" :size="20" class="mt-0.5 shrink-0 text-info" />
          <div>
            <h3 class="text-sm font-semibold text-info">Menunggu Masa PKL Dimulai</h3>
            <p class="mt-1 text-sm text-blue-700">{{ waitingMessage.nextPhase }} dimulai pada {{ waitingMessage.startDate }}.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== PKL_SELESAI ==================== -->
    <div v-if="status.effectivePhase === 'PKL_SELESAI'" class="card border-l-[3px] border-l-primary-600" data-reveal>
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="text-lg font-semibold text-ink-900">Input Nilai PKL</h2>
          <p class="mt-1 text-sm text-ink-500">
            Pada fase Pasca-PKL, isi nilai PKL Anda (nilai DUDI + aspek penilaian).
            Nilai akan ditinjau dan disetujui oleh admin.
          </p>
        </div>
        <RouterLink :to="{ name: 'grade-input' }" class="btn-primary shrink-0">
          Buka Input Nilai PKL
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Kartu langkah aktif berganti isi saat alur maju; tanpa ini pergantiannya terasa
   seperti teks yang di-swap mendadak. */
.step-enter-active {
  transition:
    opacity var(--dur) var(--ease-out),
    transform var(--dur) var(--ease-out);
}
.step-leave-active {
  transition:
    opacity var(--dur-fast) var(--ease-in),
    transform var(--dur-fast) var(--ease-in);
}
.step-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.step-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>

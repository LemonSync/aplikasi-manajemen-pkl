<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import type { StudentWorkflowStatus } from '@/services/api.service';
import { useReducedMotion } from '@/composables/useReducedMotion';
import { PHASE_LABELS, formatDate, useWorkflowSteps, type StepKey } from '@/composables/useWorkflowSteps';
import { useWorkflowActions } from '@/composables/useWorkflowActions';
import { useRegistrationPick } from '@/composables/useRegistrationPick';
import {
  OPENING_LINES,
  actionLines,
  scriptFor,
  type HostAction,
  type HostScenario,
  type HostSpoken,
} from '@/config/hostDialogs';
import AppIcon from '@/components/AppIcon.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import QuizStage from '@/components/host/QuizStage.vue';
import QuizStepCard from '@/components/host/QuizStepCard.vue';
import CompanyCardList from '@/components/host/CompanyCardList.vue';

/**
 * Panggung kuis Fase 1 & 2.
 *
 * Semua yang tampil adalah turunan dari `status` (hasil GET /student/workflow)
 * dan naskah di `config/hostDialogs`. Tidak ada progres yang disimpan di sini:
 * MC hanya bisa mengatakan sesuatu kalau server sudah mengiyakan. Aksinya memakai
 * composable yang sama dengan Mode Daftar, jadi kedua tampilan tidak mungkin
 * mengirim permintaan yang berbeda.
 */
const props = defineProps<{ status: StudentWorkflowStatus; introSeen: boolean }>();
const emit = defineEmits<{ refresh: []; seenIntro: [] }>();

const auth = useAuthStore();
const reduced = useReducedMotion();
const status = toRef(props, 'status');

const { steps, currentStep, isBehindSchedule, waitingMessage } = useWorkflowSteps(status);
const {
  penerimaanFile,
  uploadingPenerimaan,
  onPenerimaanFileChange,
  uploadSuratPenerimaan,
  downloadingSurat,
  downloadSurat,
  changeCompany,
  cancellingCompany,
} = useWorkflowActions(status, async () => emit('refresh'));

const { existing, companies, companyId, loading: pickLoading, saving, selectedCompany, load, save, submit } =
  useRegistrationPick(async () => emit('refresh'));

// Sapaan diputuskan sekali saat masuk. Kalau dibaca dari prop, menandai "sudah
// dilihat" akan menghapus baris pertama tepat di tengah percakapan — antreannya
// mengulang dari nol. Jadi sapaan baru benar-benar dibuang saat percakapan
// berganti (status berubah), itu pun baru kalau sudah pernah selesai dibaca.
const introActive = ref(!props.introSeen);
let introMarked = props.introSeen;
const introCount = computed(() => (introActive.value ? OPENING_LINES.length : 0));

const perusahaan = computed(
  () => existing.value?.company?.name ?? selectedCompany.value?.name ?? 'perusahaan tujuanmu'
);

/** Alasan admin yang sedang berlaku — pendaftaran atau Surat Penerimaan. */
const catatan = computed<string | null>(() => {
  const s = props.status;
  if (currentStep.value?.key === 'surat-penerimaan' && s.suratPenerimaanStatus === 'DITOLAK') {
    return s.suratPenerimaanNote ?? null;
  }
  if (s.registrationStatus === 'DITOLAK') return existing.value?.note ?? null;
  return null;
});

/**
 * "Sudah berapa lama peristiwa ini terjadi" — sumber realisme MC. Diambil dari
 * timestamp server, jadi kalimatnya berbeda antara baru kirim dan sudah tiga hari
 * antre, meskipun statusnya sama-sama menunggu.
 */
const menitSejak = (iso: string | null | undefined): number | null =>
  iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)) : null;

const durasiLabel = (menit: number | null): string => {
  if (menit === null) return 'beberapa saat lalu';
  if (menit < 2) return 'baru saja';
  if (menit < 60) return `${menit} menit lalu`;
  if (menit < 1440) return `${Math.floor(menit / 60)} jam lalu`;
  const hari = Math.floor(menit / 1440);
  return hari === 1 ? 'sehari lalu' : `${hari} hari lalu`;
};

/** Bentuk kartu yang sedang tampil — satu tempat pemetaan, template tinggal membaca. */
type Stage = 'pick' | 'submitted' | 'download' | 'preparing' | 'upload' | 'task' | 'review' | 'allDone';

const stage = computed<Stage>(() => {
  const s = props.status;
  if (s.hasCompleted) return 'allDone';
  switch (currentStep.value?.key) {
    case undefined:
      // Tidak ada langkah yang tersisa pada fase ini, tapi fase belum
      // disahkan — artinya berkas siswa sedang di atas meja admin.
      return 'review';
    case 'pendaftaran':
      return s.registrationStatus === 'DIAJUKAN' ? 'submitted' : 'pick';
    case 'surat-permohonan':
      return s.registrationDocumentId ? 'download' : 'preparing';
    case 'surat-penerimaan':
      return 'upload';
    default:
      return 'task';
  }
});

const menitKirim = computed(() => menitSejak(props.status.registrationSubmittedAt));
const menitPutusan = computed(() => menitSejak(props.status.registrationReviewedAt));
const menitUnggah = computed(() => menitSejak(props.status.suratPenerimaanSubmittedAt));

/** Peristiwa yang sedang terjadi — bukan sekadar nama tahap. */
const scenario = computed<HostScenario | undefined>(() => {
  const s = props.status;
  if (s.hasCompleted) return 'doneAll';
  if (isBehindSchedule.value) return 'behind';
  const key = currentStep.value?.key;
  if (!key) return 'review';
  if (key === 'pendaftaran') {
    if (s.registrationStatus === 'DITOLAK') return 'rejected';
    if (s.registrationStatus === 'DIAJUKAN') return (menitKirim.value ?? 0) < 45 ? 'justSubmitted' : 'waiting';
    return 'question';
  }
  if (key === 'surat-permohonan') {
    if (s.registrationDocumentId) return 'question';
    return (menitPutusan.value ?? 9999) < 90 ? 'approvedFresh' : 'prep';
  }
  if (key === 'surat-penerimaan') {
    if (s.hasSuratPenerimaanPending) return (menitUnggah.value ?? 0) < 45 ? 'justUploaded' : 'locked';
    if (s.suratPenerimaanStatus === 'DITOLAK') return 'rejected';
    return 'question';
  }
  return 'question';
});

/** Timestamp yang jadi acuan kalimat "sudah berapa lama" untuk peristiwa ini. */
const durasi = computed(() => {
  switch (scenario.value) {
    case 'justSubmitted':
    case 'waiting':
      return durasiLabel(menitKirim.value);
    case 'approvedFresh':
    case 'prep':
      return durasiLabel(menitPutusan.value);
    case 'justUploaded':
    case 'locked':
      return durasiLabel(menitUnggah.value);
    default:
      return '';
  }
});

const vars = computed(() => ({
  // Nama master data lebih manusiawi daripada username angka; kalau belum ada,
  // MC masih bisa memanggil sesuatu.
  nama: props.status.studentName ?? auth.user?.username ?? 'kamu',
  perusahaan: perusahaan.value,
  note: catatan.value ?? 'tidak ada catatan dari admin — tanyakan ke guru pembimbing ya',
  durasi: durasi.value,
  namaFile: penerimaanFile.value?.name ?? 'filenya',
}));

const cardState = computed(() => {
  switch (scenario.value) {
    case 'waiting':
    case 'locked':
    case 'prep':
    case 'approvedFresh':
    case 'justSubmitted':
    case 'justUploaded':
    case 'review':
      return 'waiting' as const;
    case 'rejected':
      return 'rejected' as const;
    case 'doneAll':
      return 'done' as const;
    default:
      return 'question' as const;
  }
});

/** Nomor tahap mengikuti posisi langkah pada alur (1 = pendaftaran … 6 = laporan akhir). */
const stepNumber = computed<number | null>(() => {
  const step = currentStep.value;
  if (!step) return null;
  return steps.value.findIndex((st) => st.key === step.key) + 1;
});

const title = computed(() => {
  switch (stage.value) {
    case 'pick':
      return 'Pilih Perusahaan Mitra PKL';
    case 'submitted':
      return `Pendaftaran Terkirim ke ${perusahaan.value}`;
    case 'download':
      return 'Unduh Surat Permohonan PKL';
    case 'preparing':
      return 'Penerbitan Surat Permohonan oleh Pihak Sekolah';
    case 'upload':
      return 'Unggah Surat Penerimaan dari Perusahaan';
    case 'task':
      return currentStep.value?.label ?? 'Langkah Berikutnya';
    case 'review':
      return 'Verifikasi Berkas oleh Admin Sekolah';
    default:
      return 'Seluruh Langkah Persiapan Selesai';
  }
});

/** Deskripsi langkah tidak cocok untuk semua kartu: pengajuan sudah terkirim. */
const subtitle = computed(() =>
  stage.value === 'submitted'
    ? 'Berkas pendaftaran telah diterima pihak sekolah dan menunggu verifikasi admin.'
    : currentStep.value?.description ?? ''
);

/** Ganti tahap atau ganti peristiwa = percakapan baru; refresh status bukan percakapan baru. */
const convo = computed(() => `${currentStep.value?.key ?? '-'}|${scenario.value ?? '-'}`);

const script = computed(() =>
  scriptFor(currentStep.value?.key ?? ('pendaftaran' as StepKey), scenario.value, vars.value, {
    intro: introActive.value,
    propose: stage.value === 'pick',
  })
);

/** Balon reaksi atas tombol yang baru ditekan — tampil seketika, tanpa menunggu server. */
const extras = ref<HostSpoken[]>([]);

const lines = computed<HostSpoken[]>(() => [...script.value, ...extras.value]);

// --- Antrean balon ---
const revealed = ref(0);
const typing = ref(!reduced.value);
let kickoff: ReturnType<typeof setTimeout> | undefined;

const resetQueue = (): void => {
  if (kickoff !== undefined) clearTimeout(kickoff);
  typing.value = !reduced.value;
  if (reduced.value) {
    revealed.value = lines.value.length; // tanpa pentas: semua kalimat langsung ada
    return;
  }
  revealed.value = 0;
  kickoff = setTimeout(() => {
    revealed.value = 1;
  }, 140);
};

watch(
  convo,
  () => {
    extras.value = [];
    if (introMarked) introActive.value = false;
    resetQueue();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (kickoff !== undefined) clearTimeout(kickoff);
});

const advance = (): void => {
  if (revealed.value < lines.value.length) revealed.value += 1;
  // Sekali lewat dari blok sapaan, tandai — tapi barisnya tetap di tempatnya
  // sampai percakapan ini selesai, supaya antrean tidak diulang dari awal.
  if (!introMarked && revealed.value > introCount.value) {
    introMarked = true;
    emit('seenIntro');
  }
};

/**
 * Lewati sapaan: semua balon jadi transkrip sekaligus, MC memberi satu kalimat
 * penutup supaya tombolnya tidak terasa membungkam dia.
 */
const skipIntro = (): void => {
  extras.value = actionLines('skip', vars.value);
  typing.value = false;
  revealed.value = lines.value.length;
  if (!introMarked) {
    introMarked = true;
    emit('seenIntro');
  }
};

/**
 * MC menanggapi satu aksi: balon lama mengecil jadi transkrip, reaksi barisnya
 * jalan satu per satu (tiap kalimat bawa gambarnya sendiri).
 */
const say = (action: HostAction): void => {
  extras.value = actionLines(action, vars.value);
  typing.value = !reduced.value;
  revealed.value = lines.value.length;
};

/**
 * Tekan tombol aksi → MC bicara dulu, baru kerja jalan.
 *
 * Fungsi ini dipakai LANGSUNG di template (`@click="act('unduh', downloadSurat)"`),
 * jadi ia yang harus mengerjakan aksinya. Kalau ia mengembalikan closure, Vue hanya
 * mengevaluasi panggilannya dan membuang closure itu: tombol terasa mati.
 */
const act = (action: HostAction, run: () => Promise<void>): void => {
  say(action);
  void run();
};

/** Pilih kartu perusahaan = peristiwa, bukan cuma perubahan v-model. */
const pickCompany = (id: string): void => {
  if (id === companyId.value) return; // kartu yang sama diklik lagi: bukan pilihan baru
  companyId.value = id;
  say('pilih');
};

/** File dipilih (belum diunggah): MC mengonfirmasi namanya lalu minta dicek. */
const pickFile = (event: Event): void => {
  onPenerimaanFileChange(event);
  if (penerimaanFile.value) say('pilihFile');
};

/**
 * Daftar perusahaan dimuat walau siswa sudah di Fase 2: namanya dipakai MC pada
 * kalimat ("surat balasan dari PT X") dan dibutuhkan lagi saat ganti perusahaan.
 * Setiap perubahan status pendaftaran, kuota diambil ulang.
 */
onMounted(load);
watch(() => props.status.registrationStatus, load);
</script>

<template>
  <div class="space-y-4">
    <!-- Jadwal sudah bergeser tapi syarat belum lengkap: lebih penting dari dialog -->
    <div v-if="isBehindSchedule" class="card border-l-[3px] border-l-no bg-no-soft" data-reveal>
      <div class="flex items-start gap-3">
        <AppIcon name="alert" :size="20" class="mt-0.5 shrink-0 text-no" />
        <div>
          <h3 class="text-sm font-semibold text-no">Syarat Tahap Ini Belum Lengkap</h3>
          <p class="mt-1 text-sm text-red-700">
            Jadwal sekolah sudah memasuki masa
            <strong>{{ PHASE_LABELS[String(status.currentSchedule?.phase)] ?? status.currentSchedule?.phase }}</strong
            >, tetapi kamu masih berada di
            <strong>{{ PHASE_LABELS[String(status.effectivePhase)] }}</strong>. Selesaikan kartu di bawah ya.
          </p>
        </div>
      </div>
    </div>

    <QuizStage
      :step-number="stepNumber"
      :phase-label="PHASE_LABELS[String(status.effectivePhase)] ?? ''"
      :lines="lines"
      :revealed="revealed"
      :typing="typing"
      :steps="steps"
      :show-skip="introActive && revealed < lines.length"
      @advance="advance"
      @skip="skipIntro"
    >
      <!-- ==================== TAHAP 1: pilih perusahaan ==================== -->
      <QuizStepCard
        v-if="stage === 'pick'"
        :step-number="stepNumber"
        :title="title"
        :subtitle="subtitle"
        :state="cardState"
        :note="catatan"
      >
        <CompanyCardList :model-value="companyId" :companies="companies" :loading="pickLoading" @update:model-value="pickCompany" />

        <template #actions>
          <button class="btn-primary" :disabled="saving || companies.length === 0" @click="act('ajukan', submit)">
            <LoadingSpinner v-if="saving" inline />
            {{ saving ? 'Mengirim…' : 'Ajukan Pendaftaran' }}
          </button>
          <button v-if="!saving" class="btn-secondary" :disabled="companies.length === 0" @click="act('draft', save)">
            Simpan Draft
          </button>
          <RouterLink
            :to="{ name: 'company-request' }"
            class="btn-secondary border-dashed border-primary-300 text-primary-700 hover:border-primary-500 hover:bg-primary-50"
          >
            + Usulkan Tempat PKL
          </RouterLink>
        </template>
      </QuizStepCard>

      <!-- ==================== TAHAP 1: sudah diajukan ==================== -->
      <QuizStepCard
        v-else-if="stage === 'submitted'"
        :step-number="stepNumber"
        :title="title"
        :subtitle="subtitle"
        :state="cardState"
      >
        <p class="text-sm text-ink-600">
          Nomor pengajuan <span class="font-medium text-ink-900">{{ existing?.code ?? '—' }}</span> · dikirim
          {{ formatDate(existing?.submittedAt ?? null) }}
        </p>
        <template #actions>
          <RouterLink :to="{ name: 'registration' }" class="btn-secondary">Lihat detail pendaftaran</RouterLink>
        </template>
      </QuizStepCard>

      <!-- ==================== TAHAP 2: unduh surat ==================== -->
      <QuizStepCard v-else-if="stage === 'download'" :step-number="stepNumber" :title="title" :subtitle="subtitle">
        <p class="text-sm text-ink-600">
          Surat Permohonan resmi atas nama <span class="font-medium text-ink-900">{{ vars.nama }}</span> untuk
          <span class="font-medium text-ink-900">{{ perusahaan }}</span>. Silakan unduh dokumen untuk dicetak dan disampaikan ke pihak perusahaan.
        </p>
        <template #actions>
          <button class="btn-primary" :disabled="downloadingSurat" @click="act('unduh', downloadSurat)">
            <LoadingSpinner v-if="downloadingSurat" inline />
            {{ downloadingSurat ? 'Menyiapkan…' : 'Download Surat Permohonan' }}
          </button>
        </template>
      </QuizStepCard>

      <!-- ==================== TAHAP 2: surat belum jadi ==================== -->
      <QuizStepCard v-else-if="stage === 'preparing'" :step-number="stepNumber" :title="title" :subtitle="subtitle" state="waiting" />

      <!-- ==================== TAHAP 3: unggah surat penerimaan ==================== -->
      <QuizStepCard
        v-else-if="stage === 'upload'"
        :step-number="stepNumber"
        :title="title"
        :subtitle="subtitle"
        :state="cardState"
        :note="catatan"
      >
        <p v-if="status.hasSuratPenerimaanPending" class="text-sm text-warn-700">
          Berkas yang sudah diunggah tidak dapat diubah selama proses pemeriksaan admin.
        </p>
        <template v-else>
          <input class="input" type="file" accept=".pdf,.jpg,.jpeg,.png" @change="pickFile" />
          <p class="text-xs text-ink-500">
            Unggah berkas foto atau PDF Surat Penerimaan dari {{ perusahaan }} dengan format yang jelas dan terbaca.
          </p>
        </template>

        <template #actions>
          <button
            v-if="!status.hasSuratPenerimaanPending"
            class="btn-primary"
            :disabled="uploadingPenerimaan || !penerimaanFile"
            @click="act('unggah', uploadSuratPenerimaan)"
          >
            <AppIcon name="upload" :size="14" />
            {{ uploadingPenerimaan ? 'Mengunggah…' : 'Unggah Surat Penerimaan' }}
          </button>
          <button v-if="status.registrationDocumentId" class="btn-secondary" @click="act('unduh', downloadSurat)">
            Unduh Ulang Surat Permohonan
          </button>
          <button
            v-if="!status.hasSuratPenerimaanPending"
            class="btn-secondary text-no"
            :disabled="cancellingCompany"
            @click="act('ganti', changeCompany)"
          >
            {{ cancellingCompany ? 'Membatalkan…' : 'Batalkan & Ganti Perusahaan' }}
          </button>
        </template>
      </QuizStepCard>

      <!-- ==================== TAHAP 4/5 ==================== -->
      <QuizStepCard v-else-if="stage === 'task'" :step-number="stepNumber" :title="title" :subtitle="subtitle">
        <template #actions>
          <RouterLink
            v-if="currentStep?.routeName && currentStep.routeVisible"
            :to="{ name: currentStep.routeName }"
            class="btn-primary"
          >
            Buka {{ currentStep.label }}
          </RouterLink>
          <button v-if="status.registrationDocumentId" class="btn-secondary" @click="act('unduh', downloadSurat)">
            Unduh Ulang Surat Permohonan
          </button>
        </template>
      </QuizStepCard>

      <!-- ==================== Semua berkas masuk, tinggal keputusan admin ==================== -->
      <QuizStepCard v-else-if="stage === 'review'" :step-number="null" :title="title" state="waiting">
        <p class="text-sm text-ink-600">
          Surat Pernyataan atas nama <span class="font-medium text-ink-900">{{ vars.nama }}</span> saat ini sedang diverifikasi oleh admin sekolah. Setelah disetujui, fase Anda akan diperbarui secara otomatis.
        </p>
        <template #actions>
          <RouterLink :to="{ name: 'surat-pernyataan' }" class="btn-secondary">Lihat Surat Pernyataan</RouterLink>
          <RouterLink :to="{ name: 'dashboard' }" class="btn-secondary">Kembali ke dashboard</RouterLink>
        </template>
      </QuizStepCard>

      <!-- ==================== Semua syarat fase selesai ==================== -->
      <QuizStepCard v-else :step-number="null" :title="title" state="done">
        <p v-if="waitingMessage" class="text-sm text-ink-600">
          Fase {{ waitingMessage.nextPhase }} dijadwalkan dimulai pada
          <span class="font-medium text-ink-900">{{ waitingMessage.startDate }}</span>. Seluruh persyaratan administrasi pada fase ini telah terpenuhi.
        </p>
        <template #actions>
          <RouterLink :to="{ name: 'dashboard' }" class="btn-secondary">Kembali ke dashboard</RouterLink>
        </template>
      </QuizStepCard>
    </QuizStage>
  </div>
</template>

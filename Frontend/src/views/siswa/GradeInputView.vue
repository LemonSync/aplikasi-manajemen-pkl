<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  gradeService,
  type GradeRecord,
  type PenilaianFormDef,
} from '@/services/api.service';
import { notify } from '@/composables/useNotify';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';
import AppIcon from '@/components/AppIcon.vue';

/**
 * Penilaian Fase 4 — butir diambil dari server (LEMBARAN PENILAIAN sekolah),
 * siswa/mentor hanya mengisi skor. Setelah dikirim dengan konfirmasi, nilai
 * TERKUNCI dan satu-satunya jalan terbuka kembali adalah admin menolaknya.
 */
const form = ref<PenilaianFormDef | null>(null);
const dudi = ref<GradeRecord | null>(null);
const loading = ref(true);
const saving = ref(false);

/** Skor per butir, kunci "groupCode:code". */
const scores = ref<Record<string, number | null>>({});
const scoreReport = ref<number | null>(null);
const mentorName = ref('');
const note = ref('');
const confirmOpen = ref(false);

const keyOf = (groupCode: string, code: string): string => `${groupCode}:${code}`;

const numOrNull = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const isiNilaiTerakhir = (g: GradeRecord | null): void => {
  if (!g?.aspects?.length) {
    if (g) {
      scoreReport.value = numOrNull(g.scoreReport);
      mentorName.value = g.mentorName ?? '';
      note.value = g.note ?? '';
    }
    return;
  }
  for (const a of g.aspects) {
    scores.value[keyOf(a.groupCode, a.code)] = numOrNull(a.score);
  }
  scoreReport.value = numOrNull(g.scoreReport);
  mentorName.value = g.mentorName ?? '';
  note.value = g.note ?? '';
};

const load = async (): Promise<void> => {
  loading.value = true;
  notify.clear();
  try {
    const [f, mine] = await Promise.all([gradeService.form(), gradeService.myGrades()]);
    form.value = f;
    dudi.value = mine.find((g) => g.giverRole === 'DUDI') ?? null;
    scores.value = Object.fromEntries(f.items.map((i) => [keyOf(i.groupCode, i.code), null]));
    isiNilaiTerakhir(dudi.value);
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    loading.value = false;
  }
};

const rejected = computed(() => dudi.value?.approval?.status === 'DITOLAK');
const locked = computed(() => Boolean(dudi.value?.submittedAt) && !rejected.value);

const terisi = computed(() =>
  (form.value?.items ?? [])
    .map((i) => scores.value[keyOf(i.groupCode, i.code)])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100)
);

const round2 = (n: number): number => Math.round(n * 100) / 100;

const rataRata = computed(() =>
  terisi.value.length === 0
    ? null
    : round2(terisi.value.reduce((a, b) => a + b, 0) / terisi.value.length)
);

const nilaiAkhir = computed(() => {
  const w = form.value?.weights;
  if (!w || rataRata.value === null || scoreReport.value === null) return null;
  return round2((rataRata.value * w.aspek) / 100 + (scoreReport.value * w.laporan) / 100);
});

const predikat = computed(() => {
  const na = nilaiAkhir.value;
  const scale = form.value?.scale;
  if (na === null || !scale?.length) return null;
  return scale.find((s) => na >= s.min) ?? scale[scale.length - 1];
});

const butirKurang = computed(() =>
  (form.value?.items ?? []).filter((i) => {
    const v = scores.value[keyOf(i.groupCode, i.code)];
    return typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100;
  }).length
);

const openConfirm = (): void => {
  notify.clear();
  if (butirKurang.value > 0) {
    notify.error(`Seluruh ${form.value?.items.length ?? 13} butir wajib diisi dengan skor 0–100. Sisa ${butirKurang.value} butir.`);
    return;
  }
  if (scoreReport.value === null || scoreReport.value < 0 || scoreReport.value > 100) {
    notify.error('Nilai Laporan PKL wajib diisi (0–100).');
    return;
  }
  if (mentorName.value.trim().length < 3) {
    notify.error('Nama pembimbing/mentor PKL dari perusahaan wajib diisi.');
    return;
  }
  confirmOpen.value = true;
};

const submit = async (): Promise<void> => {
  const items = form.value?.items;
  if (!items) return;
  saving.value = true;
  notify.clear();
  try {
    await gradeService.inputGrade({
      items: items.map((i) => ({
        groupCode: i.groupCode,
        code: i.code,
        score: scores.value[keyOf(i.groupCode, i.code)] as number,
      })),
      scoreReport: scoreReport.value as number,
      mentorName: mentorName.value.trim(),
      note: note.value.trim() || null,
      confirmed: true,
    });
    confirmOpen.value = false;
    notify.success('Nilai terkirim dan terkunci. Menunggu persetujuan admin.');
    await load();
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    saving.value = false;
  }
};

const tanggal = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' }) : '—';

/** Predikat tersimpan = huruf; label panjangnya diambil dari skala server. */
const predikatTersimpan = computed(() => {
  const letter = dudi.value?.predicate;
  const scale = form.value?.scale ?? [];
  const found = scale.find((s) => s.letter === letter);
  return found ? `${found.letter} — ${found.label}` : (letter ?? '—');
});

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <SkeletonTable v-if="loading" :rows="13" :cols="2" />

    <template v-else>

      <!-- Nilai ditolak admin: form terbuka lagi dengan catatan -->
      <div
        v-if="rejected"
        class="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      >
        <AppIcon name="alert" :size="18" class="mt-0.5 shrink-0" />
        <div>
          <p class="font-semibold">Nilai ditolak admin</p>
          <p class="mt-0.5">{{ dudi?.approval?.note || 'Perbaiki isi penilaian lalu kirim ulang.' }}</p>
        </div>
      </div>

      <!-- Nilai sudah terkunci -->
      <div v-if="locked" class="card">
        <div class="flex items-start gap-3">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ok-soft text-ok">
            <AppIcon name="lock" :size="18" />
          </span>
          <div class="min-w-0">
            <h2 class="text-lg font-semibold text-ink-900">Nilai sudah terkirim</h2>
            <p class="text-sm text-ink-500">
              Nilai tidak dapat diubah lagi. Admin yang dapat membuka kembali penilaian ini
              dengan menolaknya.
            </p>
          </div>
        </div>

        <dl class="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt class="text-xs uppercase tracking-wide text-ink-400">Rata-rata Butir</dt>
            <dd class="mt-0.5 font-semibold text-ink-900">{{ numOrNull(dudi?.scoreDudi) ?? '—' }}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-wide text-ink-400">Nilai Laporan</dt>
            <dd class="mt-0.5 font-semibold text-ink-900">{{ numOrNull(dudi?.scoreReport) ?? '—' }}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-wide text-ink-400">Nilai Akhir</dt>
            <dd class="mt-0.5 font-semibold text-ink-900">{{ numOrNull(dudi?.finalScore) ?? '—' }}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-wide text-ink-400">Predikat</dt>
            <dd class="mt-0.5 font-semibold text-ink-900">{{ predikatTersimpan }}</dd>
          </div>
        </dl>

        <div class="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-600">
          <StatusBadge :status="dudi?.approval?.status ?? 'MENUNGGU'" />
          <span>Dikirim {{ tanggal(dudi?.submittedAt) }}</span>
          <span v-if="dudi?.mentorName" class="text-ink-400">· Pembimbing: {{ dudi.mentorName }}</span>
        </div>
        <p v-if="dudi?.approval?.note" class="mt-2 text-sm text-ink-500">
          Catatan admin: {{ dudi.approval.note }}
        </p>
      </div>

      <!-- Form LEMBARAN PENILAIAN -->
      <form v-if="!locked && form" class="card space-y-5">
        <div>
          <h2 class="text-lg font-semibold text-ink-900">Lembaran Penilaian PKL</h2>
          <p class="mt-1 text-sm text-ink-500">
            Diisi oleh pembimbing/mentor PKL dari perusahaan, dikirim melalui akun siswa.
            Seluruh {{ form.items.length }} butir wajib diisi dengan skor 0–100.
          </p>
        </div>

        <section v-for="group in form.groups" :key="group.no" class="space-y-2">
          <h3 class="text-sm font-semibold text-ink-700">{{ group.no }}. {{ group.title }}</h3>
          <div
            v-for="item in group.items"
            :key="`${group.no}-${item.code}`"
            class="flex items-center gap-3 rounded-lg border border-line px-3 py-2"
          >
            <span class="w-5 shrink-0 font-mono text-xs text-ink-400">{{ item.code }}</span>
            <span class="min-w-0 flex-1 text-sm text-ink-800">{{ item.label }}</span>
            <input
              v-model.number="scores[`${group.no}:${item.code}`]"
              class="input w-24 shrink-0 text-center"
              type="number"
              min="0"
              max="100"
              step="1"
              placeholder="0–100"
              aria-label="Skor"
            />
          </div>
        </section>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label class="label" for="score-report">Nilai Laporan PKL</label>
            <input
              id="score-report"
              v-model.number="scoreReport"
              class="input"
              type="number"
              min="0"
              max="100"
              step="1"
              placeholder="0–100 (bobot {{ form.weights.laporan }}%)"
            />
          </div>
          <div>
            <label class="label" for="mentor-name">Nama Pembimbing / Mentor PKL</label>
            <input
              id="mentor-name"
              v-model="mentorName"
              class="input"
              placeholder="Nama penandatangan lembar penilaian"
            />
          </div>
          <div class="sm:col-span-2">
            <label class="label" for="mentor-note">Catatan (opsional)</label>
            <input id="mentor-note" v-model="note" class="input" placeholder="Catatan dari mentor…" />
          </div>
        </div>

        <div class="rounded-lg bg-raise px-4 py-3">
          <p class="text-sm font-semibold text-ink-700">Pratinjau Nilai Akhir</p>
          <dl class="mt-2 grid grid-cols-1 gap-y-1 text-sm sm:grid-cols-3">
            <div class="flex justify-between gap-3 sm:block">
              <dt class="text-ink-500">Rata-rata butir</dt>
              <dd class="font-semibold text-ink-900">{{ rataRata ?? '—' }}</dd>
            </div>
            <div class="flex justify-between gap-3 sm:block">
              <dt class="text-ink-500">Nilai akhir</dt>
              <dd class="font-semibold text-ink-900">{{ nilaiAkhir ?? '—' }}</dd>
            </div>
            <div class="flex justify-between gap-3 sm:block">
              <dt class="text-ink-500">Predikat</dt>
              <dd class="font-semibold text-ink-900">
                {{ predikat ? `${predikat.letter} — ${predikat.label}` : '—' }}
              </dd>
            </div>
          </dl>
          <p class="mt-2 text-xs text-ink-400">{{ form.footnote }}</p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <button type="button" class="btn-primary" @click="openConfirm">
            Kirim &amp; Kunci Nilai
          </button>
          <span class="text-xs text-ink-400">
            Setelah dikirim, nilai tidak dapat diubah oleh siswa.
          </span>
        </div>
      </form>

      <div v-else-if="!locked && !form" class="card py-6 text-center text-sm text-ink-400">
        Definisi penilaian tidak tersedia. Muat ulang halaman ini.
      </div>

      <!-- Rincian butir terkunci -->
      <div v-if="locked && dudi?.aspects?.length" class="card">
        <h2 class="mb-4 text-lg font-semibold text-ink-900">Rincian Butir Penilaian</h2>
        <table class="table">
          <thead>
            <tr>
              <th>Butir</th>
              <th class="text-right">Skor</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in dudi.aspects" :key="`${a.groupCode}${a.code}`">
              <td class="text-ink-700">
                <span class="mr-2 font-mono text-xs text-ink-400">{{ a.groupCode }}{{ a.code }}</span>
                {{ a.label }}
              </td>
              <td class="text-right font-semibold text-ink-900">{{ a.score }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <Modal :open="confirmOpen" title="Konfirmasi nilai final" size="sm" :busy="saving" @close="confirmOpen = false">
      <p class="text-sm text-ink-700">
        Nilai yang sudah dikirim <strong>tidak dapat diubah lagi</strong> oleh siswa. Admin
        hanya dapat membukanya kembali dengan menolak nilai ini.
      </p>
      <dl class="mt-4 space-y-1 rounded-lg bg-raise px-3 py-2 text-sm">
        <div class="flex justify-between">
          <dt class="text-ink-500">Rata-rata butir</dt>
          <dd class="font-semibold text-ink-900">{{ rataRata ?? '—' }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-ink-500">Nilai laporan</dt>
          <dd class="font-semibold text-ink-900">{{ scoreReport ?? '—' }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-ink-500">Nilai akhir</dt>
          <dd class="font-semibold text-ink-900">{{ nilaiAkhir ?? '—' }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-ink-500">Predikat</dt>
          <dd class="font-semibold text-ink-900">
            {{ predikat ? `${predikat.letter} — ${predikat.label}` : '—' }}
          </dd>
        </div>
      </dl>
      <template #footer>
        <div class="flex justify-end gap-2">
          <button class="btn-secondary" :disabled="saving" @click="confirmOpen = false">Batal</button>
          <button class="btn-primary" :disabled="saving" @click="submit">
            {{ saving ? 'Mengirim…' : 'Ya, kirim & kunci' }}
          </button>
        </div>
      </template>
    </Modal>
  </div>
</template>

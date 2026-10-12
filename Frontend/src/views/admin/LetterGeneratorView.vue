<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  cohortService,
  pickActiveCohortId,
  companyService,
  phase4Service,
  userManageService,
  letterGeneratorService,
  type CohortRecord,
  type CompanyOption,
  type UserRecord,
} from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';

/**
 * Generator surat admin:
 * - Surat Permohonan PKL (per perusahaan, multi-siswa satu gelombang)
 * - Surat Pengantar (via bulk letter phase4 + nomor balasan perusahaan)
 * - Surat Penugasan Pembimbing (per guru pembimbing, dasar opsional)
 */
const cohorts = ref<CohortRecord[]>([]);
const companies = ref<CompanyOption[]>([]);
const gurus = ref<UserRecord[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');

const permohonan = ref({ cohortId: '', companyId: '', number: '' });
const pengantar = ref({ supervisorId: '', number: '', replyNumber: '' });
const penugasan = ref({ supervisorId: '', number: '', dasar: '' });

const done = ref<{ title: string; letterId: string } | null>(null);

const cohortOptions = computed(() => cohorts.value);
const canSubmitPermohonan = computed(() => permohonan.value.cohortId && permohonan.value.companyId && !saving.value);
const canSubmitPengantar = computed(() => pengantar.value.supervisorId && !saving.value);
const canSubmitPenugasan = computed(() => penugasan.value.supervisorId && !saving.value);

const loadOptions = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    const [c, comp, g] = await Promise.all([
      cohortService.list(),
      companyService.options(),
      userManageService.list({ role: 'GURU_PEMBIMBING', perPage: 200 }),
    ]);
    cohorts.value = c.items;
    companies.value = comp;
    gurus.value = g.items;
    permohonan.value.cohortId = pickActiveCohortId(c.items);
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const resetForms = (): void => {
  pengantar.value = { supervisorId: pengantar.value.supervisorId, number: '', replyNumber: '' };
  penugasan.value = { supervisorId: penugasan.value.supervisorId, number: '', dasar: '' };
};

const submitPermohonan = async (): Promise<void> => {
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    const r = await letterGeneratorService.generatePermohonan({
      cohortId: permohonan.value.cohortId,
      companyId: permohonan.value.companyId,
      number: permohonan.value.number.trim() || null,
    });
    done.value = { title: 'Surat Permohonan PKL', letterId: r.letterId };
    success.value = `Surat Permohonan terbit — ${r.studentCount ?? 0} siswa, ditandatangani ${r.signerName}.`;
    permohonan.value.number = '';
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

const submitPengantar = async (): Promise<void> => {
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    const r = await phase4Service.generateBulkLetter({
      type: 'SURAT_PENGANTAR',
      number: pengantar.value.number.trim() || null,
      replyNumber: pengantar.value.replyNumber.trim() || null,
      supervisorId: pengantar.value.supervisorId,
    });
    done.value = { title: 'Surat Pengantar', letterId: r.letterId };
    success.value = `Surat Pengantar terbit — ${r.studentCount} siswa, ditandatangani ${r.signerName}.`;
    pengantar.value.number = '';
    pengantar.value.replyNumber = '';
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

const submitPenugasan = async (): Promise<void> => {
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    const r = await letterGeneratorService.generatePenugasan({
      supervisorId: penugasan.value.supervisorId,
      number: penugasan.value.number.trim() || null,
      dasar: penugasan.value.dasar.trim() || null,
    });
    done.value = { title: 'Surat Penugasan Pembimbing', letterId: r.letterId };
    success.value = `Surat Penugasan terbit — ${r.studentCount ?? 0} siswa, ${r.tujuanCount ?? 0} perusahaan tujuan, ditandatangani ${r.signerName}.`;
    penugasan.value.number = '';
    penugasan.value.dasar = '';
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

const downloadDone = async (): Promise<void> => {
  if (!done.value) return;
  try {
    await phase4Service.downloadLetterById(done.value.letterId, `${done.value.title.replace(/\s+/g, '-')}.pdf`);
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

onMounted(() => void loadOptions());
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="bg-green-50 px-3 py-2 text-sm text-green-700">{{ success }}</div>

    <div class="card">
      <h2 class="text-lg font-semibold text-gray-800">Generator Surat</h2>
      <p class="text-sm text-gray-500">Terbitkan surat resmi SMKN 9 Medan sesuai template dinas. Surat langsung tersimpan di daftar Surat Terbit.</p>
    </div>

    <!-- Surat Permohonan -->
    <div class="card">
      <h3 class="mb-3 text-base font-semibold text-gray-800">Surat Permohonan PKL</h3>
      <p class="mb-4 text-sm text-gray-500">Satu surat per perusahaan untuk seluruh siswa yang akan PKL di perusahaan tersebut pada gelombang terpilih.</p>
      <div class="grid gap-4 sm:grid-cols-3">
        <div>
          <label class="label">Gelombang</label>
          <select v-model="permohonan.cohortId" class="input" :disabled="loading">
            <option v-for="c in cohortOptions" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div>
          <label class="label">Perusahaan</label>
          <select v-model="permohonan.companyId" class="input" :disabled="loading">
            <option value="" disabled>Pilih perusahaan…</option>
            <option v-for="co in companies" :key="co.id" :value="co.id">{{ co.name }}</option>
          </select>
        </div>
        <div>
          <label class="label">Nomor Surat (opsional)</label>
          <input v-model="permohonan.number" class="input" type="text" placeholder="421/123/SMKN-9MDN/2026" />
        </div>
      </div>
      <div class="mt-4">
        <button class="btn-primary" :disabled="!canSubmitPermohonan || loading" @click="submitPermohonan">Terbitkan Surat Permohonan</button>
      </div>
    </div>

    <!-- Surat Pengantar -->
    <div class="card">
      <h3 class="mb-3 text-base font-semibold text-gray-800">Surat Pengantar PKL</h3>
      <p class="mb-4 text-sm text-gray-500">Satu surat per guru pembimbing untuk seluruh siswa bimbingannya (multi-perusahaan).</p>
      <div class="grid gap-4 sm:grid-cols-3">
        <div>
          <label class="label">Guru Pembimbing</label>
          <select v-model="pengantar.supervisorId" class="input" :disabled="loading">
            <option value="" disabled>Pilih guru…</option>
            <option v-for="g in gurus" :key="g.id" :value="g.id">
              {{ g.teacherProfile?.fullName ?? g.username }}<template v-if="g.teacherProfile?.nip"> — {{ g.teacherProfile.nip }}</template>
            </option>
          </select>
        </div>
        <div>
          <label class="label">Nomor Surat (opsional)</label>
          <input v-model="pengantar.number" class="input" type="text" placeholder="421/124/SMKN-9MDN/2026" />
        </div>
        <div>
          <label class="label">Nomor Surat Balasan Perusahaan (opsional)</label>
          <input v-model="pengantar.replyNumber" class="input" type="text" placeholder="Nomor balasan/rekomendasi perusahaan" />
        </div>
      </div>
      <div class="mt-4">
        <button class="btn-primary" :disabled="!canSubmitPengantar || loading" @click="submitPengantar">Terbitkan Surat Pengantar</button>
      </div>
    </div>

    <!-- Surat Penugasan -->
    <div class="card">
      <h3 class="mb-3 text-base font-semibold text-gray-800">Surat Penugasan Pembimbing</h3>
      <p class="mb-4 text-sm text-gray-500">Satu surat penugasan per guru pembimbing, mencantumkan siswa bimbingan dan perusahaan tujuan.</p>
      <div class="grid gap-4 sm:grid-cols-3">
        <div>
          <label class="label">Guru Pembimbing</label>
          <select v-model="penugasan.supervisorId" class="input" :disabled="loading">
            <option value="" disabled>Pilih guru…</option>
            <option v-for="g in gurus" :key="g.id" :value="g.id">
              {{ g.teacherProfile?.fullName ?? g.username }}<template v-if="g.teacherProfile?.nip"> — {{ g.teacherProfile.nip }}</template>
            </option>
          </select>
        </div>
        <div>
          <label class="label">Nomor Surat (opsional)</label>
          <input v-model="penugasan.number" class="input" type="text" placeholder="421/125/SMKN-9MDN/2026" />
        </div>
        <div class="sm:col-span-3">
          <label class="label">Dasar Penugasan (opsional — kosongkan untuk dasar baku)</label>
          <textarea v-model="penugasan.dasar" class="input" rows="2" placeholder="Dasar penugasan… (opsional)"></textarea>
        </div>
      </div>
      <div class="mt-4">
        <button class="btn-primary" :disabled="!canSubmitPenugasan || loading" @click="submitPenugasan">Terbitkan Surat Penugasan</button>
      </div>
    </div>

    <Modal :open="!!done" :title="done?.title ?? 'Surat Terbit'" size="sm" @close="done = null">
      <p class="text-sm text-gray-600">Surat berhasil diterbitkan dan tersimpan di daftar Surat Terbit.</p>
      <div class="mt-4 flex justify-end gap-2">
        <button class="btn-secondary" @click="done = null">Tutup</button>
        <button class="btn-primary" @click="downloadDone">Unduh PDF</button>
      </div>
    </Modal>
  </div>
</template>

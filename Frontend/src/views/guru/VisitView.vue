<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import {
  groupService,
  visitService,
  openFileInTab,
  type VisitRecord,
  type VisitStatus,
} from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';

interface SimpleGroup {
  id: string;
  name: string;
}

type Action = 'complete' | 'postpone' | 'cancel';

const groups = ref<SimpleGroup[]>([]);
const visits = ref<VisitRecord[]>([]);
const loading = ref(true);
const saving = ref(false);
const busyId = ref('');
const error = ref('');
const success = ref('');

const form = ref({ groupId: '', scheduledAt: '', note: '' });

// Modal aksi
const action = ref<Action | null>(null);
const activeVisit = ref<VisitRecord | null>(null);
const completeNote = ref('');
const photoFile = ref<File | null>(null);
const newSchedule = ref('');
const actionNote = ref('');

const STATUS_META: Record<VisitStatus, { label: string; cls: string }> = {
  TERJADWAL: { label: 'Terjadwal', cls: 'bg-indigo-100 text-indigo-700' },
  TERTUNDA: { label: 'Tertunda', cls: 'bg-amber-100 text-amber-700' },
  BATAL: { label: 'Batal', cls: 'bg-gray-200 text-gray-600' },
  SELESAI: { label: 'Selesai', cls: 'bg-emerald-100 text-emerald-700' },
};

const actionTitle = computed(() => {
  if (action.value === 'complete') return 'Selesaikan Monitoring';
  if (action.value === 'postpone') return 'Tunda Kunjungan';
  return 'Batalkan Kunjungan';
});

const canSubmit = computed(() => {
  if (action.value === 'complete') return photoFile.value !== null;
  return true;
});

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    groups.value = (await groupService.listSupervised()) as SimpleGroup[];
    visits.value = await visitService.listMine();
    if (groups.value.length > 0 && !form.value.groupId) {
      form.value.groupId = groups.value[0].id;
    }
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const replaceVisit = (updated: VisitRecord): void => {
  const idx = visits.value.findIndex((v) => v.id === updated.id);
  if (idx >= 0) visits.value[idx] = updated;
};

const create = async (): Promise<void> => {
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    await visitService.create({
      groupId: form.value.groupId || null,
      scheduledAt: new Date(form.value.scheduledAt).toISOString(),
      note: form.value.note || null,
    });
    success.value = 'Jadwal kunjungan dibuat.';
    form.value.note = '';
    form.value.scheduledAt = '';
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

const openAction = (type: Action, visit: VisitRecord): void => {
  activeVisit.value = visit;
  action.value = type;
  completeNote.value = visit.note ?? '';
  photoFile.value = null;
  newSchedule.value = '';
  actionNote.value = '';
  error.value = '';
};

const closeAction = (): void => {
  if (saving.value) return;
  action.value = null;
  activeVisit.value = null;
};

const onPickPhoto = (e: Event): void => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  if (file && !['image/jpeg', 'image/png'].includes(file.type)) {
    photoFile.value = null;
    error.value = 'Foto bukti harus JPG atau PNG.';
    input.value = '';
    return;
  }
  photoFile.value = file;
  error.value = '';
};

const submitAction = async (): Promise<void> => {
  const visit = activeVisit.value;
  if (!visit || !action.value) return;
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    if (action.value === 'complete') {
      if (!photoFile.value) {
        error.value = 'Foto bukti wajib dipilih.';
        return;
      }
      const updated = await visitService.complete(visit.id, completeNote.value || undefined, photoFile.value);
      replaceVisit(updated);
      success.value = 'Monitoring selesai — bukti foto tersimpan.';
    } else if (action.value === 'postpone') {
      const updated = await visitService.postpone(visit.id, {
        scheduledAt: newSchedule.value ? new Date(newSchedule.value).toISOString() : undefined,
        note: actionNote.value || undefined,
      });
      replaceVisit(updated);
      success.value = 'Kunjungan ditunda.';
    } else {
      const updated = await visitService.cancel(visit.id, actionNote.value || null);
      replaceVisit(updated);
      success.value = 'Kunjungan dibatalkan.';
    }
    action.value = null;
    activeVisit.value = null;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
};

const resume = async (id: string): Promise<void> => {
  busyId.value = id;
  error.value = '';
  success.value = '';
  try {
    const updated = await visitService.resume(id);
    replaceVisit(updated);
    success.value = 'Kunjungan dilanjutkan.';
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    busyId.value = '';
  }
};

const viewPhoto = async (visit: VisitRecord): Promise<void> => {
  busyId.value = visit.id;
  error.value = '';
  try {
    await openFileInTab(`/visits/${visit.id}/photo`);
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    busyId.value = '';
  }
};

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ success }}</div>

    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Jadwalkan Kunjungan</h2>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label class="label">Kelompok</label>
          <select v-model="form.groupId" class="input">
            <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
        </div>
        <div>
          <label class="label">Waktu</label>
          <input v-model="form.scheduledAt" type="datetime-local" class="input" />
        </div>
        <div>
          <label class="label">Catatan</label>
          <input v-model="form.note" class="input" placeholder="Agenda kunjungan" />
        </div>
      </div>
      <button class="btn-primary mt-3" :disabled="saving || !form.groupId || !form.scheduledAt" @click="create">
        {{ saving ? 'Menyimpan…' : 'Buat Jadwal' }}
      </button>
    </div>

    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Jadwal Kunjungan</h2>
      <div v-if="loading" class="loading" />
      <div v-else class="space-y-3">
        <div v-for="v in visits" :key="v.id" class="rounded-lg border border-gray-200 p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-semibold text-gray-800">{{ v.group?.name ?? 'Kelompok' }}</p>
              <p class="text-xs text-gray-500">
                Dijadwalkan: {{ new Date(v.scheduledAt).toLocaleString('id-ID') }}
              </p>
            </div>
            <span class="badge" :class="STATUS_META[v.status].cls">{{ STATUS_META[v.status].label }}</span>
          </div>

          <p v-if="v.note" class="mt-1 text-sm text-gray-600">{{ v.note }}</p>
          <p v-if="v.visitedAt" class="mt-1 text-xs text-gray-400">
            Diselesaikan: {{ new Date(v.visitedAt).toLocaleString('id-ID') }}
            <span v-if="v.photoName"> · Bukti: {{ v.photoName }}</span>
          </p>

          <div class="mt-3 flex flex-wrap gap-3">
            <template v-if="v.status === 'TERJADWAL'">
              <button class="btn-primary text-xs" @click="openAction('complete', v)">
                Selesaikan…
              </button>
              <button class="btn-secondary text-xs" @click="openAction('postpone', v)">Tunda…</button>
              <button class="btn-danger text-xs" @click="openAction('cancel', v)">Batal…</button>
            </template>
            <template v-else-if="v.status === 'TERTUNDA'">
              <button
                class="btn-primary text-xs"
                :disabled="busyId === v.id"
                @click="resume(v.id)"
              >
                {{ busyId === v.id ? 'Memproses…' : 'Lanjutkan' }}
              </button>
              <button class="btn-danger text-xs" @click="openAction('cancel', v)">Batal…</button>
            </template>
            <button
              v-else-if="v.status === 'SELESAI' && v.photoPath"
              class="btn-secondary text-xs"
              :disabled="busyId === v.id"
              @click="viewPhoto(v)"
            >
              {{ busyId === v.id ? 'Memuat…' : 'Lihat foto bukti' }}
            </button>
          </div>
        </div>
        <p v-if="visits.length === 0" class="py-4 text-center text-gray-400">Belum ada jadwal kunjungan.</p>
      </div>
    </div>

    <Modal :open="action !== null" :title="actionTitle" size="md" :busy="saving" @close="closeAction">
      <div class="space-y-4">
        <p class="text-sm text-gray-600">
          {{ activeVisit?.group?.name ?? 'Kelompok' }} ·
          {{ activeVisit ? new Date(activeVisit.scheduledAt).toLocaleString('id-ID') : '' }}
        </p>

        <template v-if="action === 'complete'">
          <div>
            <label class="label">Foto bukti (JPG/PNG, wajib)</label>
            <input type="file" accept="image/jpeg,image/png" class="input" @change="onPickPhoto" />
            <p v-if="photoFile" class="mt-1 text-xs text-gray-500">{{ photoFile.name }}</p>
          </div>
          <div>
            <label class="label">Catatan</label>
            <input v-model="completeNote" class="input" placeholder="Hasil kunjungan" />
          </div>
        </template>

        <template v-else-if="action === 'postpone'">
          <div>
            <label class="label">Jadwal baru (opsional)</label>
            <input v-model="newSchedule" type="datetime-local" class="input" />
          </div>
          <div>
            <label class="label">Catatan</label>
            <input v-model="actionNote" class="input" placeholder="Alasan penundaan" />
          </div>
        </template>

        <template v-else>
          <div>
            <label class="label">Alasan pembatalan (opsional)</label>
            <textarea v-model="actionNote" class="input" rows="3" placeholder="Catatan pembatalan" />
          </div>
        </template>
      </div>

      <template #footer>
        <button class="btn-secondary" :disabled="saving" @click="closeAction">Batal</button>
        <button class="btn-primary" :disabled="saving || !canSubmit" @click="submitAction">
          {{ saving ? 'Menyimpan…' : 'Simpan' }}
        </button>
      </template>
    </Modal>
  </div>
</template>

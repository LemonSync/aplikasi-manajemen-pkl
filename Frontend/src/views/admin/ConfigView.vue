<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { configService, type ConfigIndustry, type ConfigMajor } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import WaBotCard from './config/WaBotCard.vue';
import { confirmDialog } from '@/composables/useDialog';
import { notify } from '@/composables/useNotify';

const majors = ref<ConfigMajor[]>([]);
const industries = ref<ConfigIndustry[]>([]);
const loading = ref(true);
const saving = ref(false);
const majorModal = ref(false);
const industryModal = ref(false);
const editingMajor = ref<ConfigMajor | null>(null);
const editingIndustry = ref<ConfigIndustry | null>(null);
const majorForm = ref({ code: '', name: '' });
const industryForm = ref({ name: '' });
const canvas = ref<HTMLCanvasElement | null>(null);
const drawing = ref(false);
const hasInk = ref(false);
const signatory = ref<{ name: string; nip: string | null; position: string; hasSignature: boolean } | null>(null);
const signatoryForm = ref({ name: '', nip: '', position: 'Kepala Sekolah' });

const point = (event: PointerEvent): { x: number; y: number } => {
  const rect = canvas.value!.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * (canvas.value!.width / rect.width), y: (event.clientY - rect.top) * (canvas.value!.height / rect.height) };
};
const startDrawing = (event: PointerEvent): void => {
  if (!canvas.value) return;
  drawing.value = true; hasInk.value = true;
  const p = point(event); const ctx = canvas.value.getContext('2d')!;
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#111827';
};
const draw = (event: PointerEvent): void => {
  if (!drawing.value || !canvas.value) return;
  const p = point(event); const ctx = canvas.value.getContext('2d')!; ctx.lineTo(p.x, p.y); ctx.stroke();
};
const stopDrawing = (): void => { drawing.value = false; };
const clearSignature = (): void => {
  const ctx = canvas.value?.getContext('2d'); if (!canvas.value || !ctx) return;
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height); hasInk.value = false;
};
const saveSignature = async (): Promise<void> => {
  if (!canvas.value || !hasInk.value) { notify.error('Tanda tangan belum digambar.'); return; }
  saving.value = true; notify.clear();
  try { await configService.saveSignature(canvas.value.toDataURL('image/png')); notify.success('Tanda tangan Kepala Sekolah disimpan dan akan dipakai pada surat baru.'); signatory.value = await configService.signatory(); clearSignature(); }
  catch (e) { notify.error(extractErrorMessage(e)); } finally { saving.value = false; }
};
const saveSignatory = async (): Promise<void> => {
  if (!signatoryForm.value.name.trim()) { notify.error('Nama Kepala Sekolah wajib diisi.'); return; }
  saving.value = true; notify.clear();
  try {
    await configService.saveSignatory({ name: signatoryForm.value.name.trim(), nip: signatoryForm.value.nip.trim() || null, position: signatoryForm.value.position.trim() });
    signatory.value = await configService.signatory();
    notify.success('Identitas Kepala Sekolah disimpan dan berlaku untuk semua surat baru.');
  } catch (e) { notify.error(extractErrorMessage(e)); } finally { saving.value = false; }
};

const load = async (): Promise<void> => {
  loading.value = true;
  try {
  [majors.value, industries.value, signatory.value] = await Promise.all([configService.majors(), configService.industries(), configService.signatory()]);
  signatoryForm.value = { name: signatory.value?.name ?? 'Kepala Sekolah', nip: signatory.value?.nip ?? '', position: signatory.value?.position ?? 'Kepala Sekolah' };
  } catch (e) { notify.error(extractErrorMessage(e)); }
  finally { loading.value = false; }
};

const openMajor = (item?: ConfigMajor): void => {
  editingMajor.value = item ?? null;
  majorForm.value = { code: item?.code ?? '', name: item?.name ?? '' };
  majorModal.value = true;
};
const openIndustry = (item?: ConfigIndustry): void => {
  editingIndustry.value = item ?? null;
  industryForm.value = { name: item?.name ?? '' };
  industryModal.value = true;
};
const saveMajor = async (): Promise<void> => {
  saving.value = true; notify.clear();
  try {
    if (editingMajor.value) await configService.updateMajor(editingMajor.value.id, majorForm.value);
    else await configService.createMajor({ code: majorForm.value.code.trim().toUpperCase(), name: majorForm.value.name.trim() });
    majorModal.value = false; notify.success('Data jurusan disimpan.'); await load();
  } catch (e) { notify.error(extractErrorMessage(e)); } finally { saving.value = false; }
};
const saveIndustry = async (): Promise<void> => {
  saving.value = true; notify.clear();
  try {
    if (editingIndustry.value) await configService.updateIndustry(editingIndustry.value.id, industryForm.value);
    else await configService.createIndustry({ name: industryForm.value.name.trim() });
    industryModal.value = false; notify.success('Data industri disimpan.'); await load();
  } catch (e) { notify.error(extractErrorMessage(e)); } finally { saving.value = false; }
};
const removeMajor = async (item: ConfigMajor): Promise<void> => {
  const ok = await confirmDialog({ title: 'Hapus Jurusan', message: `Hapus jurusan ${item.code}?`, confirmLabel: 'Hapus', danger: true });
  if (!ok) return;
  try { await configService.removeMajor(item.id); notify.success('Jurusan dihapus.'); await load(); } catch (e) { notify.error(extractErrorMessage(e)); }
};
const removeIndustry = async (item: ConfigIndustry): Promise<void> => {
  const ok = await confirmDialog({ title: 'Hapus Bidang Industri', message: `Hapus bidang industri ${item.name}?`, confirmLabel: 'Hapus', danger: true });
  if (!ok) return;
  try { await configService.removeIndustry(item.id); notify.success('Bidang industri dihapus.'); await load(); } catch (e) { notify.error(extractErrorMessage(e)); }
};
onMounted(() => void load());
</script>

<template>
  <div class="space-y-6">
    <div class="card">
      <div class="mb-3"><h2 class="text-lg font-semibold">Tanda Tangan Kepala Sekolah</h2><p class="text-sm text-gray-500">Gambar sekali di canvas. Tanda tangan akan ditempel otomatis pada semua surat PDF baru.</p></div>
      <div class="mb-4 grid gap-3 sm:grid-cols-3">
        <div><label class="label">Nama Kepala Sekolah</label><input v-model="signatoryForm.name" class="input" placeholder="Nama lengkap" /></div>
        <div><label class="label">NIP</label><input v-model="signatoryForm.nip" class="input" placeholder="NIP (opsional)" /></div>
        <div><label class="label">Jabatan</label><input v-model="signatoryForm.position" class="input" placeholder="Kepala Sekolah" /></div>
      </div>
      <div class="mb-3 flex flex-wrap items-center gap-3 text-sm text-gray-600"><span>Status tanda tangan: <strong>{{ signatory?.hasSignature ? 'Sudah tersimpan' : 'Belum ada' }}</strong></span><button class="btn-secondary !px-3 !py-1.5" :disabled="saving" @click="saveSignatory">Simpan Identitas</button></div>
      <div class="max-w-2xl rounded border border-dashed border-gray-400 bg-white">
        <canvas ref="canvas" width="900" height="260" class="block h-48 w-full touch-none" @pointerdown="startDrawing" @pointermove="draw" @pointerup="stopDrawing" @pointerleave="stopDrawing" />
      </div>
      <div class="mt-3 flex gap-2"><button class="btn-secondary" :disabled="saving" @click="clearSignature">Bersihkan</button><button class="btn-primary" :disabled="saving" @click="saveSignature">{{ saving ? 'Menyimpan…' : 'Simpan Tanda Tangan' }}</button></div>
    </div>
    <WaBotCard />
    <div class="card">
      <div class="mb-4 flex items-center justify-between"><div><h2 class="text-lg font-semibold">Kode & Nama Jurusan</h2><p class="text-sm text-gray-500">Dipakai Master Siswa, Master Guru, dan daftar kelas.</p></div><button class="btn-primary" @click="openMajor()">Tambah Jurusan</button></div>
      <div v-if="loading" class="loading" /><table v-else class="table"><thead><tr><th>Kode</th><th>Nama Jurusan</th><th class="text-right">Aksi</th></tr></thead><tbody><tr v-for="m in majors" :key="m.id"><td class="font-mono">{{ m.code }}</td><td>{{ m.name }}</td><td class="text-right"><button class="text-primary-600 hover:underline" @click="openMajor(m)">Ubah</button><button class="ml-3 text-red-600 hover:underline" @click="removeMajor(m)">Hapus</button></td></tr><tr v-if="!majors.length"><td colspan="3" class="py-4 text-center text-gray-400">Belum ada jurusan.</td></tr></tbody></table>
    </div>
    <div class="card">
      <div class="mb-4 flex items-center justify-between"><div><h2 class="text-lg font-semibold">Bidang Industri</h2><p class="text-sm text-gray-500">Dipakai saat menambah perusahaan.</p></div><button class="btn-primary" @click="openIndustry()">Tambah Industri</button></div>
      <table class="table"><thead><tr><th>Nama</th><th class="text-right">Aksi</th></tr></thead><tbody><tr v-for="i in industries" :key="i.id"><td>{{ i.name }}</td><td class="text-right"><button class="text-primary-600 hover:underline" @click="openIndustry(i)">Ubah</button><button class="ml-3 text-red-600 hover:underline" @click="removeIndustry(i)">Hapus</button></td></tr><tr v-if="!industries.length"><td colspan="2" class="py-4 text-center text-gray-400">Belum ada bidang industri.</td></tr></tbody></table>
    </div>
    <Modal :open="majorModal" :title="editingMajor ? 'Ubah Jurusan' : 'Tambah Jurusan'" :busy="saving" @close="majorModal = false"><div class="space-y-3"><div><label class="label">Kode</label><input v-model="majorForm.code" class="input" :disabled="!!editingMajor" placeholder="RPL" /></div><div><label class="label">Nama Jurusan</label><input v-model="majorForm.name" class="input" placeholder="Rekayasa Perangkat Lunak" /></div></div><template #footer><button class="btn-secondary" @click="majorModal = false">Batal</button><button class="btn-primary" :disabled="saving || !majorForm.code || !majorForm.name" @click="saveMajor">Simpan</button></template></Modal>
    <Modal :open="industryModal" :title="editingIndustry ? 'Ubah Industri' : 'Tambah Industri'" :busy="saving" @close="industryModal = false"><div><label class="label">Nama Bidang Industri</label><input v-model="industryForm.name" class="input" placeholder="Teknologi Informasi" /></div><template #footer><button class="btn-secondary" @click="industryModal = false">Batal</button><button class="btn-primary" :disabled="saving || !industryForm.name" @click="saveIndustry">Simpan</button></template></Modal>
  </div>
</template>

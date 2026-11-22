<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Modal from '@/components/Modal.vue';
import { extractErrorMessage } from '@/services/http';
import { waBotService, type WaGuide } from '@/services/api.service';
import WaGuideNode from './WaGuideNode.vue';
import { confirmDialog } from '@/composables/useDialog';
import {
  BUTTON_TEXT_MAX,
  LEVEL_HINT,
  LEVEL_NAME,
  MAX_BUTTON_MESSAGES,
  MAX_DEPTH,
  MAX_INLINE_BUTTONS,
  previewModeFor,
  sortByOrder,
  truncationNote,
  type GuideActions,
} from './waGuideTree';
import { notify } from '@/composables/useNotify';

const props = defineProps<{ hasContact?: boolean }>();

const guides = ref<WaGuide[]>([]);
const loading = ref(true);
const busy = ref(false);
const expanded = ref(new Set<string>());

const modal = ref(false);
const editing = ref<WaGuide | null>(null);
const form = ref({ parentId: '', rowId: '', label: '', body: '', order: 0, role: 'SISWA' as 'SISWA' | 'GURU' | 'ADMIN' });

/** `parentId` node akar null di database, tapi "" di UI — disamakan di sini. */
const childrenOf = (id: string): WaGuide[] => guides.value.filter((g) => (g.parentId ?? '') === id).sort(sortByOrder);
const roots = computed(() => childrenOf(''));
const nodeById = computed(() => new Map(guides.value.map((g) => [g.id, g])));

/** Jalur akar → node, untuk menjelaskan "di mana" tombol ini muncul. */
const pathOf = (id: string | null): WaGuide[] => {
  const chain: WaGuide[] = [];
  let cursor = id ? nodeById.value.get(id) ?? null : null;
  while (cursor && chain.length <= MAX_DEPTH + 1) {
    chain.unshift(cursor);
    cursor = cursor.parentId ? nodeById.value.get(cursor.parentId) ?? null : null;
  }
  return chain;
};

const currentChildren = computed(() => (editing.value ? childrenOf(editing.value.id) : []));
const isBranch = computed(() => currentChildren.value.length > 0);
const selectedParent = computed(() => (form.value.parentId ? nodeById.value.get(form.value.parentId) ?? null : null));
const selectedParentPath = computed(() => pathOf(form.value.parentId).map((g) => g.label));

/** Isi pesan yang dikirim node ini: cabang -> daftar bawahannya, langkah -> teks. */
const ownRows = computed(() => currentChildren.value.map((c) => c.label));
const ownMode = computed<'tombol' | 'daftar' | 'teks'>(() => (isBranch.value ? previewModeFor(currentChildren.value) : 'teks'));

/** Pilihan yang akan tampil di menu induk setelah disimpan (termasuk node ini). */
const parentRows = computed(() => {
  const self = form.value.label.trim() || editing.value?.label || '';
  const siblings = childrenOf(form.value.parentId)
    .filter((g) => g.id !== editing.value?.id)
    .map((g) => g.label);
  return self ? [...siblings, self] : siblings;
});
const parentMode = computed<'tombol' | 'daftar'>(() =>
  parentRows.value.length <= MAX_INLINE_BUTTONS * MAX_BUTTON_MESSAGES ? 'tombol' : 'daftar'
);
const parentNote = computed(() => truncationNote(parentRows.value.map((label) => ({ label })), parentMode.value));
const ownNote = computed(() => (isBranch.value ? truncationNote(currentChildren.value, ownMode.value) : null));

/** Induk yang masih boleh dipilih: kedalaman + tidak berada di dalam cabang yang dipindah. */
const parentOptions = computed(() => {
  const banned = new Set<string>();
  if (editing.value) {
    const walk = (id: string) => {
      banned.add(id);
      childrenOf(id).forEach((c) => walk(c.id));
    };
    walk(editing.value.id);
  }
  return guides.value.filter((g) => g.depth < MAX_DEPTH && !banned.has(g.id)).sort((a, b) => a.depth - b.depth || a.order - b.order);
});

const levelOfForm = computed(() => (selectedParent.value ? Math.min(selectedParent.value.depth + 1, MAX_DEPTH) : 0));
const bodyLabel = computed(() =>
  isBranch.value ? 'Keterangan singkat untuk cabang ini (opsional)' : 'Isi pesan yang dikirim bot (langkah-langkah)'
);
const modalTitle = computed(() => {
  if (editing.value) return `Ubah tombol: ${editing.value.label}`;
  const inPath = selectedParentPath.value.length ? ` › ${selectedParentPath.value.join(' › ')}` : '';
  return `Tombol baru di menu${inPath}`;
});

const load = async (): Promise<void> => {
  loading.value = true;
  try {
    guides.value = await waBotService.guides();
    expanded.value = new Set(guides.value.filter((g) => g.depth < MAX_DEPTH).map((g) => g.id));
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    loading.value = false;
  }
};

const run = async (okMessage: string, action: () => Promise<unknown>): Promise<boolean> => {
  busy.value = true;
  notify.clear();
  try {
    await action();
    notify.success(okMessage);
    return true;
  } catch (e) {
    notify.error(extractErrorMessage(e));
    return false;
  } finally {
    busy.value = false;
  }
};

const openAddRoot = (): void => {
  editing.value = null;
  form.value = { parentId: '', rowId: '', label: '', body: '', order: (roots.value.length + 1) * 10, role: 'SISWA' };
  modal.value = true;
};

const openEdit = (guide: WaGuide): void => {
  editing.value = guide;
  form.value = {
    parentId: guide.parentId ?? '',
    rowId: guide.rowId,
    label: guide.label,
    body: guide.body ?? '',
    order: guide.order,
    role: guide.role as 'SISWA' | 'GURU' | 'ADMIN',
  };
  modal.value = true;
};

const openAddChild = (guide: WaGuide): void => {
  editing.value = null;
  form.value = {
    parentId: guide.id,
    rowId: '',
    label: '',
    body: '',
    order: (childrenOf(guide.id).length + 1) * 10,
    role: guide.role as 'SISWA' | 'GURU' | 'ADMIN',
  };
  if (guide.depth + 1 <= MAX_DEPTH) expanded.value.add(guide.id);
  modal.value = true;
};

const save = async (): Promise<void> => {
  const parentId = form.value.parentId || null;
  const payload = {
    parentId,
    rowId: form.value.rowId.trim().toLowerCase(),
    label: form.value.label.trim(),
    body: form.value.body.trim() || null,
    order: Number(form.value.order) || 0,
    ...(parentId ? {} : { role: form.value.role }),
  };
  const target = editing.value;
  const ok = await run(target ? 'Tombol diperbarui.' : 'Tombol ditambahkan — langsung terpakai di chat berikutnya.', async () => {
    if (target) await waBotService.updateGuide(target.id, payload);
    else await waBotService.createGuide(payload);
    guides.value = await waBotService.guides();
    modal.value = false;
  });
  if (ok && !target && parentId) expanded.value.add(parentId);
};

const setActive = async (guide: WaGuide): Promise<void> => {
  const ok = await run(guide.isActive ? `"${guide.label}" disembunyikan dari bot.` : `"${guide.label}" tampil lagi.`, async () => {
    await waBotService.updateGuide(guide.id, { isActive: !guide.isActive });
    guides.value = await waBotService.guides();
  });
  if (!ok) guides.value = await waBotService.guides();
};

const remove = async (guide: WaGuide): Promise<void> => {
  const kids = childrenOf(guide.id);
  const ok = await confirmDialog({
    title: 'Hapus Tombol Panduan',
    message: kids.length
      ? `Hapus "${guide.label}" beserta ${kids.length} tombol di bawahnya?`
      : `Hapus "${guide.label}"?`,
    confirmLabel: 'Hapus',
    danger: true,
  });
  if (!ok) return;
  await run('Tombol dihapus.', async () => {
    await waBotService.removeGuide(guide.id);
    guides.value = await waBotService.guides();
  });
};

const setImage = async (guide: WaGuide, file: File): Promise<void> => {
  if (file.size > 512 * 1024) {
    notify.error('Gambar panduan maksimal 512 KB (PNG/JPEG).');
    return;
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Gambar tidak dapat dibaca'));
    reader.readAsDataURL(file);
  });
  await run('Gambar disimpan — bot mengirimnya bersama teks langkah ini.', async () => {
    await waBotService.saveGuideImage(guide.id, dataUrl);
    guides.value = await waBotService.guides();
  });
};

const dropImage = async (guide: WaGuide): Promise<void> => {
  await run('Gambar dihapus.', async () => {
    await waBotService.removeGuideImage(guide.id);
    guides.value = await waBotService.guides();
  });
};

const actions: GuideActions = {
  edit: openEdit,
  addChild: openAddChild,
  setActive: (g) => void setActive(g),
  remove: (g) => void remove(g),
  setImage: (g, f) => void setImage(g, f),
  dropImage: (g) => void dropImage(g),
  toggleExpand: (g) => {
    if (expanded.value.has(g.id)) expanded.value.delete(g.id);
    else expanded.value.add(g.id);
  },
  isExpanded: (g) => expanded.value.has(g.id),
};

const expandAll = (): void => {
  expanded.value = new Set(guides.value.filter((g) => g.depth < MAX_DEPTH).map((g) => g.id));
};
const collapseAll = (): void => {
  expanded.value = new Set();
};

onMounted(() => void load());
</script>

<template>
  <div>
    <div class="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
      <p class="text-sm font-medium text-gray-800">Begini cara membacanya</p>
      <p class="mt-1">
        Baris paling luar = tombol pertama yang dilihat orang saat chat ke nomor bot. Buka sebuah baris (<b>▸</b>) untuk melihat
        tombol di bawahnya. Baris yang tidak punya anak lagi = <b>pesan yang benar-benar dikirim bot</b> (teks + gambar).
      </p>
      <p class="mt-1">
        Setiap node punya 3 bagian penting: <b>Teks tombol</b> (yang dibaca user), <b>Kode</b> (alamat teknis, tidak bisa diganti
        setelah dibuat), dan <b>Isi pesan</b> (langkah-langkah).
      </p>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <button class="btn-primary" @click="openAddRoot">+ Menu awal (peran)</button>
      <button class="btn-secondary" @click="expandAll">Buka semua</button>
      <button class="btn-secondary" @click="collapseAll">Tutup semua</button>
    </div>

    <div v-if="loading" class="loading my-4" />
    <div v-else-if="!roots.length" class="my-3 rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">
      Pohon panduan masih kosong — bot hanya mengirim teks sapaan. Mulai dengan menekan <b>+ Menu awal (peran)</b>, misalnya
      “Saya Siswa”, lalu tambahkan topik di dalamnya.
    </div>
    <div v-else class="mt-3 space-y-2">
      <WaGuideNode v-for="r in roots" :key="r.id" :guide="r" :nodes="guides" :depth="0" :actions="actions" />
    </div>

    <Modal :open="modal" :title="modalTitle" :busy="busy" @close="modal = false">
      <div class="space-y-3">

        <div>
          <label class="label">Tampil di dalam</label>
          <select v-model="form.parentId" class="input">
            <option value="">Menu awal — tombol pertama saat orang chat</option>
            <option v-for="p in parentOptions" :key="p.id" :value="p.id">
              {{ '— '.repeat(p.depth) }}{{ p.label }} ({{ LEVEL_NAME[p.depth] }})
            </option>
          </select>
          <p class="mt-1 text-xs text-gray-500">
            <template v-if="selectedParent">Tombol ini akan muncul setelah user menekan: <b>{{ selectedParentPath.join(' › ') }}</b>.</template>
            <template v-else>Ini tingkat pertama, jadi semua orang melihatnya paling awal. <b>{{ LEVEL_HINT[0] }}</b></template>
          </p>
        </div>

        <div>
          <label class="label">Teks tombol</label>
          <input v-model="form.label" class="input" placeholder="Saya Siswa" maxlength="120" />
          <p class="mt-1 text-xs" :class="form.label.length > BUTTON_TEXT_MAX ? 'text-amber-700' : 'text-gray-500'">
            {{ form.label.length || 0 }} karakter. WhatsApp hanya menampilkan {{ MAX_INLINE_BUTTONS }} tombol per pesan, jadi sampai
            {{ MAX_INLINE_BUTTONS * MAX_BUTTON_MESSAGES }} pilihan tetap tampil sebagai tombol (boleh dua pesan); lebih dari itu bot mengirim
            daftar bernomor yang bisa dijawab dengan angka. Label lebih dari {{ BUTTON_TEXT_MAX }} huruf terpotong di tombol.
          </p>
          <p v-if="parentNote" class="mt-1 text-xs text-amber-700">{{ parentNote }}</p>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="label">Kode tombol</label>
            <input v-model="form.rowId" class="input font-mono" placeholder="peran-siswa" maxlength="60" :disabled="!!editing" />
            <p v-if="editing" class="mt-1 text-xs text-gray-500">Kode dikunci karena tombol sudah pernah terkirim ke user.</p>
            <p v-else class="mt-1 text-xs text-gray-500">Huruf kecil saja, contoh <span class="font-mono">siswa-absen</span>. Bisa dipakai user untuk mengetik langsung di chat.</p>
          </div>
          <div>
            <label class="label">Urutan tampil</label>
            <input v-model.number="form.order" type="number" min="0" max="999" class="input" />
            <p class="mt-1 text-xs text-gray-500">Angka kecil lebih dulu. Pakai kelipatan 10 agar mudah menyisip.</p>
          </div>
        </div>

        <div v-if="!form.parentId">
          <label class="label">Peran</label>
          <select v-model="form.role" class="input">
            <option value="SISWA">Siswa</option>
            <option value="GURU">Guru Pembimbing</option>
            <option value="ADMIN">Admin</option>
          </select>
          <p class="mt-1 text-xs text-gray-500">Penanda saja — tombol tingkat awal tetap dilihat semua orang.</p>
        </div>

        <div>
          <label class="label">{{ bodyLabel }}</label>
          <textarea v-model="form.body" rows="5" class="input" :placeholder="isBranch ? 'Misal: Tahap mengajukan tempat PKL dan melengkapi berkas.' : '1. Login web PKL, buka menu Absensi.\n2. Check in pagi hari, check out saat selesai.'" />
          <p v-if="isBranch" class="mt-1 text-xs text-gray-500">
            Cabang ini punya {{ currentChildren.length }} bawahan, jadi bot mengirim <b>daftar pilihan</b>, bukan teks panjang.
            Isi kolom ini hanya sebagai keterangan singkat.
          </p>
          <p v-else-if="!form.body.trim()" class="mt-1 text-xs text-red-700">Masih kosong — user hanya akan menerima judul tombol, tanpa langkah. Isi teks panduannya.</p>
        </div>

        <div class="rounded-lg border border-gray-200 p-3">
          <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Pratinjau balasan bot</p>
          <p class="mt-1 text-xs text-gray-500">
            Posisi: <b>{{ selectedParent ? selectedParentPath.join(' › ') : 'Menu awal' }}</b> → jadi <b>{{ LEVEL_NAME[levelOfForm] }}</b> · bot menjawab dengan <b>{{ ownMode }}</b>.
          </p>

          <div class="mt-2 max-w-md rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <template v-if="isBranch">
              <p class="text-sm font-medium text-gray-900">{{ form.label || '(judul tombol)' }}</p>
              <p class="text-xs text-gray-600">{{ form.body || '(keterangan singkat)' }}</p>
              <div class="mt-2 space-y-1">
                <p v-for="(row, i) in ownRows" :key="i" class="rounded border border-emerald-200 bg-white px-2 py-1 text-xs">{{ row }}</p>
              </div>
            </template>
            <template v-else>
              <p class="whitespace-pre-line text-xs text-gray-800">{{ form.body || '(isi pesan muncul di sini)' }}</p>
              <p class="mt-1 text-[11px] italic text-gray-500">Masih bingung? Ketik menu untuk panduan lain, atau admin untuk menghubungi petugas.</p>
            </template>
            <div class="mt-2 flex flex-wrap gap-1">
              <span class="rounded border border-emerald-300 bg-white px-2 py-0.5 text-[11px]">Kembali ke Menu</span>
              <span v-if="selectedParent" class="rounded border border-emerald-300 bg-white px-2 py-0.5 text-[11px]">Kembali ke {{ selectedParent.label }}</span>
              <span v-if="hasContact" class="rounded border border-emerald-300 bg-white px-2 py-0.5 text-[11px]">Hubungi Admin</span>
            </div>
            <p class="mt-1 text-[11px] text-gray-400">Tombol navigasi maksimal {{ MAX_INLINE_BUTTONS }} — link web Sistem Manajemen PKL ditulis di dalam pesan.</p>
          </div>

          <p v-if="ownNote" class="mt-2 text-xs text-amber-700">{{ ownNote }}</p>

          <p class="mt-2 text-xs text-gray-500">
            Menu induknya akan berisi {{ parentRows.length }} pilihan dan dikirim sebagai <b>{{ parentMode }}</b>.
            <template v-if="parentMode === 'daftar'">Lebih dari {{ MAX_INLINE_BUTTONS * MAX_BUTTON_MESSAGES }} pilihan tidak muat jadi tombol — bot mengirim daftar bernomor dan user menjawab dengan angka.</template>
          </p>
        </div>
      </div>

      <template #footer>
        <button class="btn-secondary" @click="modal = false">Batal</button>
        <button class="btn-primary" :disabled="busy || !form.label.trim() || (!editing && !form.rowId.trim())" @click="save">Simpan</button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import WaGuideTree from './WaGuideTree.vue';
import { confirmDialog } from '@/composables/useDialog';
import { extractErrorMessage } from '@/services/http';
import {
  cohortService,
  waBotService,
  type CohortRecord,
  type WaConnection,
  type WaGroup,
  type WaMessage,
  type WaSettings,
} from '@/services/api.service';
import { notify } from '@/composables/useNotify';

const STATE_LABEL: Record<WaConnection['state'], string> = {
  idle: 'Belum terhubung',
  connecting: 'Menyambung…',
  qr: 'Menunggu tautan perangkat',
  connected: 'Terhubung',
};

const loading = ref(true);
const busy = ref(false);

const serverEnabled = ref(false);
const connection = ref<WaConnection | null>(null);
const settings = ref<WaSettings | null>(null);
const form = ref({
  groupEnabled: true,
  reminderEnabled: true,
  welcomeText: '',
  csContact: '',
  groupAdmins: '',
  retentionDays: 30,
  spamWindowSec: 15,
  spamMaxPerWindow: 5,
  spamCooldownSec: 45,
});

const cohorts = ref<CohortRecord[]>([]);
const groups = ref<WaGroup[]>([]);
const messages = ref<WaMessage[]>([]);
const logLoaded = ref(false);

const pairingNumber = ref('');
const pairingCode = ref('');
const newGroupCohort = ref('');
const adoptInvite = ref('');

let poll: ReturnType<typeof setInterval> | null = null;
let cooldownTimer: ReturnType<typeof setInterval> | null = null;
let pairingTimer: ReturnType<typeof setInterval> | null = null;
/** Hitung mundur permintaan pembuatan grup — WhatsApp menahan grup berikutnya (45 detik). */
const groupCooldown = ref(0);
/** Kode pairing cuma sebentar; hitung mundur memaksa admin kirim ulang alih-alih mengetik kode mati. */
const pairingSeconds = ref(0);

const startGroupCooldown = (seconds = 45): void => {
  groupCooldown.value = seconds;
  if (cooldownTimer) clearInterval(cooldownTimer);
  cooldownTimer = setInterval(() => {
    groupCooldown.value -= 1;
    if (groupCooldown.value <= 0 && cooldownTimer) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
  }, 1000);
};
const stopGroupCooldown = (): void => {
  if (!cooldownTimer) return;
  clearInterval(cooldownTimer);
  cooldownTimer = null;
  groupCooldown.value = 0;
};

const startPairingCountdown = (seconds = 60): void => {
  pairingSeconds.value = seconds;
  if (pairingTimer) clearInterval(pairingTimer);
  pairingTimer = setInterval(() => {
    pairingSeconds.value -= 1;
    if (pairingSeconds.value <= 0) {
      pairingCode.value = '';
      if (pairingTimer) {
        clearInterval(pairingTimer);
        pairingTimer = null;
      }
    }
  }, 1000);
};
const stopPairingCountdown = (): void => {
  if (pairingTimer) {
    clearInterval(pairingTimer);
    pairingTimer = null;
  }
  pairingSeconds.value = 0;
};

const connected = computed(() => connection.value?.state === 'connected');
const awaitingLink = computed(() => connection.value?.state === 'qr' || connection.value?.state === 'connecting');
const missingCohorts = computed(() => cohorts.value.filter((c) => !groups.value.some((g) => g.cohortId === c.id)));
const botNumber = computed(() => settings.value?.botNumber ?? null);

const statusLabel = computed(() => {
  const state = connection.value?.state;
  const base = state ? STATE_LABEL[state] : '…';
  return botNumber.value ? `${base} • ${botNumber.value}` : base;
});
const statusClass = computed(() =>
  connected.value
    ? 'bg-emerald-100 text-emerald-800'
    : awaitingLink.value
      ? 'bg-amber-100 text-amber-800'
      : 'bg-gray-100 text-gray-600'
);
const sinceLabel = computed(() => {
  const since = connection.value?.since;
  return since ? new Date(since).toLocaleString('id-ID') : '—';
});
/** Alasan tombol grup mati — admin tidak perlu menebak-nebak. */
const groupBlocker = computed(() => {
  if (!connected.value) return 'Hubungkan bot dahulu di bagian 1.';
  if (groupCooldown.value > 0) return `WhatsApp membatasi pembuatan grup berurutan — tunggu ${groupCooldown.value} detik.`;
  if (!missingCohorts.value.length) return 'Semua gelombang sudah punya grup.';
  return '';
});

const applySettingsToForm = (s: WaSettings): void => {
  settings.value = s;
  form.value = {
    groupEnabled: s.groupEnabled,
    reminderEnabled: s.reminderEnabled,
    welcomeText: s.welcomeText,
    csContact: s.csContact,
    groupAdmins: s.groupAdmins.join(', '),
    retentionDays: s.retentionDays,
    spamWindowSec: s.spam.windowSec,
    spamMaxPerWindow: s.spam.maxPerWindow,
    spamCooldownSec: s.spam.cooldownSec,
  };
  if (!pairingNumber.value && s.botNumber) pairingNumber.value = s.botNumber;
};

const refreshStatus = async (): Promise<void> => {
  try {
    const status = await waBotService.status();
    serverEnabled.value = status.serverEnabled;
    connection.value = status.connection;
    applySettingsToForm(status.settings);
    if (!poll && (status.connection.state === 'qr' || status.connection.state === 'connecting')) startPolling();
    if (status.connection.state === 'connected' && poll) stopPolling();
  } catch (e) {
    notify.error(extractErrorMessage(e));
  }
};

const load = async (): Promise<void> => {
  loading.value = true;
  notify.clear();
  try {
    const status = await waBotService.status();
    serverEnabled.value = status.serverEnabled;
    connection.value = status.connection;
    applySettingsToForm(status.settings);
    [cohorts.value, groups.value] = await Promise.all([
      cohortService.list().then((r) => r.items),
      waBotService.groups(),
    ]);
    if (status.connection.state === 'qr' || status.connection.state === 'connecting') startPolling();
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    loading.value = false;
  }
};

const startPolling = (): void => {
  if (poll) return;
  poll = setInterval(refreshStatus, 3000);
};
const stopPolling = (): void => {
  if (!poll) return;
  clearInterval(poll);
  poll = null;
};

const run = async (label: string, action: () => Promise<unknown>, okMessage?: string): Promise<boolean> => {
  busy.value = true;
  notify.clear();
  try {
    await action();
    notify.success(okMessage ?? label);
    return true;
  } catch (e) {
    const message = extractErrorMessage(e);
    notify.error(message);
    const wait = /Coba lagi dalam (\d+) detik/.exec(message);
    if (wait) startGroupCooldown(Number(wait[1]));
    return false;
  } finally {
    busy.value = false;
  }
};

const saveSettings = async (): Promise<void> => {
  await run('Pengaturan bot disimpan', async () => {
    const saved = await waBotService.saveSettings({
      groupEnabled: form.value.groupEnabled,
      reminderEnabled: form.value.reminderEnabled,
      welcomeText: form.value.welcomeText.trim(),
      csContact: form.value.csContact.trim(),
      groupAdmins: form.value.groupAdmins.split(',').map((v) => v.trim()).filter(Boolean),
      retentionDays: Number(form.value.retentionDays) || 30,
      spam: {
        windowSec: Number(form.value.spamWindowSec) || 15,
        maxPerWindow: Number(form.value.spamMaxPerWindow) || 5,
        cooldownSec: Number(form.value.spamCooldownSec) || 45,
      },
    });
    applySettingsToForm(saved.settings);
    connection.value = saved.connection;
  });
};

const startBot = async (): Promise<void> => {
  await run('Koneksi dimulai', async () => {
    connection.value = await waBotService.start();
    if (!connected.value) startPolling();
  }, 'Koneksi dimulai — QR tampil di bawah, atau pakai kode pairing (Cara A).');
};

/** QR lama bisa kedaluwarsa sebelum discan; stop+start memaksa socket membuat QR baru. */
const restartBot = async (): Promise<void> => {
  await run('Koneksi dimuat ulang', async () => {
    await waBotService.stop();
    connection.value = await waBotService.start();
    if (!connected.value) startPolling();
  }, 'Koneksi dimulai ulang — QR baru muncul dalam beberapa detik.');
};

const stopBot = async (): Promise<void> => {
  await run('Koneksi dihentikan', async () => {
    connection.value = await waBotService.stop();
    stopPolling();
    stopPairingCountdown();
    pairingCode.value = '';
  });
};

const logoutBot = async (): Promise<void> => {
  const ok = await confirmDialog({
    title: 'Putuskan Bot WhatsApp',
    message:
      'Putuskan perangkat dan hapus sesi bot dari server? Setelah ini bot harus ditautkan ulang (kode pairing / QR).',
    confirmLabel: 'Putuskan',
    danger: true,
  });
  if (!ok) return;
  await run('Sesi bot dihapus', async () => {
    connection.value = await waBotService.logout();
    stopPolling();
    stopPairingCountdown();
    pairingCode.value = '';
  }, 'Sesi lama terhapus. Silakan tautkan ulang lewat Cara A / Cara B.');
};

const askPairing = async (): Promise<void> => {
  pairingCode.value = '';
  stopPairingCountdown();
  const ok = await run('Kode pairing diminta', async () => {
    pairingCode.value = await waBotService.pairing(pairingNumber.value.trim());
  });
  if (ok && pairingCode.value) {
    startPairingCountdown();
    startPolling();
    notify.success(`Masukkan ${pairingCode.value} di HP nomor bot: WhatsApp → Perangkat Tertaut → Tautkan dengan nomor telepon.`);
  }
};

const createGroup = async (): Promise<void> => {
  if (!newGroupCohort.value) {
    notify.error('Pilih gelombang yang akan dibuatkan grupnya.');
    return;
  }
  const cohortId = newGroupCohort.value;
  const ok = await run('Grup dibuat', async () => {
    const result = await waBotService.createGroup(cohortId);
    groups.value = result.isNew ? [...groups.value, result.group] : groups.value;
    newGroupCohort.value = '';
    if (result.skippedAdmins.length) {
      notify.error(`Nomor admin berikut tidak terdaftar di WhatsApp dan dilewati: ${result.skippedAdmins.join(', ')}`);
    }
  }, 'Grup pengumuman siap (mode pengumuman). Salin link invite-nya lalu bagikan ke siswa.');
  if (ok) startGroupCooldown();
};

/** Jalur cadangan: admin membuat grup manual di HP bot, kita tinggal pakai link undangannya. */
const adoptGroup = async (): Promise<void> => {
  if (!newGroupCohort.value || !adoptInvite.value.trim()) {
    notify.error('Pilih gelombang dahulu, lalu tempel link undangan grupnya.');
    return;
  }
  const cohortId = newGroupCohort.value;
  await run('Bot masuk ke grup', async () => {
    const group = await waBotService.adoptGroup(cohortId, adoptInvite.value.trim());
    groups.value = groups.value.some((g) => g.cohortId === group.cohortId)
      ? groups.value.map((g) => (g.cohortId === group.cohortId ? group : g))
      : [...groups.value, group];
    adoptInvite.value = '';
    newGroupCohort.value = '';
  }, 'Bot bergabung ke grup itu dan menguncinya ke mode pengumuman — pengingat fase sudah bisa jalan.');
};

const syncGroups = async (): Promise<void> => {
  const ok = await run('Sinkron grup', async () => {
    const result = await waBotService.syncGroups();
    groups.value = await waBotService.groups();
    const bits = [`${result.created.length} grup dibuat`, `${result.existing} grup sudah ada`];
    if (result.deferred.length) bits.push(`${result.deferred.length} gelombang ditunda (WhatsApp membatasi pembuatan grup) — jalankan sinkron lagi dalam beberapa menit`);
    if (result.failed.length) bits.push(`${result.failed.length} gagal: ${result.failed[0].error}`);
    if (result.skippedAdmins.length) bits.push(`nomor admin dilewati: ${result.skippedAdmins.join(', ')}`);
    notify.success(`Sinkron grup — ${bits.join('; ')}.`);
  });
  if (ok) startGroupCooldown();
};

const takeInvite = async (group: WaGroup): Promise<void> => {
  let link = group.invite;
  await run('Link grup diperbarui', async () => {
    const fresh = await waBotService.refreshInvite(group.cohortId);
    groups.value = groups.value.map((g) => (g.id === fresh.id ? fresh : g));
    link = fresh.invite;
  });
  if (!link) {
    notify.error('WhatsApp belum mengembalikan link invite untuk grup ini.');
    return;
  }
  try {
    await navigator.clipboard.writeText(link);
    notify.success('Link grup disalin. Bagikan ke siswa — yang masuk otomatis dibisukan (mode pengumuman).');
  } catch {
    window.open(link, '_blank', 'noopener');
  }
};

const testReminder = async (group: WaGroup): Promise<void> => {
  await run('Pengingat contoh terkirim', () => waBotService.testReminder(group.cohortId), 'Bot mengirim contoh pengingat (hidetag) ke grup itu.');
};

const loadLog = async (): Promise<void> => {
  await run('Log dimuat', async () => {
    messages.value = await waBotService.messages(50);
    logLoaded.value = true;
  });
};

onMounted(() => void load());
onBeforeUnmount(() => {
  stopPolling();
  stopGroupCooldown();
  stopPairingCountdown();
});
</script>

<template>
  <div class="card">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 class="text-lg font-semibold">Bot WhatsApp</h2>
        <p class="text-sm text-gray-500">Grup pengumuman per gelombang + pengingat fase + panduan chat otomatis. Bot tidak pernah chat duluan ke siswa.</p>
      </div>
      <span class="rounded px-2 py-1 text-xs font-medium" :class="statusClass">{{ statusLabel }}</span>
    </div>

    <div v-if="!serverEnabled" class="mb-3 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      Bot dimatikan di level server. Tambahkan <code class="font-mono">WA_ENABLED=true</code> pada <code class="font-mono">Backend/.env</code> (atau environment pm2/Docker) lalu mulai ulang backend.
    </div>
    <div v-if="connection?.lastError" class="mb-3 bg-red-50 px-3 py-2 text-sm text-red-700">Koneksi terakhir: {{ connection.lastError }}</div>

    <div v-if="loading" class="loading" />
    <template v-else>
      <p v-if="!connected" class="mb-5 text-xs text-gray-500">
        Urutan pakai: <b>1</b> tautkan bot → <b>2</b> atur fitur &amp; simpan → <b>3</b> buat grup per gelombang lalu bagikan link-nya → <b>4</b> rapihkan tombol panduan.
      </p>

      <section class="mb-6 border-t border-gray-200 pt-4">
        <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-500">1. Koneksi Bot <span class="font-normal normal-case tracking-normal text-gray-400">— tautkan nomor WhatsApp sekali saja</span></h3>

        <div v-if="connected" class="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p class="text-sm font-medium text-emerald-800">Terhubung sebagai {{ connection?.botName || botNumber || connection?.botJid }}</p>
          <p class="text-xs text-emerald-700">Sejak {{ sinceLabel }}. Pengaturan, grup, dan pengingat sudah bisa dipakai.</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <button class="btn-secondary" :disabled="busy" @click="stopBot">Hentikan Sementara</button>
            <button class="btn-secondary" :disabled="busy" @click="logoutBot">Putuskan &amp; Hapus Sesi</button>
          </div>
          <p class="mt-1 text-xs text-emerald-700">“Hentikan Sementara” menyimpan sesi (tombol Mulai menyambung kembali tanpa scan). “Putuskan &amp; Hapus Sesi” melepas perangkat tertaut dan menghapus kredensial di server.</p>
        </div>

        <div v-else class="mt-3 space-y-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Cara A — Kode pairing (paling mudah, tanpa scan)</p>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <input v-model="pairingNumber" class="input w-full max-w-52 font-mono" placeholder="6281234567890" inputmode="numeric" maxlength="17" />
              <button class="btn-primary" :disabled="busy || !serverEnabled || pairingNumber.trim().length < 11" @click="askPairing">
                {{ busy ? 'Menyiapkan kode…' : 'Kirim Kode' }}
              </button>
            </div>
            <p class="mt-1 text-xs text-gray-500">
              Nomor bot apa adanya, diawali <b>62</b> (contoh <span class="font-mono">6281234567890</span>, bukan <span class="font-mono">0812…</span>).
              Bot di server lain harus sudah mati — satu nomor tidak bisa ditautkan dua bot bersamaan.
            </p>

            <div v-if="pairingCode" class="mt-2 rounded-lg bg-gray-900 px-3 py-2 text-white">
              <p class="font-mono text-2xl tracking-[0.3em]">{{ pairingCode }}</p>
              <p class="text-xs text-gray-300">Kode berlaku ±60 detik ({{ pairingSeconds }} dtk lagi). Masukkan di HP yang memegang nomor bot.</p>
            </div>
            <ol v-else class="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-gray-600">
              <li>HP nomor bot: <b>WhatsApp → Settings → Linked devices → Link a device</b>.</li>
              <li>Pilih <b>Link with phone number</b>, ketik kode 8 karakter dari tombol “Kirim Kode”.</li>
              <li>Status di halaman ini berubah hijau sendiri (diperiksa tiap 3 detik).</li>
            </ol>
          </div>

          <hr class="border-gray-200" />

          <div class="flex flex-wrap items-start gap-4">
            <div class="min-w-52">
              <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Cara B — Scan QR</p>
              <div class="mt-2 flex flex-wrap gap-2">
                <button v-if="!connection?.qr" class="btn-secondary" :disabled="busy || !serverEnabled" @click="startBot">Tampilkan QR</button>
                <template v-else>
                  <button class="btn-secondary" :disabled="busy" @click="restartBot">QR Baru</button>
                  <span v-if="awaitingLink" class="self-center text-xs text-gray-500">Menunggu tautan…</span>
                </template>
              </div>
              <p class="mt-1 text-xs text-gray-500">QR kedaluwarsa dalam ~40 detik — pakai tombol “QR Baru” kalau terlanjur pudar.</p>
            </div>
            <div v-if="connection?.qr" class="text-center">
              <img :src="connection.qr" alt="QR WhatsApp" class="h-44 w-44 border border-gray-200 bg-white" />
              <p class="mt-1 text-xs text-gray-500">WhatsApp → Perangkat Tertaut → Tautkan Perangkat</p>
            </div>
          </div>
        </div>
      </section>

      <section class="mb-6 border-t border-gray-200 pt-4">
        <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-500">2. Pengaturan Fitur</h3>
        <p class="mt-1 text-xs text-gray-500">Menyalakan/mematikan koneksi ada di bagian 1 — di sini hanya apa yang boleh dilakukan bot.</p>

        <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label class="flex items-start gap-2 text-sm">
            <input v-model="form.groupEnabled" type="checkbox" class="mt-0.5 h-4 w-4" />
            <span>Grup otomatis per gelombang<span class="block text-xs text-gray-500">Grup dibuat ber-mode pengumuman; link yang dibagikan, nomor siswa tidak diambil.</span></span>
          </label>
          <label class="flex items-start gap-2 text-sm">
            <input v-model="form.reminderEnabled" type="checkbox" class="mt-0.5 h-4 w-4" />
            <span>Pengingat fase di grup<span class="block text-xs text-gray-500">Hidetag sesuai jadwal fase pendaftaran/kegiatan.</span></span>
          </label>
          <div>
            <label class="label">Umur simpan log (hari)</label>
            <input v-model.number="form.retentionDays" type="number" min="0" max="365" class="input" />
          </div>
        </div>

        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label class="label">Kontak petugas (tombol “Hubungi Admin”)</label>
            <input v-model="form.csContact" class="input" placeholder="https://wa.me/62812… atau (021) 1234" />
            <p v-if="!form.csContact.trim()" class="mt-1 text-xs text-amber-700">Kosong = bot tidak menampilkan kontak; siswa hanya diberi tombol menu lagi.</p>
          </div>
          <div>
            <label class="label">Nomor admin grup (pisahkan koma)</label>
            <input v-model="form.groupAdmins" class="input font-mono" placeholder="6281234567890, 6289876543210" />
            <p class="mt-1 text-xs text-gray-500">Format <span class="font-mono">628…</span> (bukan <span class="font-mono">08…</span>). Nomor ini dijadikan admin grup dan ikut menerima pengingat — hanya petugas yang Anda kehendaki.</p>
          </div>
        </div>

        <div class="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label class="label">Jendela hitung spam (detik)</label>
            <input v-model.number="form.spamWindowSec" type="number" min="5" max="300" class="input" />
          </div>
          <div>
            <label class="label">Maksimal balasan bot per jendela</label>
            <input v-model.number="form.spamMaxPerWindow" type="number" min="1" max="20" class="input" />
          </div>
          <div>
            <label class="label">Cooldown (detik)</label>
            <input v-model.number="form.spamCooldownSec" type="number" min="10" max="600" class="input" />
          </div>
        </div>
        <p class="mt-1 text-xs text-gray-500">
          Penahan spam chat pribadi — yang dihitung <b>balasan yang dikirim bot</b>, bukan pesan yang masuk, karena satu klik
          tombol bisa menghasilkan 2-3 pesan. Setelah <b>{{ form.spamMaxPerWindow || 0 }}</b> balasan dalam
          <b>{{ form.spamWindowSec || 0 }}</b> detik, bot berhenti membalas teks selama minimal
          <b>{{ form.spamCooldownSec || 0 }}</b> detik dan hanya menempelkan reaksi ⏳ (sekali per masa tahan).
          Hitungannya dibaca dari log percakapan, jadi tetap berlaku walau server nyala ulang atau ada lebih dari satu proses bot yang terhubung.
        </p>

        <div class="mt-3">
          <label class="label">Sapaan bot di chat pribadi</label>
          <textarea v-model="form.welcomeText" rows="3" class="input" />
          <p v-if="!form.welcomeText.trim()" class="mt-1 text-xs text-amber-700">Wajib diisi — bot menolak menyimpan sapaan kosong.</p>
        </div>

        <button class="btn-primary mt-3" :disabled="busy || !form.welcomeText.trim()" @click="saveSettings">{{ busy ? 'Menyimpan…' : 'Simpan Pengaturan' }}</button>
      </section>

      <section class="mb-6 border-t border-gray-200 pt-4">
        <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-500">3. Grup per Gelombang</h3>
        <p v-if="groupBlocker" class="mt-1 text-xs text-amber-700">{{ groupBlocker }}</p>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <select v-model="newGroupCohort" class="input max-w-64">
            <option value="">— pilih gelombang tanpa grup —</option>
            <option v-for="c in missingCohorts" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <button class="btn-secondary" :disabled="busy || !!groupBlocker || !newGroupCohort" @click="createGroup">
            {{ groupCooldown > 0 ? `Buat Grup (${groupCooldown}s)` : 'Buat Grup' }}
          </button>
          <button class="btn-secondary" :disabled="busy || !!groupBlocker" @click="syncGroups">
            {{ groupCooldown > 0 ? `Sinkron (${groupCooldown}s)` : 'Sinkron Semua' }}
          </button>
          <span class="text-xs text-gray-500">“Sinkron Semua” membuat maksimal 3 grup per klik (sisa kuota WhatsApp).</span>
        </div>

        <div class="mt-3 rounded-lg border border-dashed border-gray-300 p-3">
          <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Bila WhatsApp menolak bot membuat grup</p>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <input v-model="adoptInvite" class="input max-w-96 flex-1" placeholder="https://chat.whatsapp.com/…" />
            <button class="btn-secondary" :disabled="busy || !connected || !newGroupCohort || !adoptInvite.trim()" @click="adoptGroup">Gabung Grup (manual)</button>
          </div>
          <ol class="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-gray-600">
            <li>Buat grupnya manual di HP bot, nama bebas (contoh: “PKL Gelombang 3”); set <b>Only admins send messages</b>.</li>
            <li>Pilih gelombangnya di atas, tempel link undangannya, klik <b>Gabung Grup (manual)</b>.</li>
            <li>Bot masuk, mengunci grup ke mode pengumuman, memasukkan admin, lalu memakai grup itu untuk pengingat.</li>
          </ol>
        </div>

        <div class="mt-3 overflow-x-auto">
          <table class="table">
            <thead><tr><th>Gelombang</th><th>Judul Grup</th><th>Link Invite</th><th class="text-right">Aksi</th></tr></thead>
            <tbody>
              <tr v-for="g in groups" :key="g.id">
                <td>{{ g.cohortName ?? '(gelombang dihapus)' }}<span class="ml-2 text-xs text-gray-500">{{ g.cohortStatus }}</span></td>
                <td class="max-w-64 truncate">{{ g.subject }}</td>
                <td class="max-w-72"><a v-if="g.invite" :href="g.invite" target="_blank" rel="noopener" class="break-all text-primary-600 hover:underline">{{ g.invite }}</a><span v-else class="text-gray-400">belum diambil</span></td>
                <td class="whitespace-nowrap text-right">
                  <button class="text-primary-600 hover:underline" :disabled="busy || !connected" @click="takeInvite(g)">Ambil Link</button>
                  <button class="ml-3 text-primary-600 hover:underline" :disabled="busy || !connected" @click="testReminder(g)">Tes Pengingat</button>
                </td>
              </tr>
              <tr v-if="!groups.length"><td colspan="4" class="py-4 text-center text-gray-400">Belum ada grup. Grup dibuat otomatis saat gelombang baru ditambahkan, atau pakai tombol di atas.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="mb-6 border-t border-gray-200 pt-4">
        <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-500">4. Tombol Panduan Chat Pribadi</h3>
        <WaGuideTree :has-contact="!!form.csContact.trim()" />
      </section>

      <section class="border-t border-gray-200 pt-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-500">5. Log Percakapan</h3>
            <p class="text-xs text-gray-500">Isi pesan pribadi disamarkan di server; yang tersimpan hanya arah, chat, jenis, dan kutipan singkat.</p>
          </div>
          <button class="btn-secondary" :disabled="busy" @click="loadLog">{{ logLoaded ? 'Muat Ulang' : 'Muat Log' }}</button>
        </div>
        <div v-if="logLoaded" class="mt-3 overflow-x-auto">
          <table class="table">
            <thead><tr><th>Waktu</th><th>Arah</th><th>Chat</th><th>Jenis</th><th>Isi</th></tr></thead>
            <tbody>
              <tr v-for="m in messages" :key="m.id">
                <td class="whitespace-nowrap text-xs">{{ new Date(m.createdAt).toLocaleString('id-ID') }}</td>
                <td :class="m.direction === 'IN' ? 'text-blue-700' : 'text-emerald-700'" class="text-xs">{{ m.direction }}</td>
                <td class="font-mono text-xs">{{ m.chatJid }}</td>
                <td class="text-xs">{{ m.kind }}</td>
                <td class="max-w-md truncate text-xs" :title="m.body ?? ''">{{ m.body }}</td>
              </tr>
              <tr v-if="!messages.length"><td colspan="5" class="py-4 text-center text-gray-400">Belum ada percakapan.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

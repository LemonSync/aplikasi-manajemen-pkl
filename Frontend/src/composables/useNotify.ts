import { reactive } from 'vue';
import { toast } from './useToast';

export type NotifyKind = 'error' | 'success' | 'info';

export interface NotifyMessage {
  kind: NotifyKind;
  message: string;
}

/**
 * Lapisan tunggal untuk pesan hasil aksi (error/sukses/info).
 *
 * Aturan penampilannya: kalau sedang ada modal terbuka, pesan diarahkan ke
 * modal itu — pengguna tidak boleh melihat error di belakang dialog yang masih
 * menutupi layar. Kalau tidak ada modal, pesan jadi toast. Karena itu view
 * tidak perlu lagi punya `<div>` error/sukses sendiri.
 */
const stack = reactive<string[]>([]);
const messages = reactive<Record<string, NotifyMessage>>({});
let seq = 0;

const top = (): string | undefined => stack[stack.length - 1];

const emit = (kind: NotifyKind, message: string): void => {
  const target = top();
  if (target) {
    messages[target] = { kind, message };
    return;
  }
  if (kind === 'error') toast.error(message);
  else if (kind === 'success') toast.success(message);
  else toast.info(message);
};

export const notify = {
  error: (message: string): void => emit('error', message),
  success: (message: string): void => emit('success', message),
  info: (message: string): void => emit('info', message),
  /** Bersihkan pesan pada modal paling atas (dipakai saat memulai aksi baru). */
  clear: (): void => {
    const target = top();
    if (target) delete messages[target];
  },
};

/** Dipakai `Modal.vue` untuk mendaftar/tarik diri dari antrean dialog. */
export const notifyScope = {
  open: (): string => {
    const id = `modal-${++seq}`;
    stack.push(id);
    return id;
  },
  close: (id: string): void => {
    const index = stack.indexOf(id);
    if (index >= 0) stack.splice(index, 1);
    delete messages[id];
  },
  /** Pesan yang berhak ditampilkan modal ini — hanya modal paling atas. */
  messageFor: (id: string): NotifyMessage | undefined =>
    top() === id ? messages[id] : undefined,
};

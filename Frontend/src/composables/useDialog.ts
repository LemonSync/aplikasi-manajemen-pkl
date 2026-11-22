import { reactive } from 'vue';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Tombol OK diwarnai merah — dipakai untuk aksi menghapus/membatalkan. */
  danger?: boolean;
}

const state = reactive<{ options: ConfirmOptions | null; seq: number }>({
  options: null,
  seq: 0,
});

let resolveCurrent: ((accepted: boolean) => void) | null = null;

const settle = (accepted: boolean): void => {
  const resolve = resolveCurrent;
  resolveCurrent = null;
  state.options = null;
  resolve?.(accepted);
};

/**
 * Pengganti `window.confirm()` — diproses `DialogHost.vue` dan selalu
 * diselesaikan: `false` berarti pengguna membatalkan.
 */
export const confirmDialog = (options: ConfirmOptions | string): Promise<boolean> => {
  // Dialog yang diminta saat dialog lain masih terbuka dianggap dibatalkan,
  // supaya tidak ada promise yang menggantung selamanya.
  if (resolveCurrent) settle(false);
  return new Promise<boolean>((resolve) => {
    state.seq += 1;
    state.options = typeof options === 'string' ? { message: options } : options;
    resolveCurrent = resolve;
  });
};

export const dialog = {
  state,
  settle,
};

import { reactive, readonly } from 'vue';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  /** Lama tampil dalam ms — dipakai juga oleh batang hitung mundur di Toaster. */
  ttl: number;
}

const items = reactive<ToastItem[]>([]);
let seq = 0;

const dismiss = (id: number): void => {
  const index = items.findIndex((t) => t.id === id);
  if (index >= 0) items.splice(index, 1);
};

const push = (kind: ToastKind, message: string): number => {
  // Pesan error butuh waktu baca lebih lama daripada konfirmasi sukses.
  const ttl = kind === 'error' ? 6000 : 3500;
  const item: ToastItem = { id: ++seq, kind, message, ttl };
  items.push(item);
  setTimeout(() => dismiss(item.id), ttl);
  return item.id;
};

/**
 * Singleton notifikasi global. Dipakai menggantikan `<div>` error/sukses yang
 * sebelumnya ditulis inline di tiap view.
 */
export const toast = {
  items: readonly(items),
  success: (message: string): number => push('success', message),
  error: (message: string): number => push('error', message),
  info: (message: string): number => push('info', message),
  dismiss,
};

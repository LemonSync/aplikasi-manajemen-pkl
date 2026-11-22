import { onBeforeUnmount, ref, type Ref } from 'vue';

export interface ScrollState {
  /** 0..1 posisi gulir dokumen; 0 saat halaman tidak bisa digulir. */
  ratio: Ref<number>;
  /** true begitu dokumen bergeser minimal 8px dari atas. */
  scrolled: Ref<boolean>;
  /** Posisi gulir dalam piksel — dipakai sebagai ambang munculnya tombol ke atas. */
  y: Ref<number>;
}

/**
 * Posisi gulir untuk indikator baca & elevasi header.
 *
 * Dibaca dalam satu requestAnimationFrame per event: listener scroll passive yang
 * menghitung langsung akan jalan 60+ kali per detik dan ikut menggerakkan layout.
 * ResizeObserver diperlukan karena tinggi konten sering baru berubah setelah data
 * async masuk (rasio 40% bisa jadi 90% tanpa ada event scroll).
 */
export const useScrollProgress = (): ScrollState => {
  const ratio = ref(0);
  const scrolled = ref(false);
  const y = ref(0);
  let frame = 0;

  const read = (): void => {
    frame = 0;
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    const pos = window.scrollY;
    y.value = pos;
    ratio.value = max > 8 ? Math.min(1, Math.max(0, pos / max)) : 0;
    scrolled.value = pos > 8;
  };

  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(read);
  };

  read();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  const ro = new ResizeObserver(schedule);
  ro.observe(document.documentElement);

  onBeforeUnmount(() => {
    if (frame) cancelAnimationFrame(frame);
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    ro.disconnect();
  });

  return { ratio, scrolled, y };
};

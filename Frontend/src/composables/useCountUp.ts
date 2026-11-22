import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { useReducedMotion } from './useReducedMotion';

const easeOutQuart = (t: number): number => 1 - Math.pow(1 - t, 4);

/**
 * Angka yang bergerak menuju nilai baru alih-alih melompat.
 * Pengurangannya easing-nya eksponensial keluar supaya bagian tersisa (yang dibaca
 * orang di akhir animasi) bergerak paling pelan.
 */
export const useCountUp = (source: Ref<number>, duration = 850): Ref<number> => {
  const display = ref(Number.isFinite(source.value) ? source.value : 0);
  const reduced = useReducedMotion();
  let frame = 0;

  watch(
    () => source.value,
    (to, from) => {
      if (!Number.isFinite(to)) {
        display.value = to;
        return;
      }
      if (reduced.value) {
        display.value = to;
        return;
      }
      if (frame) cancelAnimationFrame(frame);
      const start = performance.now();
      const origin = Number.isFinite(from) ? from : 0;

      const tick = (now: number): void => {
        frame = 0;
        const t = Math.min(1, (now - start) / duration);
        display.value = origin + (to - origin) * easeOutQuart(t);
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }
  );

  onBeforeUnmount(() => {
    if (frame) cancelAnimationFrame(frame);
  });

  return display;
};

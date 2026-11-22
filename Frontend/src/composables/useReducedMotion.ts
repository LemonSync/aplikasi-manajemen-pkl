import { readonly, ref, type Ref } from 'vue';

const reduced = ref(false);
let watching = false;

/**
 * Satu sumber kebenaran untuk preferensi gerakan. Dipakai lapisan animasi JS
 * (riak, count-up, reveal) agar tidak berjalan melawan pengaturan OS pengguna;
 * lapisan CSS sudah ditangani blok `prefers-reduced-motion` di main.css.
 */
export const useReducedMotion = (): Readonly<Ref<boolean>> => {
  if (!watching) {
    watching = true;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduced.value = mq.matches;
    mq.addEventListener('change', (event) => {
      reduced.value = event.matches;
    });
  }
  return readonly(reduced);
};

import { onBeforeUnmount, ref, type Ref } from 'vue';
import { useRouter } from 'vue-router';

/**
 * Progress bar perpindahan halaman.
 *
 * Versi lama hanya "kedip" 500 ms memakai setTimeout, jadi lebarnya tidak pernah
 * benar-benar bergerak. Versi ini memakai hook router: naik ke 80% saat navigasi
 * dimulai, selesai ke 100% saat navigasi tuntas — sehingga panjang bar bermakna.
 */
export const useRouteProgress = (): { active: Ref<boolean>; width: Ref<string> } => {
  const router = useRouter();
  const active = ref(false);
  const width = ref('0%');
  let timers: ReturnType<typeof setTimeout>[] = [];

  const clear = (): void => {
    timers.forEach(clearTimeout);
    timers = [];
  };

  const stopBefore = router.beforeEach(() => {
    clear();
    active.value = true;
    width.value = '0%';
    // Two-step: biarkan transisi 0 -> 80% terlihat, lalu tunggu afterEach.
    timers.push(setTimeout(() => (width.value = '80%'), 20));
    return true;
  });

  const stopAfter = router.afterEach(() => {
    clear();
    width.value = '100%';
    timers.push(setTimeout(() => (active.value = false), 260));
    timers.push(setTimeout(() => (width.value = '0%'), 560));
  });

  onBeforeUnmount(() => {
    stopBefore();
    stopAfter();
    clear();
  });

  return { active, width };
};

import { onBeforeUnmount, watch, type Ref } from 'vue';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Mengunci focus di dalam `container` selama `active` benar, lalu mengembalikan
 * focus ke elemen yang aktif sebelumnya saat lepas. Dipakai drawer, modal, dan menu.
 */
export const useFocusTrap = (
  container: Ref<HTMLElement | null | undefined>,
  active: Ref<boolean>
): void => {
  let lastFocused: HTMLElement | null = null;

  const items = (): HTMLElement[] => {
    const root = container.value;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
    );
  };

  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab') return;
    const list = items();
    if (list.length === 0) {
      e.preventDefault();
      return;
    }
    const first = list[0];
    const last = list[list.length - 1];
    const current = document.activeElement as HTMLElement | null;
    const inside = container.value?.contains(current ?? null) ?? false;

    if (!inside) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && current === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && current === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const release = (): void => {
    document.removeEventListener('keydown', onKeydown, true);
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    lastFocused = null;
  };

  watch(
    active,
    (on) => {
      if (on) {
        lastFocused = document.activeElement as HTMLElement | null;
        document.addEventListener('keydown', onKeydown, true);
        // Tunggu slot drawer/modal ter-render sebelum mencari target focus.
        requestAnimationFrame(() => {
          const el = document.activeElement;
          if (container.value && el && container.value.contains(el)) return;
          items()[0]?.focus();
        });
      } else {
        release();
      }
    },
    { immediate: true }
  );

  onBeforeUnmount(() => {
    if (active.value) release();
  });
};

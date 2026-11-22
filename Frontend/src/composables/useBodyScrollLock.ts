import { onBeforeUnmount, watch, type Ref } from 'vue';

/**
 * Scroll lock dengan penghitung, bukan assignment langsung.
 * Diperlukan karena drawer dan modal bisa aktif bersamaan (mis. modal ganti
 * password dibuka di atas drawer yang masih terbuka); versi lama di Modal.vue
 * menulis `overflow = ''` saat lepas sehingga drawer yang masih buka ikut
 * mengembalikan scroll body.
 */
let holders = 0;
let previousOverflow = '';

const acquire = (): void => {
  if (holders === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  holders += 1;
};

const release = (): void => {
  holders = Math.max(0, holders - 1);
  if (holders === 0) document.body.style.overflow = previousOverflow;
};

export const useBodyScrollLock = (active: Ref<boolean>): void => {
  watch(active, (on) => (on ? acquire() : release()));

  onBeforeUnmount(() => {
    if (active.value) release();
  });
};

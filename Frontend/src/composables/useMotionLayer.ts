import { useReducedMotion } from './useReducedMotion';

const REVEAL_SELECTOR = '[data-reveal], .card:not(.no-reveal)';
/** Sama dengan daftar selector yang diberi `overflow:hidden` di main.css. */
const RIPPLE_HOSTS = '.btn, .menu-item, .side-link, [data-ripple]';

let installed = false;

const installReveal = (): void => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target as HTMLElement;
        el.classList.remove('reveal-pending');
        el.classList.add('is-revealed');
        observer.unobserve(el);
      });
    },
    // Sedikit masuk dari bawah batas viewport: elemen baru "sudah" muncul saat
    // ujungnya terlihat, bukan saat setengah tubuhnya sudah terbaca.
    { rootMargin: '0px 0px -6% 0px', threshold: 0.02 }
  );

  /**
   * Elemen yang sudah pernah diproses. Vue menulis ulang atribut `class` saat
   * me-render ulang kartu dengan `:class`, dan tanpa catatan ini scanner berikutnya
   * akan memasang `reveal-pending` lagi pada kartu yang sudah kelihatan — hasilnya
   * kontennya berkedip hilang sesaat.
   */
  const seen = new WeakSet<HTMLElement>();

  const scan = (): void => {
    document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      el.classList.add('reveal-pending');

      const delay = el.dataset.revealDelay;
      if (delay) {
        el.style.setProperty('--reveal-delay', `${delay}ms`);
      } else if (el.classList.contains('card')) {
        // Kartu tanpa atribut jeda: ikut posisinya di antara tetangga yang sama-sama
        // menunggu, supaya grid 6 kartu tidak muncul sekaligus sebagai satu dinding.
        const row = el.parentElement
          ? Array.from(el.parentElement.children).filter((n) => n.classList.contains('card'))
          : [];
        el.style.setProperty('--reveal-delay', `${Math.min(row.indexOf(el), 6) * 60}ms`);
      }
      observer.observe(el);
    });
  };

  // Dipindai sekali per gelombang mutasi (di-debounce), bukan per mutasi:
  // perpindahan halaman dan datangnya baris tabel mengubah subtree bertubi-tubi.
  let timer: ReturnType<typeof setTimeout> | undefined;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(scan, 120);
  }).observe(document.body, { childList: true, subtree: true });

  scan();
};

const installRipple = (): void => {
  const reduced = useReducedMotion();

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (reduced.value) return;
      const host = (event.target as HTMLElement | null)?.closest<HTMLElement>(RIPPLE_HOSTS);
      if (!host) return;
      const rect = host.getBoundingClientRect();
      // Diameter = diagonal, jadi lingkaran selalu menutupi sudut terjauh
      // dari titik klik tanpa harus menghitung jarak tiap sudut.
      const size = Math.hypot(rect.width, rect.height);
      const ink = document.createElement('span');
      ink.className = 'ripple-ink';
      ink.style.width = `${size}px`;
      ink.style.height = `${size}px`;
      ink.style.left = `${event.clientX - rect.left - size / 2}px`;
      ink.style.top = `${event.clientY - rect.top - size / 2}px`;
      host.appendChild(ink);
      setTimeout(() => ink.remove(), 620);
    },
    { passive: true }
  );
};

/**
 * Lapisan gerak global: scroll-reveal dan riak klik.
 *
 * Reveal menargetkan `[data-reveal]` DAN setiap `.card`, jadi view yang tidak
 * disentuh pun ikut punya gerak masuk. Sengaja dipasang lewat MutationObserver +
 * delegasi event, bukan direktif Vue, supaya view cukup menulis atribut tanpa
 * mengimpor apa pun (direktif global tidak dikenali vue-tsc di <script setup>).
 */
export const installMotionLayer = (): void => {
  if (installed) return;
  installed = true;
  // Semua keadaan "belum muncul" di CSS digembok di belakang html.motion-ready.
  // Tanpa IntersectionObserver gemboknya tidak pernah dipasang, jadi konten tetap
  // terbaca alih-alih hilang selamanya.
  if (!('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('motion-ready');
  installReveal();
  installRipple();
};

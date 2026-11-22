/** @type {import('tailwindcss').Config} */

/**
 * Ramp warna dipetakan ke channel triple CSS variable (`--p-600: 90 99 211`) dan
 * dibungkus `rgb(... / <alpha-value>)`. Pola ini wajib, bukan estetika: menyimpan
 * hex penuh di variable membuat Tailwind tidak bisa menghitung alpha, sehingga
 * ~8 pemakaian modifier opacity (`bg-ink-950/60`, `bg-primary-500/25`, ...) rusak senyap.
 */
const ramp = (prefix, stops) =>
  Object.fromEntries(stops.map((s) => [s, `rgb(var(--${prefix}-${s}) / <alpha-value>)`]));

const full = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // === Ramp yang sudah dipakai kode (nama class tidak berubah) ===
        primary: ramp('p', full),
        ink: ramp('k', [...full, 950]),

        // `gray` adalah palet BAWAAN Tailwind dan justru yang paling banyak dipakai
        // (498 pemakaian, > ink 55 + primary 95). Dioverride di sini supaya seluruh
        // view ikut tersesut tanpa disentuh.
        gray: ramp('k', full),

        // Warna semantik mentah yang terlanjur dipakai per-view (369 pemakaian)
        // dipetakan ke empat ramp semantik agar paletnya koheren.
        red: ramp('no', full),
        rose: ramp('no', full),
        emerald: ramp('ok', full),
        green: ramp('ok', full),
        amber: ramp('warn', full),
        yellow: ramp('warn', full),
        orange: ramp('warn', full),
        blue: ramp('info', full),
        sky: ramp('info', full),
        cyan: ramp('info', full),
        indigo: ramp('p', full),
        violet: ramp('p', full),
        purple: ramp('p', full),

        // === Alias semantik: dipakai kode baru (primitif + 5 view) ===
        canvas: 'var(--bg)',
        surface: 'var(--surface)',
        raise: 'var(--surface-2)',
        line: 'var(--border)',
        'line-strong': 'var(--border-strong)',
        fg: 'var(--text)',
        'fg-muted': 'var(--text-muted)',
        'fg-faint': 'var(--text-faint)',
        ok: { ...ramp('ok', full), DEFAULT: 'var(--ok)', soft: 'var(--ok-soft)' },
        warn: { ...ramp('warn', full), DEFAULT: 'var(--warn)', soft: 'var(--warn-soft)' },
        no: { ...ramp('no', full), DEFAULT: 'var(--no)', soft: 'var(--no-soft)' },
        info: { ...ramp('info', full), DEFAULT: 'var(--info)', soft: 'var(--info-soft)' },
        accent: 'var(--accent)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: 'var(--r-md)',
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
        '2xl': 'var(--r-xl)',
        full: 'var(--r-full)',
      },
      boxShadow: {
        xs: 'var(--sh-xs)',
        sm: 'var(--sh-sm)',
        DEFAULT: 'var(--sh-md)',
        md: 'var(--sh-md)',
        lg: 'var(--sh-lg)',
        xl: 'var(--sh-xl)',
        // Nama lama tetap ada (dipakai main.css + DashboardView)
        panel: 'var(--sh-sm)',
        'panel-hover': 'var(--sh-md)',
        pop: 'var(--sh-xl)',
      },
      zIndex: {
        header: 'var(--z-header)',
        sidebar: 'var(--z-sidebar)',
        drawer: 'var(--z-drawer)',
        dropdown: 'var(--z-dropdown)',
        modal: 'var(--z-modal)',
        toast: 'var(--z-toast)',
        fab: 'var(--z-fab)',
      },
      /**
       * Kurva gerak diambil dari token CSS supaya transisi utilitas dan transisi
       * yang ditulis tangan di main.css memakai easing yang sama. `spring` dipertahankan
       * karena sudah dipakai ~30 tempat di view.
       */
      transitionTimingFunction: {
        DEFAULT: 'var(--ease-out)',
        in: 'var(--ease-in)',
        out: 'var(--ease-out)',
        'in-out': 'var(--ease-in-out)',
        spring: 'var(--ease-spring)',
        expo: 'var(--ease-expo)',
      },
    },
  },
  plugins: [],
};

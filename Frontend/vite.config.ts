import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
const hostAllowed = ['pkl.kan-ini.my.id'];

// Proxy /api ditiru di mode dev & preview: dev server Vite tidak ikut ter-bundle,
// sehingga serve hasil build butuh penerusan yang sama agar tidak jatuh ke SPA fallback.
const apiProxy = {
  '/api': {
    target: 'http://localhost:3000',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true, // dengar di semua interface supaya bisa dibuka dari HP di jaringan yang sama
    port: 5173,
    allowedHosts: hostAllowed,
    proxy: apiProxy,
  },
  preview: {
    host: true,
    port: 5173,
    allowedHosts: hostAllowed,
    proxy: apiProxy,
  },
});
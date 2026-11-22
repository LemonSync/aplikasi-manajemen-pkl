<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { extractErrorMessage } from '@/services/http';
import { env } from '@/config/env';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import FormField from '@/components/FormField.vue';
import AppIcon from '@/components/AppIcon.vue';
import { notify } from '@/composables/useNotify';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const identifier = ref('');
const password = ref('');
const loading = ref(false);

const FEATURES = [
  'Pendaftaran & verifikasi berkas',
  'Monitoring absensi GPS',
  'Rekap nilai & surat otomatis',
];

const submit = async (): Promise<void> => {
  notify.clear();
  loading.value = true;
  try {
    await auth.login(identifier.value, password.value);
    const redirect = (route.query.redirect as string) || '/';
    void router.push(redirect);
  } catch (e) {
    notify.error(extractErrorMessage(e));
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="flex min-h-screen bg-canvas">
    <!-- Panel brand -->
    <div
      class="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-gradient-to-br from-ink-900 via-ink-800 to-primary-900 p-12 lg:flex"
    >
      <div class="hero-glow pointer-events-none absolute inset-0" aria-hidden="true" />

      <div class="stagger relative flex items-center gap-3">
        <img
          src="/logo-smkn9.png"
          alt="Logo SMKN 9 Medan"
          class="h-10 w-10 rounded-none bg-white p-0.5 object-contain shadow-lg"
        />
        <div class="leading-tight">
          <p class="font-bold text-white">Manajemen PKL</p>
          <p class="text-xs text-ink-300">SMKN 9 Medan</p>
        </div>
      </div>

      <div class="stagger relative max-w-md">
        <h1 class="text-4xl font-bold leading-tight tracking-tight text-white">
          Satu sistem untuk seluruh alur PKL
        </h1>
        <p class="mt-4 text-ink-300">
          Pendaftaran, verifikasi surat, absensi, hingga penilaian — semuanya terkelola
          dalam satu tempat.
        </p>
        <div class="stagger mt-8 space-y-3">
          <div
            v-for="f in FEATURES"
            :key="f"
            class="flex items-center gap-3 text-sm text-ink-200"
          >
            <AppIcon name="checkCircle" :size="17" class="text-primary-400" />
            <span>{{ f }}</span>
          </div>
        </div>
      </div>

      <p class="relative text-xs text-ink-300">&copy; {{ new Date().getFullYear() }} {{ env.appName }}</p>
    </div>

    <!-- Form -->
    <div class="flex flex-1 items-center justify-center p-6">
      <div class="w-full max-w-sm animate-slide-up">
        <!-- Brand kecil (mobile) -->
        <div class="mb-8 flex items-center gap-3 lg:hidden">
          <img
            src="/logo-smkn9.png"
            alt="Logo SMKN 9 Medan"
            class="h-10 w-10 rounded-none bg-white p-0.5 object-contain shadow-sm"
          />
          <div class="leading-tight">
            <p class="font-bold text-ink-900">Manajemen PKL</p>
            <p class="text-xs text-ink-500">SMKN 9 Medan</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold tracking-tight text-ink-900">Masuk</h2>
        <p class="mt-1 text-sm text-ink-500">Gunakan akun Anda.</p>

        <form class="stagger mt-8 space-y-5" @submit.prevent="submit">
          <FormField label="Username / NISN / NIP" html-for="identifier">
            <input
              id="identifier"
              v-model="identifier"
              class="input h-11"
              type="text"
              autocomplete="username"
              placeholder="mis. superadmin"
              required
            />
          </FormField>

          <FormField label="Password" html-for="password">
            <input
              id="password"
              v-model="password"
              class="input h-11"
              type="password"
              autocomplete="current-password"
              placeholder="••••••••"
              required
            />
          </FormField>

          <button class="btn-primary h-11 w-full" type="submit" :disabled="loading">
            <LoadingSpinner v-if="loading" inline />
            {{ loading ? 'Memproses…' : 'Masuk' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

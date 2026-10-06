<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { extractErrorMessage } from '@/services/http';
import { env } from '@/config/env';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import AppIcon from '@/components/AppIcon.vue';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const identifier = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');

const submit = async (): Promise<void> => {
  error.value = '';
  loading.value = true;
  try {
    await auth.login(identifier.value, password.value);
    const redirect = (route.query.redirect as string) || '/';
    void router.push(redirect);
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="flex min-h-screen bg-ink-100">
    <!-- Panel brand -->
    <div class="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-ink-900 p-12 lg:flex">
      <div
        class="pointer-events-none absolute -right-24 -top-24 h-96 w-96 bg-primary-600/20 blur-3xl"
      />
      <div
        class="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 bg-primary-500/10 blur-3xl"
      />

      <div class="relative flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center bg-primary-600 text-base font-bold text-white">
          P
        </div>
        <div class="leading-tight">
          <p class="font-bold text-white">Manajemen PKL</p>
          <p class="text-xs text-ink-400">SMKN 9 Medan</p>
        </div>
      </div>

      <div class="relative max-w-md">
        <h1 class="text-4xl font-bold leading-tight tracking-tight text-white">
          Satu sistem untuk seluruh alur PKL
        </h1>
        <p class="mt-4 text-ink-300">
          Pendaftaran, verifikasi surat, absensi, jurnal, hingga penilaian — semuanya terkelola
          dalam satu tempat.
        </p>
        <div class="mt-8 space-y-3">
          <div v-for="f in ['Pendaftaran & verifikasi berkas', 'Monitoring absensi GPS & jurnal', 'Rekap nilai & surat otomatis']" :key="f" class="flex items-center gap-3 text-sm text-ink-200">
            <AppIcon name="checkCircle" :size="17" class="text-primary-400" />
            <span>{{ f }}</span>
          </div>
        </div>
      </div>

      <p class="relative text-xs text-ink-500">&copy; {{ new Date().getFullYear() }} {{ env.appName }}</p>
    </div>

    <!-- Form -->
    <div class="flex flex-1 items-center justify-center p-6">
      <div class="w-full max-w-sm animate-slide-up">
        <!-- Brand kecil (mobile) -->
        <div class="mb-8 flex items-center gap-3 lg:hidden">
          <div class="flex h-10 w-10 items-center justify-center bg-primary-600 text-base font-bold text-white">
            P
          </div>
          <div class="leading-tight">
            <p class="font-bold text-ink-900">Manajemen PKL</p>
            <p class="text-xs text-ink-500">SMKN 9 Medan</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold tracking-tight text-ink-900">Masuk</h2>
        <p class="mt-1 text-sm text-ink-500">Gunakan akun Anda.</p>

        <form class="mt-8 space-y-5" @submit.prevent="submit">
          <div>
            <label class="label" for="identifier">Username / NISN / NIP</label>
            <input
              id="identifier"
              v-model="identifier"
              class="input"
              type="text"
              autocomplete="username"
              placeholder="mis. superadmin"
              required
            />
          </div>

          <div>
            <label class="label" for="password">Password</label>
            <input
              id="password"
              v-model="password"
              class="input"
              type="password"
              autocomplete="current-password"
              placeholder="••••••••"
              required
            />
          </div>

          <p v-if="error" class="bg-red-50 px-3 py-2 text-sm text-red-700">
            {{ error }}
          </p>

          <button class="btn-primary w-full !py-2.5" type="submit" :disabled="loading">
            <LoadingSpinner v-if="loading" inline />
            {{ loading ? 'Memproses…' : 'Masuk' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

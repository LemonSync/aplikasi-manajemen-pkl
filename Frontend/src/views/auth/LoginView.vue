<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { extractErrorMessage } from '@/services/http';
import { env } from '@/config/env';

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
  <div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-700 to-primary-900 p-4">
    <div class="w-full max-w-md">
      <div class="card">
        <div class="mb-6 text-center">
          <h1 class="text-2xl font-bold text-gray-800">{{ env.appName }}</h1>
          <p class="mt-1 text-sm text-gray-500">Masuk menggunakan akun Anda</p>
        </div>

        <form class="space-y-4" @submit.prevent="submit">
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

          <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {{ error }}
          </p>

          <button class="btn-primary w-full" type="submit" :disabled="loading">
            {{ loading ? 'Memproses…' : 'Masuk' }}
          </button>
        </form>
      </div>
      <p class="mt-4 text-center text-xs text-primary-200">
        &copy; {{ new Date().getFullYear() }} {{ env.appName }}
      </p>
    </div>
  </div>
</template>

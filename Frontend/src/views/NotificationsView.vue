<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { notificationService, type NotificationRecord } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import LoadingSpinner from '@/components/LoadingSpinner.vue';

const notifications = ref<NotificationRecord[]>([]);
const loading = ref(true);
const error = ref('');

const load = async (): Promise<void> => {
  loading.value = true;
  try {
    notifications.value = await notificationService.listMine();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const markRead = async (id: string): Promise<void> => {
  try {
    await notificationService.markRead(id);
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

const markAllRead = async (): Promise<void> => {
  try {
    await notificationService.markAllRead();
    await load();
  } catch (e) {
    error.value = extractErrorMessage(e);
  }
};

onMounted(load);
</script>

<template>
  <div class="card">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-gray-800">Notifikasi</h2>
      <button class="btn-secondary text-sm" @click="markAllRead">Tandai Semua Dibaca</button>
    </div>
    <div v-if="error" class="mt-3 bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>
    <LoadingSpinner v-if="loading" />
    <div v-else class="mt-4 space-y-2">
      <div
        v-for="n in notifications"
        :key="n.id"
        class="flex items-start justify-between border p-3"
        :class="n.readAt ? 'bg-white' : 'bg-blue-50'"
      >
        <div>
          <h4 class="text-sm font-medium text-gray-800">{{ n.title }}</h4>
          <p class="text-xs text-gray-500">{{ n.body }}</p>
          <p class="mt-1 text-xs text-gray-400">{{ new Date(n.createdAt).toLocaleString('id-ID') }}</p>
        </div>
        <button v-if="!n.readAt" class="shrink-0 text-xs text-primary-600 hover:underline" @click="markRead(n.id)">
          Dibaca
        </button>
      </div>
      <div v-if="notifications.length === 0" class="py-4 text-center text-gray-400">Tidak ada notifikasi.</div>
    </div>
  </div>
</template>

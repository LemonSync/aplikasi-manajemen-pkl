<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { auditLogService, type AuditLogRecord } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';

const logs = ref<AuditLogRecord[]>([]);
const loading = ref(true);
const error = ref('');
const filterAction = ref('');

const load = async (): Promise<void> => {
  loading.value = true;
  try {
    const { items } = await auditLogService.list(filterAction.value ? { action: filterAction.value } : undefined);
    logs.value = items;
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div class="card">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">Audit Log</h2>
      <div v-if="error" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</div>

      <div class="mb-4 flex gap-4">
        <input v-model="filterAction" class="input w-64" placeholder="Filter action (e.g. LOGIN)" @keyup.enter="load" />
        <button class="btn-secondary" @click="load">Cari</button>
      </div>

      <div v-if="loading" class="text-sm text-gray-500">Memuat…</div>
      <table v-else class="table">
        <thead><tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Entity</th><th>ID</th></tr></thead>
        <tbody>
          <tr v-for="l in logs" :key="l.id">
            <td class="whitespace-nowrap">{{ new Date(l.createdAt).toLocaleString('id-ID') }}</td>
            <td>{{ l.actor?.username ?? '-' }}</td>
            <td><span class="badge bg-gray-100 text-gray-800">{{ l.action }}</span></td>
            <td>{{ l.entityType ?? '-' }}</td>
            <td class="max-w-[120px] truncate text-xs text-gray-500">{{ l.entityId ?? '-' }}</td>
          </tr>
          <tr v-if="logs.length === 0"><td colspan="5" class="py-4 text-center text-gray-400">Tidak ada audit log.</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

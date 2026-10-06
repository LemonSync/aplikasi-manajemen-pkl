<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { auditLogService, type AuditLogRecord } from '@/services/api.service';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import SkeletonTable from '@/components/SkeletonTable.vue';

const logs = ref<AuditLogRecord[]>([]);
const loading = ref(true);
const error = ref('');
const filterAction = ref('');
const active = ref<AuditLogRecord | null>(null);

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

const pretty = (v: unknown): string => {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
};

onMounted(load);
</script>

<template>
  <div class="card">
    <div class="mb-4 flex gap-4">
      <input v-model="filterAction" class="input w-64" placeholder="Filter aksi (LOGIN)" @keyup.enter="load" />
      <button class="btn-secondary" @click="load">Cari</button>
    </div>

    <SkeletonTable v-if="loading" :rows="8" :cols="5" />
    <table v-else class="table">
      <thead>
        <tr>
          <th>Waktu</th>
          <th>Aktor</th>
          <th>Aksi</th>
          <th>Entity</th>
          <th>ID</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="l in logs"
          :key="l.id"
          class="cursor-pointer hover:bg-gray-50"
          @click="active = l"
        >
          <td class="whitespace-nowrap">{{ new Date(l.createdAt).toLocaleString('id-ID') }}</td>
          <td>{{ l.actor?.username ?? '-' }}</td>
          <td><span class="badge bg-gray-100 text-gray-800">{{ l.action }}</span></td>
          <td>{{ l.entityType ?? '-' }}</td>
          <td class="max-w-[120px] truncate text-xs text-gray-500">{{ l.entityId ?? '-' }}</td>
        </tr>
        <tr v-if="logs.length === 0">
          <td colspan="5" class="py-4 text-center text-gray-400">Tidak ada audit log.</td>
        </tr>
      </tbody>
    </table>

    <Modal :open="!!active" title="Detail Log" size="md" @close="active = null">
      <template v-if="active">
        <div class="mb-4 space-y-1 text-sm">
          <div class="flex justify-between"><span class="text-gray-500">Waktu</span><span>{{ new Date(active.createdAt).toLocaleString('id-ID') }}</span></div>
          <div class="flex justify-between"><span class="text-gray-500">Aktor</span><span>{{ active.actor?.username ?? '-' }}</span></div>
          <div class="flex justify-between"><span class="text-gray-500">Aksi</span><span class="font-mono">{{ active.action }}</span></div>
          <div class="flex justify-between"><span class="text-gray-500">Entity</span><span>{{ active.entityType ?? '-' }} <span class="font-mono text-xs text-gray-400">{{ active.entityId ?? '' }}</span></span></div>
        </div>
        <div v-if="active.metadata">
          <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Metadata</div>
          <pre class="max-h-64 overflow-auto bg-gray-50 p-3 text-xs text-gray-700">{{ pretty(active.metadata) }}</pre>
        </div>
      </template>
    </Modal>
  </div>
</template>

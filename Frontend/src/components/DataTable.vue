<script setup lang="ts" generic="T extends object">
import { computed } from 'vue';
import EmptyState from './EmptyState.vue';
import SkeletonTable from './SkeletonTable.vue';

interface Column {
  key: string;
  label: string;
  /** Class sel — mis. `w-24` atau `text-right`. */
  class?: string;
  hidden?: boolean;
}

const props = withDefaults(
  defineProps<{
    columns: Column[];
    rows: T[];
    loading?: boolean;
    rowKey?: string;
    emptyTitle?: string;
    emptyDescription?: string;
    emptyIcon?: string;
  }>(),
  { loading: false, rowKey: 'id', emptyTitle: 'Belum ada data' }
);

const visible = computed(() => props.columns.filter((c) => !c.hidden));

const cell = (row: T, key: string): unknown => (row as Record<string, unknown>)[key];

const keyOf = (row: T, index: number): string | number => {
  const value = cell(row, props.rowKey);
  return typeof value === 'string' || typeof value === 'number' ? value : index;
};
</script>

<template>
  <div class="table-wrap">
    <table class="table">
      <thead>
        <tr>
          <th v-for="col in visible" :key="col.key" :class="col.class">{{ col.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td :colspan="visible.length" class="!px-3 !py-0">
            <SkeletonTable :cols="visible.length" />
          </td>
        </tr>
        <template v-else-if="rows.length">
          <tr v-for="(row, i) in rows" :key="keyOf(row, i)" :style="{ '--row-i': i }">
            <td v-for="col in visible" :key="col.key" :class="col.class">
              <slot :name="`cell-${col.key}`" :row="row" :value="cell(row, col.key)" :index="i">
                {{ cell(row, col.key) ?? '–' }}
              </slot>
            </td>
          </tr>
        </template>
        <tr v-else>
          <td :colspan="visible.length" class="!p-0">
            <slot name="empty">
              <EmptyState :icon="emptyIcon" :title="emptyTitle" :description="emptyDescription" />
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue';
import { useCountUp } from '@/composables/useCountUp';

const props = withDefaults(
  defineProps<{
    value: number;
    decimals?: number;
    prefix?: string;
    suffix?: string;
    duration?: number;
  }>(),
  { decimals: 0, prefix: '', suffix: '', duration: 850 }
);

const shown = useCountUp(toRef(props, 'value'), props.duration);

const text = computed(() =>
  shown.value.toLocaleString('id-ID', {
    minimumFractionDigits: props.decimals,
    maximumFractionDigits: props.decimals,
  })
);
</script>

<template>
  <span class="tabular-nums">{{ prefix }}{{ text }}{{ suffix }}</span>
</template>

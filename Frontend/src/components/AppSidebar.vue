<script setup lang="ts">
import { useRoute } from 'vue-router';
import AppIcon from '@/components/AppIcon.vue';
import { useCohortStore } from '@/stores/cohort.store';
import type { NavItem } from '@/config/nav';

defineProps<{
  sections: Array<{ section: string; items: NavItem[] }>;
  /** Drawer mobile menaruh pemilih gelombang di footer; desktop sudah punya di header. */
  cohortInFooter?: boolean;
}>();

const emit = defineEmits<{ navigate: [] }>();

const route = useRoute();
const cohortStore = useCohortStore();
</script>

<template>
  <!-- Brand -->
  <div class="flex h-16 shrink-0 items-center gap-3 border-b border-white/5 px-5">
    <img
      src="/logo-smkn9.png"
      alt="Logo SMKN 9 Medan"
      class="h-9 w-9 shrink-0 rounded-none bg-white p-0.5 object-contain shadow-sm transition-transform duration-300 ease-spring hover:scale-105"
    />
    <div class="leading-tight">
      <p class="text-sm font-bold tracking-tight text-white">Manajemen PKL</p>
      <p class="text-[11px] text-ink-300/70">SMKN 9 Medan</p>
    </div>
  </div>

  <!-- Nav -->
  <nav class="min-h-0 flex-1 overflow-y-auto px-3 py-2">
    <template v-for="(group, gi) in sections" :key="group.section">
      <p class="side-section">{{ group.section }}</p>
      <RouterLink
        v-for="item in group.items"
        :key="item.routeName"
        :to="{ name: item.routeName }"
        class="side-link group mb-0.5"
        :class="{ 'side-link-active': route.name === item.routeName }"
        :aria-current="route.name === item.routeName ? 'page' : undefined"
        :style="{ animationDelay: `${Math.min(gi * 3 + 1, 14) * 26}ms` }"
        @click="emit('navigate')"
      >
        <AppIcon
          :name="item.icon"
          :size="17"
          class="shrink-0 transition-transform duration-200 ease-spring group-hover:scale-110"
        />
        <span class="truncate">{{ item.label }}</span>
      </RouterLink>
    </template>
  </nav>

  <!-- Footer -->
  <div class="shrink-0 border-t border-white/5 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
    <div v-if="cohortInFooter && cohortStore.loaded && cohortStore.cohorts.length" class="mb-3">
      <label class="side-section !pt-0" for="drawer-cohort">Gelombang aktif</label>
      <select
        id="drawer-cohort"
        v-model="cohortStore.activeCohortId"
        class="input text-[13px]"
        @change="emit('navigate')"
      >
        <option v-for="c in cohortStore.cohorts" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
    </div>
    <div class="flex items-center gap-2 text-xs text-ink-300/65">
      <AppIcon name="shield" :size="14" />
      <span>Sistem PKL · v1.0</span>
    </div>
  </div>
</template>

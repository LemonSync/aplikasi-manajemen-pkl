import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { cohortService, pickActiveCohortId, type CohortRecord } from '@/services/api.service';

const STORAGE_KEY = 'activeCohortId';

/**
 * Store konteks gelombang global (Pinia).
 * Satu pemilih gelombang di header → semua menu membaca dari sini.
 * Default: gelombang berstatus OPEN; tersimpan di localStorage.
 */
export const useCohortStore = defineStore('cohort', () => {
  const cohorts = ref<CohortRecord[]>([]);
  const activeCohortId = ref<string>(localStorage.getItem(STORAGE_KEY) ?? '');
  const loaded = ref(false);
  const loading = ref(false);

  const activeCohort = computed<CohortRecord | null>(
    () => cohorts.value.find((c) => c.id === activeCohortId.value) ?? null
  );

  /** Muat daftar gelombang sekali (idempoten) + pastikan pilihan valid. */
  const ensureLoaded = async (): Promise<void> => {
    if (loaded.value || loading.value) return;
    loading.value = true;
    try {
      const { items } = await cohortService.list();
      cohorts.value = items;
      if (!activeCohortId.value || !items.some((c) => c.id === activeCohortId.value)) {
        activeCohortId.value = pickActiveCohortId(items);
      }
      loaded.value = true;
    } finally {
      loading.value = false;
    }
  };

  watch(activeCohortId, (v) => {
    if (v) localStorage.setItem(STORAGE_KEY, v);
  });

  return { cohorts, activeCohortId, activeCohort, loaded, loading, ensureLoaded };
});

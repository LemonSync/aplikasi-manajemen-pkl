<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { useCohortStore } from '@/stores/cohort.store';
import { authService } from '@/services/auth.service';
import { extractErrorMessage } from '@/services/http';
import Modal from '@/components/Modal.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import AppIcon from '@/components/AppIcon.vue';
import AppSidebar from '@/components/AppSidebar.vue';
import DropdownMenu from '@/components/DropdownMenu.vue';
import UserAvatar from '@/components/UserAvatar.vue';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { useReducedMotion } from '@/composables/useReducedMotion';
import { useRouteProgress } from '@/composables/useRouteProgress';
import { useRouteTransition } from '@/composables/useRouteTransition';
import { useScrollProgress } from '@/composables/useScrollProgress';
import { COHORT_SWITCH_ROLES, groupNavBySection, visibleNavItems } from '@/config/nav';
import { ROLE_LABELS } from '@/types';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const { active: progressActive, width: progressWidth } = useRouteProgress();
const pageTransition = useRouteTransition();
const { ratio: scrollRatio, scrolled: headerLifted, y: scrollY } = useScrollProgress();
const reducedMotion = useReducedMotion();

const showBackToTop = computed(() => scrollY.value > 420);

const scrollToTop = (): void => {
  window.scrollTo({ top: 0, behavior: reducedMotion.value ? 'auto' : 'smooth' });
};

const hasSidebar = computed(() => {
  if (auth.role !== 'SISWA') return true;
  return auth.phase === 'PKL_AKTIF' || auth.phase === 'PKL_SELESAI';
});

const visibleNav = computed(() => visibleNavItems(auth.role, auth.phase));

/** Kelompokkan nav berdasarkan section, pertahankan urutan. */
const navSections = computed(() => groupNavBySection(visibleNav.value));

const isStudentGuided = computed(() => auth.role === 'SISWA' && !hasSidebar.value);

const roleLabel = computed(() => (auth.role ? ROLE_LABELS[auth.role] : ''));

const handleLogout = async (): Promise<void> => {
  await auth.logout();
  void router.push({ name: 'login' });
};

// --- Drawer mobile ---
const drawerOpen = ref(false);
const drawerEl = ref<HTMLElement | null>(null);
useFocusTrap(drawerEl, drawerOpen);

const closeDrawer = (): void => {
  drawerOpen.value = false;
};

watch(() => route.path, closeDrawer);
watch(hasSidebar, (v) => {
  if (!v) closeDrawer();
});

const onDrawerKey = (e: KeyboardEvent): void => {
  if (e.key !== 'Escape' || !drawerOpen.value) return;
  // Jangan tutup drawer kalau yang ditekan sebenarnya ditujukan ke modal di atasnya.
  if (document.querySelector('.modal-overlay')) return;
  closeDrawer();
};
window.addEventListener('keydown', onDrawerKey);
onBeforeUnmount(() => window.removeEventListener('keydown', onDrawerKey));

// --- Konteks gelombang global ---
const cohortStore = useCohortStore();
const showCohortSwitch = computed(() => !!auth.role && COHORT_SWITCH_ROLES.includes(auth.role));
watch(
  showCohortSwitch,
  (v) => {
    if (v) void cohortStore.ensureLoaded();
  },
  { immediate: true }
);

// --- Ganti password ---
const showChangePassword = ref(false);
const cpCurrent = ref('');
const cpNew = ref('');
const cpConfirm = ref('');
const cpSaving = ref(false);
const cpError = ref('');
const cpSuccess = ref('');

const mustChangePassword = computed(() => auth.user?.mustChangePassword === true);

const openChangePassword = (): void => {
  cpCurrent.value = '';
  cpNew.value = '';
  cpConfirm.value = '';
  cpError.value = '';
  cpSuccess.value = '';
  showChangePassword.value = true;
  closeDrawer();
};

watch(mustChangePassword, (must) => {
  if (must) openChangePassword();
}, { immediate: true });

const submitChangePassword = async (): Promise<void> => {
  cpError.value = '';
  cpSuccess.value = '';
  if (cpNew.value !== cpConfirm.value) {
    cpError.value = 'Konfirmasi password tidak sama';
    return;
  }
  cpSaving.value = true;
  try {
    const updated = await authService.changePassword(cpCurrent.value, cpNew.value);
    auth.user = updated;
    cpSuccess.value = 'Password berhasil diganti.';
    setTimeout(() => {
      showChangePassword.value = false;
    }, 800);
  } catch (e) {
    cpError.value = extractErrorMessage(e);
  } finally {
    cpSaving.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen bg-canvas">
    <!-- Progres baca dokumen: tipis, tepat di atas header buram -->
    <div
      class="scroll-progress"
      :style="{ transform: `scaleX(${scrollRatio})` }"
      aria-hidden="true"
    />

    <div
      v-if="progressActive"
      class="route-progress"
      :style="{ width: progressWidth }"
      role="progressbar"
      aria-label="Memuat halaman"
    />

    <!-- ===== Sidebar desktop ===== -->
    <aside
      v-if="hasSidebar"
      class="fixed inset-y-0 left-0 z-sidebar hidden w-64 flex-col bg-primary-900 text-white lg:flex"
    >
      <AppSidebar :sections="navSections" />
    </aside>

    <!-- ===== Drawer mobile ===== -->
    <template v-if="hasSidebar">
      <Transition name="fade">
        <div v-if="drawerOpen" class="drawer-overlay lg:hidden" @click="closeDrawer" />
      </Transition>
      <aside
        ref="drawerEl"
        class="fixed inset-y-0 left-0 z-drawer flex w-[17rem] max-w-[85vw] flex-col bg-primary-900 text-white shadow-xl transition-transform duration-300 ease-spring lg:hidden"
        :class="drawerOpen ? 'translate-x-0' : '-translate-x-full'"
        :inert="drawerOpen ? undefined : 'true'"
        :aria-hidden="!drawerOpen"
        role="dialog"
        aria-modal="true"
        aria-label="Navigasi utama"
      >
        <button
          class="absolute right-3 top-4 flex h-9 w-9 items-center justify-center rounded-none text-ink-400 transition hover:bg-white/10 hover:text-white"
          aria-label="Tutup navigasi"
          @click="closeDrawer"
        >
          <AppIcon name="close" :size="18" />
        </button>
        <AppSidebar :sections="navSections" cohort-in-footer @navigate="closeDrawer" />
      </aside>
    </template>

    <!-- ===== Konten ===== -->
    <div :class="hasSidebar ? 'lg:pl-64' : ''">
      <header
        class="frosted sticky top-0 z-header flex h-16 items-center justify-between gap-3 border-b border-line px-4 pt-[env(safe-area-inset-top)] transition-shadow duration-300 ease-out sm:px-6"
        :class="headerLifted ? 'header-elevated' : ''"
      >
        <div class="flex min-w-0 items-center gap-2">
          <button
            v-if="hasSidebar"
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-none text-ink-600 transition hover:bg-ink-100 hover:text-ink-900 lg:hidden"
            aria-label="Buka navigasi"
            :aria-expanded="drawerOpen"
            @click="drawerOpen = true"
          >
            <AppIcon name="menu" :size="20" />
          </button>
          <h1
            :key="String(route.name)"
            class="animate-title flex min-w-0 items-center gap-2 text-[15px] font-bold tracking-tight text-ink-900"
          >
            <span class="h-4 w-[3px] shrink-0 bg-accent" aria-hidden="true" />
            <span class="truncate">{{ isStudentGuided ? 'Alur PKL Saya' : (route.meta.title ?? 'Dashboard') }}</span>
          </h1>
        </div>

        <div class="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <select
            v-if="showCohortSwitch && cohortStore.loaded"
            v-model="cohortStore.activeCohortId"
            class="input hidden h-9 max-w-[190px] py-1.5 text-[13px] sm:block"
            aria-label="Gelombang aktif"
          >
            <option v-for="c in cohortStore.cohorts" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>

          <RouterLink
            v-if="isStudentGuided && route.name !== 'student-workflow'"
            :to="{ name: 'student-workflow' }"
            class="rounded-md px-2 py-1 text-[13px] font-semibold text-primary-700 transition hover:bg-primary-50"
          >
            Alur
          </RouterLink>

          <RouterLink
            :to="{ name: 'notifications' }"
            class="flex h-10 w-10 items-center justify-center rounded-none text-ink-500 transition duration-200 ease-spring hover:bg-ink-100 hover:text-ink-800 active:scale-95"
            aria-label="Notifikasi"
            title="Notifikasi"
          >
            <AppIcon name="bell" :size="19" class="transition-transform duration-300 ease-spring hover:rotate-12" />
          </RouterLink>

          <!-- Menu user: sebelumnya hanya chip statis + tombol logout terpisah -->
          <DropdownMenu align="end" panel-class="w-56">
            <template #trigger>
              <span
                class="flex items-center gap-2 rounded-none border border-line bg-surface py-1 pl-1 pr-2 transition-[box-shadow,border-color] duration-200 ease-out hover:border-primary-300 hover:shadow-sm sm:pr-3"
              >
                <UserAvatar :seed="auth.user?.username" class="h-8 w-8 ring-1 ring-primary-200" />
                <span class="hidden leading-tight sm:block">
                  <span class="block max-w-[140px] truncate text-[13px] font-semibold text-ink-900">
                    {{ auth.user?.username }}
                  </span>
                  <span class="block text-[11px] font-medium text-ink-500">{{ roleLabel }}</span>
                </span>
                <AppIcon name="chevronDown" :size="14" class="text-ink-400" />
              </span>
            </template>
            <template #default="{ close }">
              <button class="menu-item" @click="close(), openChangePassword()">
                <AppIcon name="lock" :size="16" />
                Ganti Password
              </button>
              <div class="menu-sep" />
              <button class="menu-item menu-item-danger" @click="close(), handleLogout()">
                <AppIcon name="logout" :size="16" />
                Keluar
              </button>
            </template>
          </DropdownMenu>
        </div>
      </header>

      <main class="px-4 py-4 sm:px-6 sm:py-6">
        <!-- Pembungkus relativ: halaman lama yang keluar di-posisikan absolute di
             sini, bukan di main, agar tidak bergeser keluar padding konten. -->
        <div class="relative">
          <RouterView v-slot="{ Component }">
            <Transition :name="pageTransition" appear>
              <component :is="Component" />
            </Transition>
          </RouterView>
        </div>
      </main>
    </div>

    <!-- ===== Kembali ke atas ===== -->
    <Transition name="back-to-top">
      <button
        v-if="showBackToTop"
        type="button"
        class="back-to-top"
        aria-label="Kembali ke atas halaman"
        @click="scrollToTop"
      >
        <AppIcon name="chevronDown" :size="18" class="rotate-180" />
      </button>
    </Transition>

    <!-- ===== Modal Ganti Password ===== -->
    <Modal
      :open="showChangePassword"
      title="Ganti Password"
      size="sm"
      :busy="cpSaving"
      :dismissible="!mustChangePassword"
      @close="showChangePassword = false"
    >
      <div
        v-if="mustChangePassword"
        class="mb-4 rounded-md bg-warn-soft px-3 py-2 text-sm font-medium text-amber-700"
      >
        Password sementara. Wajib diganti sebelum melanjutkan.
      </div>
      <div v-if="cpError" class="mb-3 rounded-md bg-no-soft px-3 py-2 text-sm text-red-700">
        {{ cpError }}
      </div>
      <div v-if="cpSuccess" class="mb-3 rounded-md bg-ok-soft px-3 py-2 text-sm text-emerald-700">
        {{ cpSuccess }}
      </div>

      <div class="space-y-3">
        <div>
          <label class="label" for="cp-current">Password Lama</label>
          <input id="cp-current" v-model="cpCurrent" type="password" class="input" autocomplete="current-password" />
        </div>
        <div>
          <label class="label" for="cp-new">Password Baru</label>
          <input
            id="cp-new"
            v-model="cpNew"
            type="password"
            class="input"
            autocomplete="new-password"
            placeholder="Min. 8 karakter, huruf & angka"
          />
        </div>
        <div>
          <label class="label" for="cp-confirm">Ulangi</label>
          <input id="cp-confirm" v-model="cpConfirm" type="password" class="input" autocomplete="new-password" />
        </div>
      </div>

      <template #footer>
        <button v-if="!mustChangePassword" class="btn-secondary" @click="showChangePassword = false">
          Batal
        </button>
        <button
          class="btn-primary"
          :disabled="cpSaving || !cpCurrent || !cpNew || !cpConfirm"
          @click="submitChangePassword"
        >
          <LoadingSpinner v-if="cpSaving" inline />
          {{ cpSaving ? 'Menyimpan…' : 'Simpan' }}
        </button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--dur) var(--ease-out);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

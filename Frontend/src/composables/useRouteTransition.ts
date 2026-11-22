import { ref, type Ref } from 'vue';
import { useRouter } from 'vue-router';

export type PageTransitionName = 'page-forward' | 'page-back' | 'page-fade';

const depth = (path: string): number => path.split('/').filter(Boolean).length;

/**
 * Nama transisi untuk <Transition> pembungkus RouterView.
 *
 * Arah diambil dari kedalaman rute: masuk halaman anak bergerak maju (dari kanan),
 * kembali ke induk bergerak mundur (dari kiri). Dua halaman dengan kedalaman sama
 * memakai fade karena tidak ada cara jujur untuk menebak arahnya — nav sidebar,
 * tombol browser, dan link sesama level semuanya memberi kesan yang berbeda.
 */
export const useRouteTransition = (): Ref<PageTransitionName> => {
  const router = useRouter();
  const name = ref<PageTransitionName>('page-forward');

  router.beforeEach((to, from) => {
    if (to.path === from.path) return true;
    const delta = depth(to.path) - depth(from.path);
    name.value = delta > 0 ? 'page-forward' : delta < 0 ? 'page-back' : 'page-fade';
    return true;
  });

  return name;
};

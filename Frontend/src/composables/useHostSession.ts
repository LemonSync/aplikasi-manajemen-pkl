import { ref, watch, type Ref } from 'vue';

export type WorkflowMode = 'game' | 'classic';

/**
 * Preferensi tampilan alur PKL, disimpan per akun.
 *
 * Hanya DUA hal yang boleh diingat di sini: mode tampilan dan apakah sapaan
 * pembuka pernah dilihat. Progres tahap TIDAK disimpan — satu-satunya sumber
 * kebenaran tetap `GET /student/workflow`, jadi halaman tidak pernah menampilkan
 * tahap yang berbeda dari kenyataan di database.
 */
const MODE_KEY = (username: string) => `pkl-mode:${username}`;
const INTRO_KEY = (username: string) => `pkl-intro-seen:${username}`;

export const useHostSession = (username: Ref<string | undefined>) => {
  const readMode = (): WorkflowMode =>
    localStorage.getItem(MODE_KEY(username.value ?? 'anon')) === 'classic' ? 'classic' : 'game';
  const readIntro = (): boolean => localStorage.getItem(INTRO_KEY(username.value ?? 'anon')) === '1';

  const mode = ref<WorkflowMode>(readMode());
  const introSeen = ref(readIntro());

  // Nama user bisa baru tersedia beberapa saat setelah halaman dibuka
  // (`auth.fetchMe()`). Tanpa watch ini, preferensi dibaca dari kunci 'anon'
  // lalu tulisan berikutnya ikut ke sana — preferensi user A kebawa ke user B.
  watch(username, () => {
    mode.value = readMode();
    introSeen.value = readIntro();
  });

  watch(mode, (value) => {
    if (username.value) localStorage.setItem(MODE_KEY(username.value), value);
  });

  /** Tandai sapaan pembuka sudah pernah dilihat, agar tidak diulang tiap login. */
  const markIntroSeen = (): void => {
    introSeen.value = true;
    if (username.value) localStorage.setItem(INTRO_KEY(username.value), '1');
  };

  return { mode, introSeen, markIntroSeen };
};

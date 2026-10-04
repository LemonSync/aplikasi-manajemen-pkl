import { ref } from 'vue';

export interface GeoPosition {
  lat: number;
  long: number;
  accuracy: number;
}

/**
 * Composable untuk mengambil posisi GPS via Geolocation API browser.
 * Menangani error umum (izin ditolak, timeout, tidak didukung).
 */
export function useGeolocation() {
  const position = ref<GeoPosition | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const locate = (): Promise<GeoPosition> =>
    new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        error.value = 'Perangkat/browser tidak mendukung GPS.';
        reject(new Error(error.value));
        return;
      }
      loading.value = true;
      error.value = null;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          loading.value = false;
          const result: GeoPosition = {
            lat: pos.coords.latitude,
            long: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          position.value = result;
          resolve(result);
        },
        (err) => {
          loading.value = false;
          let msg = 'Gagal mengambil lokasi.';
          if (err.code === err.PERMISSION_DENIED) msg = 'Izin lokasi ditolak. Aktifkan GPS & izin lokasi.';
          else if (err.code === err.POSITION_UNAVAILABLE) msg = 'Informasi lokasi tidak tersedia.';
          else if (err.code === err.TIMEOUT) msg = 'Waktu pengambilan lokasi habis. Coba lagi.';
          error.value = msg;
          reject(new Error(msg));
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });

  return { position, loading, error, locate };
}

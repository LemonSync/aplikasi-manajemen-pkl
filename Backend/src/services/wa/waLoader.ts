/**
 * Fork `@yudzxml/baileys` hanya ESM sementara Backend dikompilasi ke CommonJS,
 * tempat `require()` gagal dan TypeScript mengubah `import('...')` jadi `require()`.
 * `new Function` menahan `import()` agar di-evaluasi Node sebagai dynamic import asli.
 */
const dynamicImport = new Function('spec', 'return import(spec)') as (
  spec: string
) => Promise<any>;

/** Ketik longgar: API Baileys (ESM) tidak ikut dikompilasi di sini. */
export type BaileysModule = any;

let cached: Promise<BaileysModule> | null = null;

/** Impor sekali, cache dipakai seluruh proses. */
export const loadBaileys = (): Promise<BaileysModule> => {
  if (!cached) cached = dynamicImport('@yudzxml/baileys');
  return cached;
};

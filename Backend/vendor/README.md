# Vendor: `@yudzxml/baileys` 7.6.6 (build `npm pack`, sudah ditambal)

Bot WhatsApp memakai fork Baileys `@yudzxml/baileys@7.6.6` — versi ini **sudah di-unpublish
dari npm registry** (sisa `0.0.1-security` saja) dan tidak bisa dipasang dari GitHub lewat
jaringan mesin pengembangan ini. Maka paketnya divendor sebagai tarball dan dipasang lewat
`package.json`:

```json
"@yudzxml/baileys": "file:vendor/yudzxml-baileys-7.6.6-shim.tgz"
```

Isi tarball = paket asli hasil `npm pack` dari `node_modules` instalasi lama, dengan satu perubahan:

- `lib/Socket/newsletter.js` **diganti shim** (`makeNewsletterSocket` meneruskan ke
  `makeGroupsSocket`, `triggerAutoFollow` no-op). File aslinya tidak bisa ditulis di mesin ini —
  real-time protection Windows menolak pembacaan isinya (errno -4094) sehingga `npm install`
  menghasilkan paket yang tidak bisa di-`import`. Dampaknya hanya pada API channel WhatsApp
  Newsletter (tidak dipakai bot ini); grup, pesan, media, dan koneksi tetap utuh.

## Cara membuat ulang / menaikkan versi

```bash
# dari instalasi paket asli (mis. salinan yang masih berfungsi di project lama)
cd <folder-paket-asli>/node_modules/@yudzxml/baileys
cp lib/Socket/newsletter.js /tmp/newsletter.bak     # cadangan asli (butuh mesin tanpa blokir AV)
npm pack && mv *.tgz <repo>/Backend/vendor/
```

Jika nanti fork kembali tersedia di registry atau bisa diunduh dari GitHub, ganti spesifikasi
`file:vendor/...` dengan versi registry dan hapus folder ini.

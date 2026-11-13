# AGENTS.md — SalmanForensik

Aturan umum agen (berpikir sebelum coding, kesederhanaan dulu, perubahan bedah saja, tanpa halusinasi, verifikasi kerja, konfirmasi aksi destruktif, laporan jujur) berlaku penuh. Acuan produk: `docs/SPESIFIKASI.md` (v1.0 terkunci) — bila kode dan spek bertentangan, spek yang menang; perubahan keputusan terkunci butuh konfirmasi Ricco dulu.

## Invarian proyek (tidak boleh dilanggar)

1. **100% client-side.** Dilarang menambahkan panggilan jaringan apa pun untuk data dokumen (tidak ada fetch/XHR/beacon berisi data pengguna). Semua pustaka di-vendor lokal di `vendor/`, tidak ada CDN runtime.
2. **Tidak ada penyimpanan data dokumen.** Dilarang menulis dokumen/hasil/isi formulir ke localStorage, sessionStorage, IndexedDB, cookie, atau Service Worker. Satu-satunya pengecualian: preferensi tema (`sf-theme`) di localStorage.
3. **Kosakata kesimpulan terkunci.** Hanya 4 kategori spek Bagian 13.2. Dilarang menulis dokumen "ASLI"/"PALSU" di UI, laporan, atau README. Dilarang QR verifikasi.
4. **Bahasa antarmuka & laporan: Bahasa Indonesia.** Istilah teknis forensik boleh Inggris dengan penjelasan.
5. **Kredit persis:** "created by Ricco Abu Salman" (tanpa tanda kurung) di footer aplikasi dan laporan.
6. **Tema:** Terang/Gelap/Otomatis (default Otomatis), token warna macOS sesuai spek Bagian 16.2. Laporan cetak selalu mode terang.
7. File asli pengguna tidak pernah diubah; analisis bekerja pada salinan ArrayBuffer di memori.

## Perintah

- **Jalankan lokal:** `python3 -m http.server 8000` di root repo, buka `http://localhost:8000`
- **Tes:** `node tests/run-tests.mjs` (logika murni diekstrak agar dapat dites di Node)
- **Deploy:** GitHub Pages dari branch `main` folder root (statis, tanpa build step)

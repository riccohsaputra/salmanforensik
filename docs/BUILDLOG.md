# Build Log — SalmanForensik
- 2026-11-13: Delegasi OpenCode (SOP) dicoba dengan model gratis glm-5.3-flash-free lalu deepseek-v4.1-flash-free.
  Keduanya gagal SEBELUM mulai: "Free usage limit reached" (limit akun free tier OpenCode).
  Sesuai SOP, pembangunan diambil alih langsung oleh Rumi dengan standar QC yang sama.
- 2026-11-13: Aplikasi dibangun langsung oleh Rumi: index.html + assets/theme.css (token macOS),
  assets/core.js (aturan umur/kesimpulan/rujukan), assets/engine.js (parser PDF/DOCX/XLSX/gambar),
  assets/app.js (pipeline 8 tahap, pembanding, laporan). Vendor lokal: JSZip 3.10.1, exifr 7.1.3,
  pdf.js 3.11.174 (tanpa CDN runtime).
- Tes: core 22/22 lulus (node tests/run-tests.mjs). Engine 12/12 lulus atas korpus sintetis
  (node tests/engine-tests.mjs): PDF asli vs ModDate mundur (U-01), DOCX bersih vs mundur (U-01),
  XLSX nilai ditimpa (XL-02 kritis), JPEG EXIF lengkap. Bug U-07 (Math.max atas objek bukti)
  ditemukan tes dan diperbaiki + fmtWIB diperkeras terhadap tanggal invalid.
- Catatan harness: JSZip async() menggantung di realm jsdom — artefak lingkungan tes, bukan aplikasi.
- 2026-11-13 (perbaikan pasca-uji live): crash "reading 'role'" pada XLSX hasil openpyxl —
  core.xml-nya menulis ISO cacat "...+00:00Z" sehingga parse gagal dan bukti waktu null lolos.
  Perbaikan: parseAnyDate menormalkan offset+Z; engine menyaring bukti null di semua parser;
  app & evaluateAgeRules diperkeras. Tes regresi ditambah: total core 23/23, engine 14/14.
- 2026-11-13 (revisi UI atas permintaan Ricco): switcher tema segmented (Terang/Gelap/Otomatis)
  diganti satu tombol ikon bulat — ☀️ Terang, 🌙 Gelap, ◐ Otomatis — tiap ketuk memutar
  Terang → Gelap → Otomatis; preferensi tetap di localStorage "sf-theme", default Otomatis.
  Dikerjakan Antigravity (Gemini 3.8 Flash High) setelah OpenCode hang tanpa hasil;
  diff direview baris demi baris oleh Rumi, tes tetap core 23/23 + engine 14/14,
  siklus tombol diuji klik di browser headless (Playwright + Chromium).
- 2026-11-17 (revisi PF-04, ACC Ricco): uji lapangan dokumen resmi asli (ST/SPPD bertanda
  tangan elektronik CAdES) menghasilkan false positive PF-04 — baris label formulir
  (tebal+reguler), cap e-sign, dan font templat resmi terbaca sebagai "baris multi-font".
  PF-04 ditulis ulang berbasis pola segmen font per baris: dihitung hanya pergantian font
  di tengah baris (A-B-A) atau di ekor baris; dikecualikan pola label/judul, baris berlabel
  ':' (termasuk baris tabel tergabung), segmen 1 karakter (glyph tanda kutip), baris cap
  tanda tangan elektronik, dan kolom terpisah jauh. Verifikasi E2E di browser lokal:
  dokumen asli → "Tidak ditemukan indikasi signifikan" (PF-04 hilang, PF-02/PF-06 tetap);
  PDF sintetis sisipan font beda keluarga → PF-04 tetap memicu tepat 1 baris; korpus PDF
  tanggal mundur → tetap "Indikasi kuat" via U-01. Tes Node: core 23/23, engine 14/14.
- 2026-11-17 (integrasi pembanding, ACC Ricco): audit menemukan hasil perbandingan (relasi
  + diff teks) tidak pernah menjadi temuan — kesimpulan & laporan PDF mengabaikannya,
  sehingga berkas editan vs aslinya pun berkesimpulan "Tidak ditemukan indikasi signifikan".
  Perbaikan di compare(): PB-01 (isi berbeda dari pembanding, suspicious, memuat segmen
  berbeda), PB-02 (kesamaan kata <25% → sangat berbeda / kemungkinan bukan dokumen yang
  sama, suspicious), PB-03 (hash identik, info); similarity disimpan & laporan PDF kini
  memuat bagian "Hasil pembanding". Verifikasi E2E 4 kasus: edit-vs-asli → Indikasi lemah
  (PB-01); beda dokumen total → Indikasi lemah (PB-02); tanpa pembanding → tidak berubah;
  berkas identik → PB-03 info. Tes Node tetap hijau (core 23/23, engine 14/14).
- 2026-11-17 (tema terang "Gentleman", permintaan Ricco): palet schemecolor.com/gentleman
  diterapkan ke tema TERANG saja (gelap tidak berubah): bg Cassius terang #EDE8DB, kartu
  ivory #FBF9F4, teks indigo-gelap, aksen Indigo Ocean #4A577D (tombol, kicker, wordmark),
  badge privasi & banner "bersih" Amulet #809980/#5C7A5C, banner lemah ochre #B07D2B,
  banner kuat bata muted #A63D40, banner bukti-kurang Indigo Ocean, banner proses Mystic
  Blue #716DAB, hover dropzone Travel #8ABEC7. Warna tetap FLAT (tanpa gradasi).

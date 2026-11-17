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
- 2026-11-17 (tema gelap "Moon Mist", permintaan Ricco): palet schemecolor.com/moon-mist
  diterapkan ke tema GELAP saja: bg Galaxy Black #2A2A2A, kartu Gravity #484B53, teks
  Apple White #E4DED2, teks sekunder & aksen Azure Grey #AFB8C9 (tombol jadi azure
  dengan teks gelap), wordmark Apple White, hairline/chip turunan Azure; warna semantik
  dimuted ala kabut (sage #8FA98F, amber #C99A5B, merah dusty #C4737A); input lebih gelap
  dari kartu. Banner kesimpulan tetap keluarga Gentleman (flat, terbaca di dua tema).
- 2026-11-17 (fix keterbacaan, laporan Ricco): tombol "Hapus Sesi" (.btn.danger) di tema
  gelap nyaris tak terbaca — merah dusty di atas Galaxy Black. Di tema gelap kini teks
  #EDA3A9 + latar tint merah + border lebih tegas; status disabled opacity dinaikkan.
- 2026-11-17 (Fase 1: validasi kriptografis tanda tangan, ACC Ricco; dibangun
  Antigravity dari brief docs/brief-fase1-sig.md, DIREVIEW & dikoreksi Rumi):
  modul baru assets/sig.js — parser ASN.1/DER + CMS tulisan tangan, WebCrypto.
  Uji integritas ByteRange vs messageDigest, verifikasi tanda tangan RSA/ECDSA,
  identitas penanda tangan + penerbit + masa berlaku sertifikat, waktu TSA,
  rantai sertifikat. Temuan SG-01 (integritas gagal, kritis), SG-02 (ttd tidak
  valid, kritis), SG-03 (terverifikasi, info), SG-04 (SHA-1), SG-05 (sertifikat
  kedaluwarsa/belum berlaku), SG-06 (jangkauan berkas). Koreksi supervisor:
  (1) OID hash tak dikenal TIDAK lagi ditebak SHA-256 (cegah SG-01 palsu);
  (2) kegagalan proses algoritma tak didukung (RSA-PSS/SHA-224) = "tidak dapat
  dipastikan", bukan SG-02; (3) SG-06 dikalibrasi: hanya dari ttd jangkauan
  terakhir, dan jadi INFO bila integritas terbukti utuh (kasus nyata BSrE:
  dokumen asli ditambah penggabungan SPPD sesudah penandatanganan);
  (4) jendela pencarian /M & /SubFilter diperlebar melewati blob /Contents
  (kasus BSrE jaraknya ±65 KB). Verifikasi E2E dokumen BSrE asli (SAFARI
  Kemenag, BSRE CA DS G1, Root CA Indonesia DS G1): integritas utuh + ttd valid
  + kesimpulan bersih; salinan diubah 1 byte → SG-01 kritis → "Indikasi kuat".
  Tes: core 23/23, engine 14/14, sig 25/25 (suite baru tests/sig-tests.mjs,
  fixture bertanda tangan sungguhan via openssl: RSA, ECDSA, SHA-1, tamper).
- 2026-11-17 (Fase 2: OCR dokumen pindaian, ACC Ricco; dibangun Antigravity dari
  brief docs/brief-fase2-ocr.md, DIREVIEW Rumi): modul assets/ocr.js memuat
  Tesseract.js v5 lazy dari CDN jsDelivr (biner WASM/traineddata tidak dapat
  terbit via jalur rilis teks) — pengenalan 100% lokal di WASM, dokumen tidak
  dikirim ke server; batasan ini ditulis eksplisit di Metodologi, laporan, dan
  JSON. Pemicu: PDF tanpa lapisan teks (<20 karakter) dirender skala 2 dan
  di-OCR maks 5 halaman (ind+eng); gambar tersangka juga di-OCR. Hasil masuk
  out.text (textSource "ocr") sehingga mode pembanding & aturan teks bekerja
  untuk dokumen scan; temuan OC-01 info + penalti cakupan 5%. E2E Rumi
  (CDN diintersep ke salinan byte-identik karena Chromium VM tak punya egress
  langsung): scan editan fiksi vs asli teks → PB-01 tertangkap dari teks OCR;
  scan asli sendiri → OC-01 saja, tanpa temuan palsu. Tes tetap hijau
  (23/23, 14/14, 25/25). Addendum spek ditambahkan di docs/SPESIFIKASI.md.
- 2026-11-17 (warna tombol utama, permintaan Ricco): tombol primer (.btn: Mulai
  Pemeriksaan, Unduh Laporan PDF) kini memakai warna tetap #0FA985 dengan teks
  putih di KEDUA tema (token --btn/--btn-text), lepas dari --accent palet.
  Override teks gelap .btn khusus Moon Mist dihapus (sudah tidak relevan).

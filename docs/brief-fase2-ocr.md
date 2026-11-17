# Brief Fase 2 — OCR untuk Dokumen Hasil Scan (untuk agen pelaksana)

Baca dulu `AGENTS.md` di root proyek dan patuhi invarian di sana (UI Bahasa
Indonesia, kata kesimpulan terkunci, perubahan bedah, tes Node tetap hijau).
Konteks: SalmanForensik web app statis vanilla JS. Fase 1 (validasi tanda
tangan, `assets/sig.js`) sudah selesai — jangan sentuh sig.js.

## Keputusan arsitektur (sudah ditetapkan, jangan diubah)
- Mesin OCR = **Tesseract.js v5**, dimuat **lazy dari CDN jsDelivr** hanya saat
  dokumen scan terdeteksi. Alasan: biner WASM/traineddata tidak bisa ikut
  terbit lewat jalur rilis teks repo ini. Dokumen pengguna TIDAK dikirim ke
  mana pun — pengenalan berjalan lokal di WASM setelah pustaka terunduh.
  Konsekuensi ini WAJIB ditulis jujur di UI/Metodologi (lihat bawah).
- URL persis:
  - skrip: `https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js`
  - workerPath: `https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js`
  - corePath: `https://cdn.jsdelivr.net/npm/tesseract.js-core@5`
  - langPath: `https://tessdata.projectnaptha.com/4.0.0`
  - bahasa: `ind+eng`
- Batas screening: maks **5 halaman** per dokumen; render PDF pada skala 2.

## Implementasi — berkas baru `assets/ocr.js`
IIFE, expose `global.SFOCR = { recognizePdf(pdfDoc), recognizeImage(buf, kind), isLoaded }`:
- `loadTesseract()`: suntik `<script>` CDN sekali saja (promise singleton);
  bila gagal (offline/CDN tak terjangkau) lempar Error berpesan jelas.
- `recognizePdf(pdfDoc)`: untuk halaman 1..min(numPages, 5): render ke canvas
  skala 2 via `page.getViewport({ scale: 2 })` + `page.render(...)`, lalu
  `Tesseract.recognize(canvas, "ind+eng", { workerPath, corePath, langPath })`.
  Gabung teks semua halaman; kumpulkan rerata `data.confidence`. Laporkan
  progres lewat `global.SFProgress?.("OCR halaman i dari n…")` bila tersedia.
  Kembalikan `{ text, confidence, pages, capped }`.
- `recognizeImage(buf, kind)`: buat blob URL dari buf, `Tesseract.recognize`
  pada URL itu; kembalikan `{ text, confidence, pages: 1, capped: false }`.
- Semua kegagalan ditangkap pemanggil — OCR tidak boleh menggagalkan analisis.

## Integrasi — `assets/engine.js`
- `analyzePdf`: sesudah ekstraksi teks pdf.js, bila `(out.text || "").trim().length < 20`
  DAN `out.pageCount > 0` DAN `global.SFOCR` tersedia: panggil
  `SFOCR.recognizePdf(pdf)`. Bila teks OCR ≥ 20 karakter: `out.text = ocr.text`,
  `out.textSource = "ocr"`, tambahkan temuan:
  - OC-01 `info`, kategori "konten": judul "Teks dokumen diperoleh lewat OCR
    (dokumen hasil pindaian)"; observed: jumlah halaman ter-OCR (+ catatan bila
    dibatasi 5), rerata kepercayaan OCR; penjelasan: dokumen tidak memiliki
    lapisan teks sehingga analisis font/metadata internal terbatas; teks OCR
    dapat mengandung kesalahan baca sehingga temuan berbasis teks perlu
    ditafsirkan hati-hati.
  - `out.coveragePenalty = (out.coveragePenalty || 0) + 0.05`.
  Bila OCR gagal: `out.moduleNotes.push("OCR tidak tersedia: " + pesan)` —
  jangan lempar.
- `analyzeImage`: bila `global.SFOCR` tersedia, panggil `recognizeImage`;
  teks hasil disimpan ke `out.text` + `out.textSource = "ocr"` + temuan OC-01
  versi gambar (1 halaman). Kegagalan → moduleNotes, jangan lempar.
- `baseResult`: tambah `textSource: "native"` bawaan.
- `index.html`: tambah `<script src="assets/ocr.js"></script>` sebelum engine.js.

## Integrasi — `assets/app.js`
- Definisikan `global.SFProgress` di awal app.js: fungsi yang memperbarui
  `#progress-label` (jaga teks tahap dengan awalan, mis. menimpa label saat
  pipeline berjalan — cukup `label.textContent = msg` bila elemen ada).
- Teks batasan (tab Metodologi & bagian batasan laporan cetak & ekspor JSON):
  hapus "OCR foto dokumen" dari daftar tidak-diperiksa. Ganti dengan kalimat
  akurat: "OCR tersedia untuk dokumen pindaian (maks 5 halaman) memakai mesin
  Tesseract.js yang dimuat dari CDN saat dibutuhkan — dokumen tetap diproses
  lokal di peramban dan tidak dikirim ke server; tanpa koneksi internet OCR
  tidak dapat dimuat." Sesuaikan juga daftar "Tidak diperiksa" di tempat lain
  bila ada (grep "OCR" di seluruh repo dan rapikan semua kemunculannya,
  termasuk index.html bila statis).
- Pembanding tidak perlu diubah: ia memakai `res.text` apa pun sumbernya.
  Namun pada tab Pembanding/Ringkasan, bila `res.textSource === "ocr"`,
  tampilkan catatan kecil "Teks tersangka berasal dari OCR" (satu baris teks
  muted di kartu ringkasan hasil pembanding cukup — lokasi persisnya ikuti
  struktur yang ada, perubahan minimal).

## Batasan kerja
- Jangan mengubah aturan temuan lain, kesimpulan, tema, sig.js, atau core.js.
- `node --check` semua berkas diubah; `node tests/run-tests.mjs`,
  `node tests/engine-tests.mjs`, `node tests/sig-tests.mjs` tetap hijau
  (23/23, 14/14, 25/25). Tes Node tidak memiliki DOM/Tesseract — pastikan
  engine.js TIDAK rusak di Node (guard `typeof document` untuk jalur canvas
  tidak diperlukan bila OCR hanya dipanggil dari analyzePdf yang di Node
  memang tidak menjalankan pdf.js; cukup pastikan tidak ada referensi
  SFOCR yang melempar saat undefined).
- Di akhir, tulis ringkasan perubahan: berkas diubah + keputusan teknis di
  luar brief.
